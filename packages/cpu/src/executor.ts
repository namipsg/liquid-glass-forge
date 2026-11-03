import { createSource, validateSource } from '@liquid-glass-forge/core';
import type { FrameDescriptor, PixelSource } from '@liquid-glass-forge/core';
import { snapshotCpuEffects, CPU_LOOKUP_BYTES, cpuKernelStorageBytes, CPU_GEOMETRY_MAX_BYTES } from './kernel.js';
import type { CpuEffects } from './kernel.js';
import { checkedFrame, runCpuBatch, CpuBatchSession } from './protocol.js';
import type { BatchPixels, CpuTimings, CpuWork } from './protocol.js';

export class CpuError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = 'CpuError'; }
}
/** Active-only deadline delivery. No idle timers/messages; lazy ports close on disposal. */
export class CpuDeadlineScheduler {
  #channel: MessageChannel | undefined; #generation = 0; #disposed = false;
  #active: { id: number; check: () => void } | undefined;
  #cancel: ((cause: unknown) => void) | undefined;
  waitUntil(deadline: number, signal?: AbortSignal): Promise<number> {
    if (this.#disposed) return Promise.reject(new CpuError('DISPOSED', 'Deadline scheduler disposed'));
    if (typeof deadline !== 'number' || !Number.isFinite(deadline) || deadline < 0 || deadline > performance.now() + 60000) return Promise.reject(new CpuError('INVALID_OPTIONS', 'Invalid deadline'));
    if (signal !== undefined && (!signal || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) return Promise.reject(new CpuError('INVALID_OPTIONS', 'Invalid deadline signal'));
    if (signal?.aborted) return Promise.reject(signal.reason);
    this.#cancel?.(new CpuError('SUPERSEDED', 'Deadline wait superseded'));
    if (deadline <= performance.now()) return Promise.resolve(0);
    const id = ++this.#generation, start = performance.now();
    return new Promise<number>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined, done = false;
      const finish = (cause?: unknown) => {
        if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (this.#active?.id === id) { this.#active = undefined; this.#cancel = undefined; }
        if (cause !== undefined) reject(cause); else resolve(performance.now() - start);
      };
      const abort = () => finish(signal?.reason ?? new CpuError('ABORTED', 'Deadline wait aborted'));
      const check = () => {
        if (done) return;
        clearTimeout(timer); timer = undefined;
        if (signal?.aborted) { abort(); return; }
        const remaining = deadline - performance.now();
        if (remaining <= 0) { finish(); return; }
        if (remaining > 4 || typeof MessageChannel !== 'function') {
          timer = setTimeout(check, Math.max(1, Math.floor(remaining - 1))); return;
        }
        if (!this.#channel) {
          this.#channel = new MessageChannel();
          this.#channel.port1.onmessage = event => { const active = this.#active; if (active && active.id === event.data) active.check(); };
        }
        this.#channel.port2.postMessage(id);
      };
      this.#active = { id, check }; this.#cancel = finish;
      signal?.addEventListener('abort', abort, { once: true }); check();
    });
  }
  dispose(): void {
    if (this.#disposed) return; this.#disposed = true;
    this.#cancel?.(new CpuError('DISPOSED', 'Deadline scheduler disposed'));
    const channel = this.#channel; this.#channel = undefined;
    if (channel) {
      channel.port1.onmessage = null;
      try { channel.port1.close(); } catch { /* Close the other port independently. */ }
      try { channel.port2.close(); } catch { /* No new messages are posted after disposal. */ }
    }
  }
}
export interface CpuWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}
export interface CpuExecutorOptions {
  readonly cacheSources?: boolean; readonly worker?: 'auto' | 'required' | 'off'; readonly workerFactory?: () => CpuWorker;
  readonly timeoutMs?: number; readonly maxPoolBytes?: number; readonly maxOwnedBytes?: number;
}
export interface CpuBatch extends BatchPixels { release(): void }
interface Job {
  id: number; source: PixelSource | undefined; frame: FrameDescriptor; effects: CpuEffects | undefined; reserved: number; snapshotMs: number;
  signal: AbortSignal | undefined; abort: (() => void) | undefined; cancelled: boolean; settled: boolean;
  notBefore: number; onStart: ((startedAt: number) => void) | undefined; cancelWait: (() => void) | undefined;
  resolve: (value: CpuBatch) => void; reject: (cause: unknown) => void;
}
function integer(value: number, low: number, high: number): boolean { return Number.isSafeInteger(value) && value >= low && value <= high; }

/** No eager worker or idle clock. Each accepted request snapshots borrowed input before yielding. */
export class CpuExecutor {
  readonly #options: Required<Omit<CpuExecutorOptions, 'workerFactory'>> & Pick<CpuExecutorOptions, 'workerFactory'>;
  #cache = new CpuBatchSession(); #workerCachedBytes = 0;
  #scheduler = new CpuDeadlineScheduler();
  #worker: CpuWorker | undefined; #broken = false; #disposed = false; #fallback: string | undefined;
  #active: Job | undefined; #pending: Job | undefined; #id = 0;
  #latest: FrameDescriptor | undefined;
  #pool: Uint8ClampedArray[] = []; #poolBytes = 0; #inputPool: Uint8Array[] = [];
  #leased = 0; #reserved = 0; #lost = 0; #remote = 0;
  #completed = 0; #discarded = 0; #execution: 'main' | 'worker' = 'main';
  #workerReject: ((cause: unknown) => void) | undefined;
  constructor(options: CpuExecutorOptions = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new CpuError('INVALID_OPTIONS', 'Invalid CPU executor options');
    const worker = options.worker === undefined ? 'auto' : options.worker, timeoutMs = options.timeoutMs === undefined ? 5000 : options.timeoutMs;
    const maxOwnedBytes = options.maxOwnedBytes === undefined ? 64 * 1024 * 1024 : options.maxOwnedBytes, maxPoolBytes = options.maxPoolBytes === undefined ? Math.min(8 * 1024 * 1024, maxOwnedBytes) : options.maxPoolBytes;
    if (!options || typeof options !== 'object' || Object.keys(options).some(k => !['cacheSources', 'worker', 'workerFactory', 'timeoutMs', 'maxOwnedBytes', 'maxPoolBytes'].includes(k)) ||
        !['auto', 'required', 'off'].includes(worker) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
        !integer(maxOwnedBytes, 1, 256 * 1024 * 1024) || !integer(maxPoolBytes, 0, maxOwnedBytes) ||
        (options.workerFactory !== undefined && typeof options.workerFactory !== 'function')) throw new CpuError('INVALID_OPTIONS', 'Invalid CPU executor options');
    if(options.cacheSources!==undefined&&typeof options.cacheSources!=='boolean')throw new CpuError('INVALID_OPTIONS','Invalid source cache policy');
    this.#options = { ...options, cacheSources: options.cacheSources ?? false, worker, timeoutMs, maxOwnedBytes, maxPoolBytes };
  }
  get diagnostics() {
    return Object.freeze({ execution: this.#execution, inFlight: this.#active ? 1 : 0, pending: this.#pending ? 1 : 0,
      mainCachedBytes: this.#cache.storageBytes, workerCachedBytes: this.#workerCachedBytes,
      sharedKernelBytes: cpuKernelStorageBytes(), fixedKernelReservationBytes: CPU_LOOKUP_BYTES * (this.#options.worker === 'off' ? 1 : 2),
      pooledBytes: this.#poolBytes + this.#inputPoolBytes(), inputPooledBytes: this.#inputPoolBytes(), inputPooledBuffers: this.#inputPool.length,
      leasedBytes: this.#leased, reservedBytes: this.#reserved, lostBytes: this.#lost,
      completedBatches: this.#completed, discardedBatches: this.#discarded, disposed: this.#disposed,
      ...(this.#fallback === undefined ? {} : { fallbackReason: this.#fallback }) });
  }
  #reject(job: Job, cause: unknown): void { if (!job.settled) { job.settled = true; job.reject(cause); } }
  #cancel(job: Job, code: string): void { job.cancelled = true; this.#reject(job, new CpuError(code, `CPU batch ${code.toLowerCase()}`)); job.cancelWait?.(); }
  #free(job: Job, incomingOutputBytes = 0): void {
    if (job.abort) job.signal?.removeEventListener('abort', job.abort);
    this.#reserved -= job.reserved;
    if (job.source) this.#recycleInput(job.source.data as Uint8Array, incomingOutputBytes);
    job.source = undefined; job.effects = undefined; job.onStart = undefined;
  }
  #inputPoolBytes(): number { return this.#inputPool.reduce((n, p) => n + p.byteLength, 0); }
  #recycleInput(data: Uint8Array, incomingOutputBytes = 0): void {
    if (this.#disposed || this.#inputPool.length >= 2 || !data.byteLength || this.#inputPool.some(p => p.buffer === data.buffer)) return;
    const pooled = this.#poolBytes + this.#inputPoolBytes() + data.byteLength;
    if (pooled <= this.#options.maxPoolBytes &&
        this.#cache.storageBytes + this.#workerCachedBytes + CPU_LOOKUP_BYTES * (this.#options.worker === 'off' ? 1 : 2) +
          this.#reserved + this.#leased + incomingOutputBytes + pooled <= this.#options.maxOwnedBytes) this.#inputPool.push(data);
  }
  #snapshotBytes(source: PixelSource): Uint8Array {
    const index = this.#inputPool.findIndex(p => p.byteLength === source.data.byteLength);
    if (index >= 0) {
      const pooled = this.#inputPool.splice(index, 1)[0]!;
      pooled.set(new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength)); return pooled;
    }
    return new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength).slice();
  }
  #recycle(outputs: readonly Uint8ClampedArray[]): void {
    for (const data of outputs) if (!this.#disposed && data.byteLength && this.#poolBytes + this.#inputPoolBytes() + data.byteLength <= this.#options.maxPoolBytes &&
      this.#cache.storageBytes + this.#workerCachedBytes + CPU_LOOKUP_BYTES * (this.#options.worker === 'off' ? 1 : 2) + this.#reserved + this.#leased + this.#poolBytes + this.#inputPoolBytes() + data.byteLength <= this.#options.maxOwnedBytes) { this.#pool.push(data); this.#poolBytes += data.byteLength; }
  }
  #outputs(frame: FrameDescriptor): Uint8ClampedArray[] {
    return frame.surfaces.map(s => {
      const bytes = s.width * s.height * 4, index = this.#pool.findIndex(p => p.byteLength === bytes);
      if (index < 0) return new Uint8ClampedArray(bytes);
      const [data] = this.#pool.splice(index, 1); this.#poolBytes -= bytes; return data!;
    });
  }
  render(source: PixelSource, frame: FrameDescriptor, options: {
    readonly effects?: CpuEffects; readonly signal?: AbortSignal;
    /** Monotonic performance.now() deadline, at most 60 seconds ahead. Capture precedes this wait. */
    readonly notBefore?: number; readonly onStart?: (startedAt: number) => void;
  } = {}): Promise<CpuBatch> {
    let job: Job;
    try {
      if (this.#disposed) throw new CpuError('DISPOSED', 'CPU executor disposed');
      if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['effects', 'signal', 'notBefore', 'onStart'].includes(k))) throw new CpuError('INVALID_OPTIONS', 'Invalid batch options');
      const notBefore = options.notBefore === undefined ? 0 : options.notBefore, onStart = options.onStart;
      if (typeof notBefore !== 'number' || !Number.isFinite(notBefore) || notBefore < 0 || notBefore > performance.now() + 60000 ||
          (onStart !== undefined && typeof onStart !== 'function')) throw new CpuError('INVALID_OPTIONS', 'Invalid execution schedule');
      if (options.signal?.aborted) throw new CpuError('ABORTED', 'CPU batch aborted');
      if (options.signal !== undefined && (typeof options.signal.addEventListener !== 'function' || typeof options.signal.removeEventListener !== 'function')) throw new CpuError('INVALID_OPTIONS', 'Invalid abort signal');
      validateSource(source); const frozen = checkedFrame(source, frame), effects = snapshotCpuEffects(options.effects);
      const latest = this.#latest;
      if (latest && (frozen.generation < latest.generation || (frozen.generation === latest.generation && (frozen.revision < latest.revision || frozen.sourceRevision < latest.sourceRevision)))) throw new CpuError('STALE', 'CPU frame is older than latest request');
      const outputBytes = frozen.surfaces.reduce((n, s) => n + s.width * s.height * 4, 0);
      const reserved = source.data.byteLength * ((effects?.blurRadius ?? 0) > 0 ? 12 : 4) + source.data.byteLength * (this.#options.worker === 'off' ? 1 : 2) + outputBytes + (frozen.surfaces.some(s=>s.width*s.height>=4096) ? CPU_GEOMETRY_MAX_BYTES : 0);
      const oldPending = this.#pending?.reserved ?? 0;
      const total = () => this.#cache.storageBytes + this.#workerCachedBytes + CPU_LOOKUP_BYTES * (this.#options.worker === 'off' ? 1 : 2) +
        this.#reserved - oldPending + this.#leased + this.#poolBytes + this.#inputPoolBytes() + reserved;
      while (this.#pool.length && total() > this.#options.maxOwnedBytes) this.#poolBytes -= this.#pool.shift()!.byteLength;
      while (this.#inputPool.length && total() > this.#options.maxOwnedBytes) this.#inputPool.shift();
      if (total() > this.#options.maxOwnedBytes) throw new CpuError('BUDGET', 'CPU live allocation reservation exceeds maxOwnedBytes');
      const copyStart = performance.now(), snapshot = createSource({ ...source,
        data: this.#snapshotBytes(source), ownership: 'borrowed' });
      const snapshotMs = performance.now() - copyStart;
      let resolve!: (value: CpuBatch) => void, reject!: (cause: unknown) => void;
      const promise = new Promise<CpuBatch>((yes, no) => { resolve = yes; reject = no; });
      void promise.catch(() => {});
      job = { id: ++this.#id, source: snapshot, frame: frozen, effects, reserved, snapshotMs, signal: options.signal, abort: undefined,
        notBefore, onStart, cancelWait: undefined, cancelled: false, settled: false, resolve, reject };
      if (this.#pending) { this.#cancel(this.#pending, 'SUPERSEDED'); this.#free(this.#pending); this.#discarded++; }
      if (this.#active) this.#cancel(this.#active, 'SUPERSEDED');
      this.#latest = frozen; this.#reserved += reserved; this.#pending = job;
      if (options.signal) {
        job.abort = () => {
          this.#cancel(job, 'ABORTED');
          if (this.#pending === job) { this.#pending = undefined; this.#free(job); this.#discarded++; }
        };
        options.signal.addEventListener('abort', job.abort, { once: true });
        if (options.signal.aborted) job.abort();
      }
      this.#drive(); return promise;
    } catch (cause) { return Promise.reject(cause); }
  }
  #drive(): void {
    if (this.#disposed || this.#active || !this.#pending) return;
    const job = this.#pending; this.#pending = undefined; this.#active = job;
    void Promise.resolve().then(() => this.#execute(job)).then(result => {
      if (job.cancelled || this.#disposed) { this.#discarded++; this.#free(job, result.surfaces.reduce((n, s) => n + s.data.byteLength, 0)); this.#recycle(result.surfaces.map(s => s.data)); return; }
      const bytes = result.surfaces.reduce((n, s) => n + s.data.byteLength, 0);
      this.#free(job, bytes); this.#leased += bytes; this.#completed++;
      let released = false;
      const batch = Object.freeze({ ...result, surfaces: Object.freeze(result.surfaces.map(s => Object.freeze(s))), release: () => {
        if (released) return; released = true; this.#leased -= bytes; this.#recycle(result.surfaces.map(s => s.data));
      } });
      job.settled = true; job.resolve(batch);
    }, cause => { this.#free(job); this.#reject(job, cause); }).finally(() => {
      if (this.#active === job) this.#active = undefined;
      this.#drive();
    });
  }
  #terminate(cause: unknown): void {
    this.#broken = true;
    const worker = this.#worker; this.#worker = undefined;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; try { worker.terminate(); } catch { /* Independent bookkeeping still runs. */ } }
    // The old retained source and the new in-flight staging can be distinct.
    // Charging both is conservative even when this request reused that source.
    this.#lost += this.#remote + this.#workerCachedBytes; this.#workerCachedBytes = 0; this.#remote = 0;
    const reject = this.#workerReject; this.#workerReject = undefined; reject?.(cause);
  }
  async #execute(job: Job): Promise<BatchPixels> {
    if (job.cancelled || this.#disposed) throw new CpuError('ABORTED', 'CPU batch no longer current');
    let scheduledWaitMs = 0;
    if (job.notBefore > performance.now()) {
      const controller = new AbortController();
      job.cancelWait = () => controller.abort(new CpuError('ABORTED', 'Deferred CPU batch cancelled'));
      try { scheduledWaitMs = await this.#scheduler.waitUntil(job.notBefore, controller.signal); }
      finally { job.cancelWait = undefined; }
    }
    if (job.cancelled || this.#disposed) throw new CpuError('ABORTED', 'CPU batch no longer current');
    const startedAt = performance.now(); job.onStart?.(startedAt);
    if (job.cancelled || this.#disposed) throw new CpuError('ABORTED', 'CPU batch no longer current');
    const scheduled = (result: BatchPixels): BatchPixels => ({ ...result, timings: { ...result.timings, scheduledWaitMs, startedAt } });
    if (this.#options.worker !== 'off' && !this.#broken) {
      try { return scheduled(await this.#remoteBatch(job)); }
      catch (cause) {
        this.#terminate(cause);
        if (this.#options.worker === 'required' || job.cancelled || this.#disposed) throw cause instanceof CpuError ? cause : new CpuError('WORKER_FAILED', 'CPU worker unavailable', { cause });
        this.#fallback = cause instanceof CpuError ? cause.code : 'WORKER_FAILED';
      }
    } else if (this.#options.worker === 'required') throw new CpuError('WORKER_FAILED', 'Required worker is no longer available');
    if (job.cancelled || this.#disposed) throw new CpuError('ABORTED', 'CPU batch no longer current');
    this.#execution = 'main'; const start = performance.now(), outputs = this.#outputs(job.frame);
    try {
      const result = runCpuBatch({ type: 'render', id: job.id, source: job.source!, frame: job.frame, ...(job.effects ? { effects: job.effects } : {}), outputs }, this.#options.cacheSources ? this.#cache : undefined);
      return scheduled({ ...result, timings: { ...result.timings, snapshotMs: job.snapshotMs, roundTripMs: performance.now() - start } });
    } catch (cause) { this.#recycle(outputs); throw cause; }
  }
  async #remoteBatch(job: Job): Promise<BatchPixels> {
    const worker = this.#worker ??= this.#options.workerFactory ? this.#options.workerFactory() : new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    if (!worker || typeof worker.postMessage !== 'function' || typeof worker.terminate !== 'function') throw new CpuError('WORKER_UNAVAILABLE', 'Worker unavailable');
    const snapshot = job.source!, sourceBytes = snapshot.data.byteLength;
    // Required execution never falls back. Its owned capture can cross the
    // boundary directly; auto keeps an independent capture for main fallback.
    const directInput = this.#options.worker === 'required', copyStart = performance.now();
    const source = createSource({ ...snapshot, data: directInput ? snapshot.data : this.#snapshotBytes(snapshot), ownership: 'transfer' });
    const transferCopyMs = directInput ? 0 : performance.now() - copyStart;
    const outputs = this.#outputs(job.frame), work: CpuWork = { cacheSources: this.#options.cacheSources, type: 'render', id: job.id, source, frame: job.frame, ...(job.effects ? { effects: job.effects } : {}), outputs };
    this.#execution = 'worker'; this.#remote = job.reserved - (directInput ? 0 : sourceBytes);
    // Without a copy stage, charge dispatch preparation to round-trip time.
    const start = directInput ? copyStart : performance.now(); let submit = 0, timer: ReturnType<typeof setTimeout> | undefined, received = false;
    try {
      return await new Promise<BatchPixels>((resolve, reject) => {
        this.#workerReject = reject;
        worker.onmessage = event => {
          if (received) return; received = true;
          try {
            if (this.#disposed || this.#worker !== worker || this.#active !== job) throw new CpuError('STALE', 'Worker response is no longer current');
            const message = event.data;
            if (message?.type !== 'result' || message.id !== job.id) throw new CpuError('WORKER_PROTOCOL', 'Unexpected worker response');
            const result = message.result as BatchPixels;
            if (!result || result.generation !== job.frame.generation || result.revision !== job.frame.revision || result.sourceRevision !== job.frame.sourceRevision ||
              !Array.isArray(result.surfaces) || result.surfaces.length !== job.frame.surfaces.length) throw new CpuError('WORKER_PROTOCOL', 'Worker frame identity mismatch');
            const buffers = new Set<ArrayBufferLike>();
            result.surfaces.forEach((s, i) => {
              const expected = job.frame.surfaces[i]!;
              if (s.id !== expected.id || s.width !== expected.width || s.height !== expected.height || !(s.data instanceof Uint8ClampedArray) ||
                s.data.byteOffset !== 0 || s.data.byteLength !== s.width * s.height * 4 || buffers.has(s.data.buffer)) throw new CpuError('WORKER_PROTOCOL', 'Invalid worker pixels');
              validateSource(createSource({ contractVersion: 1, width: s.width, height: s.height, revision: 0, ownership: 'transfer', data: s.data, colorSpace: 'srgb', alphaMode: 'straight' }));
              buffers.add(s.data.buffer);
            });
            if (!result.timings || ![result.timings.prepareMs, result.timings.kernelMs].every(n => Number.isFinite(n) && n >= 0)) throw new CpuError('WORKER_PROTOCOL', 'Invalid worker timings');
            // A cached worker must report its prepared source. Previous blur or
            // geometry arrays may survive a cheaper request for the same source;
            // those bytes were reserved independently before this job started.
            const minimumRetained = this.#options.cacheSources ? sourceBytes * 4 : 0;
            const maximumRetained = this.#workerCachedBytes + job.reserved;
            if ((this.#options.cacheSources && result.retainedBytes === undefined) ||
                (result.retainedBytes !== undefined && (!Number.isSafeInteger(result.retainedBytes) ||
                  result.retainedBytes < minimumRetained || result.retainedBytes > maximumRetained))) {
              throw new CpuError('WORKER_PROTOCOL', 'Invalid retained source bytes');
            }
            this.#workerCachedBytes = result.retainedBytes ?? 0;
            if (directInput && message.returnedInput === undefined) throw new CpuError('WORKER_PROTOCOL', 'Missing returned input buffer');
            if (message.returnedInput !== undefined) {
              const input = message.returnedInput;
              if (!(input instanceof Uint8Array) || buffers.has(input.buffer)) throw new CpuError('WORKER_PROTOCOL', 'Invalid returned input buffer');
              try { validateSource(createSource({ ...snapshot, data: input, ownership: 'transfer' })); }
              catch (cause) { throw new CpuError('WORKER_PROTOCOL', 'Invalid returned input buffer', { cause }); }
              this.#recycleInput(input);
            }
            this.#remote = 0;
            resolve({ ...result, timings: { ...result.timings, snapshotMs: job.snapshotMs, transferCopyMs, transferSubmitMs: submit, roundTripMs: performance.now() - start } });
          } catch (cause) { reject(cause); }
        };
        worker.onerror = event => { received = true; event.preventDefault?.(); reject(new CpuError('WORKER_FAILED', 'CPU worker error')); };
        worker.onmessageerror = () => { received = true; reject(new CpuError('WORKER_PROTOCOL', 'CPU worker message decode failed')); };
        timer = setTimeout(() => { received = true; reject(new CpuError('TIMEOUT', 'CPU worker timed out')); }, this.#options.timeoutMs);
        try { const post = performance.now(); worker.postMessage(work, [source.data.buffer as ArrayBuffer, ...outputs.map(o => o.buffer as ArrayBuffer)]); submit = performance.now() - post; }
        catch (cause) { received = true; reject(new CpuError('WORKER_FAILED', 'CPU worker post failed', { cause })); }
      });
    } finally {
      clearTimeout(timer); this.#workerReject = undefined;
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
    }
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#pending) { this.#cancel(this.#pending, 'DISPOSED'); this.#free(this.#pending); this.#pending = undefined; this.#discarded++; }
    if (this.#active) this.#cancel(this.#active, 'DISPOSED');
    this.#terminate(new CpuError('DISPOSED', 'CPU executor disposed'));
    this.#pool = []; this.#poolBytes = 0; this.#inputPool = []; this.#cache.dispose(); this.#scheduler.dispose();
  }
}
