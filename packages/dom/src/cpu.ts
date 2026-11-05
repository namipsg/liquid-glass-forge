import { createFrame, MAX_PIXELS, validateSource } from '@liquid-glass-forge/core';
import type { SourceRect } from '@liquid-glass-forge/core';
import { CpuError, CpuExecutor, CpuDeadlineScheduler, snapshotCpuEffects } from '@liquid-glass-forge/cpu';
import type { CpuEffects, CpuExecutorOptions, CpuTimings } from '@liquid-glass-forge/cpu';
import type { FramePixels, GlassRenderer, RenderRequest } from './scene.js';

export interface CpuSurfaceOptions { readonly radius?: number; readonly bevel?: number; readonly strength?: number }
export interface CpuRendererOptions {
  readonly executor?: CpuExecutorOptions;
  /** Distances are measured in effective output backing pixels. */
  readonly surface?: CpuSurfaceOptions | ((request: RenderRequest) => CpuSurfaceOptions);
  readonly effects?: CpuEffects;
  /** Omitted means sample the complete source. */
  readonly sourceRect?: SourceRect | ((request: RenderRequest) => SourceRect);
  readonly quality?: { readonly maxPixels?: number; readonly maxWidth?: number; readonly maxHeight?: number;
    readonly maxUpdatesPerSecond?: number; readonly maxSourcePixels?: number;
    /** Explicit active-interaction policy; balanced/default retains its 30 Hz limit. */
    readonly cadence?: 'balanced' | 'interactive' };
}
type Limits = Required<Omit<NonNullable<CpuRendererOptions['quality']>, 'cadence'>>;
type Size = Readonly<{ width: number; height: number }>;
function object(input: unknown, keys: readonly string[], name: string): void {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Reflect.ownKeys(input).some(k => typeof k !== 'string' || !keys.includes(k))) {
    throw new CpuError('INVALID_OPTIONS', `Invalid ${name}`);
  }
}
function finite(value: number, low: number, high: number, name: string): void {
  if (!Number.isFinite(value) || value < low || value > high) throw new CpuError('INVALID_OPTIONS', `Invalid ${name}`);
}
function sourceRect(input: SourceRect): Readonly<SourceRect> {
  object(input, ['x', 'y', 'width', 'height'], 'sourceRect');
  finite(input.x, 0, MAX_PIXELS, 'sourceRect.x'); finite(input.y, 0, MAX_PIXELS, 'sourceRect.y');
  finite(input.width, Number.MIN_VALUE, MAX_PIXELS, 'sourceRect.width'); finite(input.height, Number.MIN_VALUE, MAX_PIXELS, 'sourceRect.height');
  return Object.freeze({ x: input.x, y: input.y, width: input.width, height: input.height });
}
function surfaceOptions(input: CpuSurfaceOptions): Readonly<CpuSurfaceOptions> {
  object(input, ['radius', 'bevel', 'strength'], 'surface');
  if ('then' in input) throw new CpuError('INVALID_OPTIONS', 'Surface options must be synchronous data');
  if (input.radius !== undefined) finite(input.radius, 0, 1_000_000, 'radius');
  if (input.bevel !== undefined) finite(input.bevel, Number.MIN_VALUE, 1_000_000, 'bevel');
  if (input.strength !== undefined) finite(input.strength, 0, 1_000_000, 'strength');
  return Object.freeze({ ...input });
}
/** Floor after uniform scaling, then account for min-one rounding on very thin surfaces. */
function boundedSize(width: number, height: number, q: Limits): Size {
  const scale = Math.min(1, q.maxWidth / width, q.maxHeight / height, Math.sqrt(q.maxPixels / width / height));
  let w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
  if (w * h > q.maxPixels) {
    if (w >= h) w = Math.max(1, Math.floor(q.maxPixels / h));
    else h = Math.max(1, Math.floor(q.maxPixels / w));
  }
  return Object.freeze({ width: w, height: h });
}

/** One scene owns this adapter. Initialization owns resources; construction only snapshots data. */
export class CpuRenderer implements GlassRenderer {
  readonly #executorOptions: CpuExecutorOptions;
  readonly #surface: NonNullable<CpuRendererOptions['surface']>;
  #lastSurface: Readonly<Required<CpuSurfaceOptions>> | undefined;
  readonly #effects: CpuEffects | undefined;
  readonly #sourceRect: CpuRendererOptions['sourceRect'];
  readonly #quality: Limits;
  readonly #cadence: 'balanced' | 'interactive';
  #executor: CpuExecutor | undefined;
  #pacer: CpuDeadlineScheduler | undefined;
  #cleanup: (() => void) | undefined;
  #disposed = false; #generation = 0; #revision = 0;
  #job: AbortController | undefined;
  #lastStart: number | undefined;
  #lastReady: number | undefined;
  #requested: Size | undefined; #effective: Size | undefined;
  #reasons: readonly string[] = Object.freeze([]);
  #timings: (CpuTimings & { readonly captureMs: number; readonly rateWaitMs: number; readonly presentationWaitMs: number }) | undefined;
  #lastExecutor: ReturnType<CpuRenderer['executorDiagnostics']> | undefined;
  constructor(options: CpuRendererOptions = {}) {
    object(options, ['executor', 'surface', 'effects', 'sourceRect', 'quality'], 'CPU renderer options');
    const executor = options.executor === undefined ? {} : options.executor;
    object(executor, ['cacheSources', 'worker', 'workerFactory', 'timeoutMs', 'maxPoolBytes', 'maxOwnedBytes'], 'executor options');
    // CpuExecutor construction itself is data-only and is the canonical validator.
    new CpuExecutor(executor);
    this.#executorOptions = Object.freeze({ cacheSources: true, ...executor });
    const surface = options.surface === undefined ? {} : options.surface;
    this.#surface = typeof surface === 'function' ? surface : surfaceOptions(surface); this.#effects = snapshotCpuEffects(options.effects);
    this.#sourceRect = typeof options.sourceRect === 'function' || options.sourceRect === undefined ? options.sourceRect : sourceRect(options.sourceRect);
    const quality = options.quality === undefined ? {} : options.quality;
    object(quality, ['maxPixels', 'maxWidth', 'maxHeight', 'maxUpdatesPerSecond', 'maxSourcePixels', 'cadence'], 'quality');
    if (quality.cadence !== undefined && !['balanced','interactive'].includes(quality.cadence)) throw new CpuError('INVALID_OPTIONS', 'Invalid CPU cadence policy');
    this.#cadence = quality.cadence ?? 'balanced';
    const q = { maxPixels: quality.maxPixels === undefined ? 57600 : quality.maxPixels,
      maxWidth: quality.maxWidth === undefined ? 320 : quality.maxWidth, maxHeight: quality.maxHeight === undefined ? 180 : quality.maxHeight,
      maxUpdatesPerSecond: quality.maxUpdatesPerSecond === undefined ? 30 : quality.maxUpdatesPerSecond,
      maxSourcePixels: quality.maxSourcePixels === undefined ? 230400 : quality.maxSourcePixels };
    for (const key of ['maxPixels', 'maxWidth', 'maxHeight', 'maxSourcePixels'] as const) {
      finite(q[key], 1, MAX_PIXELS, key);
      if (!Number.isSafeInteger(q[key])) throw new CpuError('INVALID_OPTIONS', `${key} must be an integer`);
    }
    finite(q.maxUpdatesPerSecond, 1, this.#cadence === 'interactive' ? 60 : 30, 'maxUpdatesPerSecond'); this.#quality = Object.freeze(q);
  }
  private executorDiagnostics() { return this.#executor!.diagnostics; }
  get diagnostics() {
    const executor = this.#executor?.diagnostics ?? this.#lastExecutor;
    return Object.freeze({ backend: 'cpu' as const, execution: executor?.execution ?? 'main', disposed: this.#disposed,
      initialized: !!this.#executor, requested: this.#requested, effective: this.#effective,
      requestedWidth: this.#requested?.width, requestedHeight: this.#requested?.height,
      effectiveWidth: this.#effective?.width, effectiveHeight: this.#effective?.height,
      qualityReduced: this.#reasons.length > 0, reasons: this.#reasons, quality: this.#quality,
      ...(this.#cadence === 'interactive' ? { cadencePolicy: this.#cadence } : {}), timings: this.#timings, surface: this.#lastSurface, executor });
  }
  initialize(signal: AbortSignal): () => void {
    if (this.#disposed) throw new CpuError('DISPOSED', 'CPU renderer disposed');
    if (signal.aborted) throw new CpuError('ABORTED', 'CPU renderer initialization aborted');
    this.#cleanup?.();
    const executor = new CpuExecutor(this.#executorOptions), pacer = new CpuDeadlineScheduler(), generation = ++this.#generation;
    this.#executor = executor; this.#pacer = pacer; this.#lastStart = undefined; this.#lastReady = undefined;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true; signal.removeEventListener('abort', cleanup);
      if (generation === this.#generation && this.#executor === executor) {
        this.#generation++; this.#job?.abort(new CpuError('ABORTED', 'CPU renderer initialization ended'));
        this.#job = undefined; this.#executor = undefined; this.#pacer = undefined; this.#cleanup = undefined; this.#lastReady = undefined;
      }
      executor.dispose(); pacer.dispose(); this.#lastExecutor = executor.diagnostics;
    };
    this.#cleanup = cleanup; signal.addEventListener('abort', cleanup, { once: true });
    if (signal.aborted) cleanup();
    return cleanup;
  }
  async render(request: RenderRequest, signal: AbortSignal): Promise<FramePixels> {
    if (this.#disposed) throw new CpuError('DISPOSED', 'CPU renderer disposed');
    const executor = this.#executor, pacer = this.#pacer, generation = this.#generation;
    if (!executor || !pacer) throw new CpuError('NOT_INITIALIZED', 'Initialize CPU renderer before rendering');
    this.#job?.abort(new CpuError('SUPERSEDED', 'CPU render superseded'));
    const controller = new AbortController(); this.#job = controller;
    const abort = () => controller.abort(new CpuError('ABORTED', 'CPU render aborted'));
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    const current = () => {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (this.#disposed || generation !== this.#generation || executor !== this.#executor || this.#job !== controller) throw new CpuError('STALE', 'CPU render no longer current');
    };
    try {
      current();
      if (!request || !Number.isSafeInteger(request.width) || !Number.isSafeInteger(request.height) || request.width < 1 || request.height < 1) throw new CpuError('INVALID_OPTIONS', 'Invalid requested CPU dimensions');
      validateSource(request.snapshot.source);
      const source = request.snapshot.source;
      if (source.width * source.height > this.#quality.maxSourcePixels) throw new CpuError('SOURCE_LIMIT', 'CPU source exceeds maxSourcePixels');
      const size = boundedSize(request.width, request.height, this.#quality), reasons: string[] = [];
      if (request.width > this.#quality.maxWidth) reasons.push('maxWidth');
      if (request.height > this.#quality.maxHeight) reasons.push('maxHeight');
      if (request.width * request.height > this.#quality.maxPixels) reasons.push('maxPixels');
      const rect = typeof this.#sourceRect === 'function' ? sourceRect(this.#sourceRect(request)) : this.#sourceRect;
      const surface = typeof this.#surface === 'function' ? surfaceOptions(this.#surface(request)) : this.#surface;
      if (this.#revision === Number.MAX_SAFE_INTEGER) throw new CpuError('INVALID_OPTIONS', 'CPU renderer revision exhausted');
      const frame = createFrame({ contractVersion: 1, generation: request.snapshot.generation, revision: ++this.#revision, sourceRevision: source.revision,
        surfaces: [{ id: 'cpu', ...size, ...surface, ...(rect === undefined ? {} : { sourceRect: rect }) }] }, source);
      const effectiveSurface = frame.surfaces[0]!;
      this.#lastSurface = Object.freeze({ radius: effectiveSurface.radius, bevel: effectiveSurface.bevel, strength: effectiveSurface.strength });
      this.#requested = Object.freeze({ width: request.width, height: request.height }); this.#effective = size;
      const period = 1000 / this.#quality.maxUpdatesPerSecond;
      // Reserve measured computation time before the next presentation. Fast
      // kernels should wait before execution instead of spending a whole frame
      // in presentation smoothing. Source capture and cancellation stay owned.
      const computeMargin = Math.min(period, Math.max(4, (this.#timings?.roundTripMs ?? 0) * 1.25 + 1));
      const notBefore = this.#lastStart === undefined ? 0 : Math.max(this.#lastStart + period,
        (this.#lastReady ?? 0) + period - computeMargin);
      const paceOutput = this.#lastStart !== undefined && performance.now() - this.#lastStart < 2000 / this.#quality.maxUpdatesPerSecond;
      current(); this.#reasons = Object.freeze([...reasons]);
      // The executor captures owned bytes synchronously before its deferred start.
      // This avoids a second adapter snapshot during a rate wait.
      const pending = executor.render(source, frame, {
        ...(this.#effects === undefined ? {} : { effects: this.#effects }), signal: controller.signal, notBefore,
        onStart: startedAt => { current(); this.#lastStart = startedAt; }
      });
      const batch = await pending;
      try {
        current();
        // Keep completion cadence without an unconditional execution-relative
        // delay. The next execution already reserves its measured compute time.
        const presentationWaitMs = paceOutput && this.#lastReady !== undefined
          ? await pacer.waitUntil(this.#lastReady + period, controller.signal) : 0;
        current(); const output = batch.surfaces[0]!, rateWaitMs = batch.timings.scheduledWaitMs ?? 0;
        if (rateWaitMs > 0 || presentationWaitMs > 0) reasons.push('maxUpdatesPerSecond'); this.#reasons = Object.freeze(reasons);
        this.#timings = Object.freeze({ ...batch.timings, captureMs: 0, rateWaitMs, presentationWaitMs });
        this.#lastReady = performance.now();
        return Object.freeze({ width: output.width, height: output.height, data: output.data, release: () => {
          batch.release(); if (this.#executor !== executor && this.#generation === generation + 1) this.#lastExecutor = executor.diagnostics;
        } });
      } catch (cause) {
        batch.release(); if (this.#executor !== executor && this.#generation === generation + 1) this.#lastExecutor = executor.diagnostics;
        throw cause;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.#job === controller) this.#job = undefined;
    }
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#cleanup?.();
  }
}
export function createCpuRenderer(options: CpuRendererOptions = {}): CpuRenderer { return new CpuRenderer(options); }
