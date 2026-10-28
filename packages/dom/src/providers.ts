import { createSource, MAX_PIXELS, type PixelBytes, type PixelSource } from '@liquid-glass-forge/core';

export type SourceErrorCode = 'INVALID_SOURCE' | 'UNSUPPORTED_SOURCE' | 'UNREADABLE_SOURCE' |
  'UNAVAILABLE_SOURCE' | 'DECODE_FAILED' | 'ABORTED' | 'TIMEOUT' | 'SUPERSEDED' | 'PAUSED' | 'DESTROYED';
export class SourceError extends Error {
  readonly code: SourceErrorCode;
  constructor(code: SourceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'SourceError'; this.code = code;
  }
}

export type SourceSpec =
  | { readonly kind: 'pixels'; readonly width: number; readonly height: number; readonly data: PixelBytes }
  | { readonly kind: 'image-data'; readonly value: ImageData }
  | { readonly kind: 'bitmap'; readonly value: ImageBitmap }
  | { readonly kind: 'canvas'; readonly value: HTMLCanvasElement | OffscreenCanvas }
  | { readonly kind: 'video'; readonly value: HTMLVideoElement }
  | { readonly kind: 'image'; readonly url: string; readonly crossOrigin?: 'anonymous' | 'use-credentials' | 'none' };
export interface SourceSnapshot {
  readonly source: PixelSource;
  readonly generation: number;
  readonly revision: number;
}
export interface SourceProviderOptions { readonly timeoutMs?: number }

function error(code: SourceErrorCode, message: string, cause?: unknown): SourceError {
  return new SourceError(code, message, cause === undefined ? undefined : { cause });
}
function dimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw error('INVALID_SOURCE', `Source must have 1–${MAX_PIXELS} pixels with positive integer dimensions`);
  }
}
function specCopy(input: SourceSpec): SourceSpec {
  if (!input || typeof input !== 'object') throw error('INVALID_SOURCE', 'Expected an explicit source');
  switch (input.kind) {
    case 'pixels': return Object.freeze({ kind: input.kind, width: input.width, height: input.height, data: input.data });
    case 'image-data': case 'bitmap': case 'canvas': case 'video':
      if (!input.value) throw error('INVALID_SOURCE', 'Source value is missing');
      return Object.freeze({ kind: input.kind, value: input.value }) as SourceSpec;
    case 'image':
      if (typeof input.url !== 'string' || !input.url.trim() ||
          (input.crossOrigin !== undefined && !['anonymous', 'use-credentials', 'none'].includes(input.crossOrigin))) {
        throw error('INVALID_SOURCE', 'Invalid image URL or crossOrigin mode');
      }
      return Object.freeze({ kind: 'image', url: input.url, crossOrigin: input.crossOrigin ?? 'anonymous' });
    default: throw error('UNSUPPORTED_SOURCE', 'Unsupported source kind');
  }
}
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      cause => { signal.removeEventListener('abort', abort); reject(cause); });
    if (signal.aborted) abort();
  });
}
function bytes(width: number, height: number, data: PixelBytes, revision: number): PixelSource {
  try {
    const input = createSource({ contractVersion: 1, width, height, revision, data,
      ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
    // Copy synchronously before yielding; never detach the application's view.
    return createSource({ ...input, data: new Uint8ClampedArray(input.data), ownership: 'transfer' });
  } catch (cause) { throw error('INVALID_SOURCE', 'Invalid RGBA8 source storage', cause); }
}
function raster(value: CanvasImageSource, width: number, height: number, revision: number): PixelSource {
  dimensions(width, height);
  if (typeof document === 'undefined') throw error('UNSUPPORTED_SOURCE', 'Pixel acquisition requires a browser document');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!ctx) throw error('UNSUPPORTED_SOURCE', 'Canvas2D is unavailable');
    ctx.drawImage(value, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height, { colorSpace: 'srgb' });
    return createSource({ contractVersion: 1, width, height, revision, data: image.data,
      ownership: 'transfer', colorSpace: 'srgb', alphaMode: 'straight' });
  } catch (cause) {
    if (cause instanceof SourceError) throw cause;
    if (cause instanceof Error && cause.name === 'SecurityError') throw error('UNREADABLE_SOURCE', 'Source is not origin-clean', cause);
    throw error('UNAVAILABLE_SOURCE', 'Source pixels cannot be acquired', cause);
  } finally { canvas.width = 0; canvas.height = 0; }
}
async function decodedImage(spec: Extract<SourceSpec, { kind: 'image' }>, revision: number, signal: AbortSignal): Promise<PixelSource> {
  if (typeof Image === 'undefined') throw error('UNSUPPORTED_SOURCE', 'Image decoding requires a browser');
  const image = new Image();
  if (spec.crossOrigin !== 'none') image.crossOrigin = spec.crossOrigin ?? 'anonymous';
  const abort = () => { image.src = ''; };
  signal.addEventListener('abort', abort, { once: true });
  try {
    throwIfAborted(signal);
    // Attach both handlers before assigning src, including the non-decode fallback.
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(error('DECODE_FAILED', 'Image load or CORS request failed'));
    });
    image.src = spec.url;
    if (typeof image.decode === 'function') {
      // Observe load rejection even when native decode is the awaited capability.
      void loaded.catch(() => {});
      await abortable(image.decode(), signal);
    } else { await abortable(loaded, signal); }
    throwIfAborted(signal);
    return raster(image, image.naturalWidth, image.naturalHeight, revision);
  } catch (cause) {
    throwIfAborted(signal);
    if (cause instanceof SourceError) throw cause;
    throw error('DECODE_FAILED', 'Image decoding failed', cause);
  } finally {
    signal.removeEventListener('abort', abort);
    image.onload = null; image.onerror = null; image.src = '';
  }
}
function acquire(spec: SourceSpec, revision: number, signal: AbortSignal): PixelSource | Promise<PixelSource> {
  throwIfAborted(signal);
  switch (spec.kind) {
    case 'pixels': return bytes(spec.width, spec.height, spec.data, revision);
    case 'image-data':
      // Older ImageData implementations expose only the original sRGB format.
      if (spec.value.colorSpace !== undefined && spec.value.colorSpace !== 'srgb') throw error('UNSUPPORTED_SOURCE', 'Only sRGB ImageData is supported');
      return bytes(spec.value.width, spec.value.height, spec.value.data, revision);
    case 'bitmap': return raster(spec.value, spec.value.width, spec.value.height, revision);
    case 'canvas': return raster(spec.value, spec.value.width, spec.value.height, revision);
    case 'video':
      if (spec.value.mediaKeys) throw error('UNREADABLE_SOURCE', 'Encrypted media is not a supported pixel source');
      if (spec.value.getAttribute?.('src') && spec.value.currentSrc && spec.value.src !== spec.value.currentSrc) {
        throw error('UNAVAILABLE_SOURCE', 'Replacement video source is not ready');
      }
      if (spec.value.seeking || spec.value.readyState < 2 || spec.value.error || !spec.value.videoWidth || !spec.value.videoHeight) {
        throw error('UNAVAILABLE_SOURCE', 'Video has no readable current frame');
      }
      return raster(spec.value, spec.value.videoWidth, spec.value.videoHeight, revision);
    case 'image': return decodedImage(spec, revision, signal);
  }
}

interface MediaKey { width: number; height: number; identity: string; time: number; object: unknown }
function mediaKey(spec: SourceSpec): MediaKey | undefined {
  if (spec.kind === 'canvas') return { width: spec.value.width, height: spec.value.height, identity: '', time: 0, object: spec.value };
  if (spec.kind === 'video') return { width: spec.value.videoWidth, height: spec.value.videoHeight,
    identity: `${spec.value.currentSrc || ''}\n${spec.value.src || ''}`, time: spec.value.currentTime, object: spec.value.srcObject };
  return undefined;
}

/** Explicit borrowed inputs; read() returns a fresh owned snapshot. Latest read wins. */
export class SourceProvider {
  #spec: SourceSpec;
  #generation = 0;
  #revision = 0;
  #destroyed = false;
  #paused = false;
  #cancel: ((reason: SourceError) => void) | undefined;
  readonly #timeoutMs: number;
  #key: MediaKey | undefined;
  #subscribers = new Set<() => void>();
  #unobserve: (() => void) | undefined;
  #scheduled: (() => void) | undefined;
  #frameCallbackFailed = false;
  #scheduleEpoch = 0;
  constructor(spec: SourceSpec, options: SourceProviderOptions = {}) {
    this.#spec = specCopy(spec);
    const timeout = options.timeoutMs ?? 5000;
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60000) throw error('INVALID_SOURCE', 'timeoutMs must be 1–60000');
    this.#timeoutMs = timeout;
    this.#key = mediaKey(this.#spec);
  }
  get generation(): number { return this.#generation; }
  get revision(): number { return this.#revision; }
  get state(): 'ready' | 'paused' | 'destroyed' { return this.#destroyed ? 'destroyed' : this.#paused ? 'paused' : 'ready'; }
  #assertAlive(): void { if (this.#destroyed) throw error('DESTROYED', 'Provider is destroyed'); }
  #bump(): void {
    if (this.#revision === Number.MAX_SAFE_INTEGER) throw error('INVALID_SOURCE', 'Revision exhausted');
    this.#revision++;
    this.#cancel?.(error('SUPERSEDED', 'Source revision was superseded'));
  }
  #notify(): void {
    // Each subscriber is isolated; consumer exceptions cannot strand owned callbacks.
    for (const listener of [...this.#subscribers]) { try { listener(); } catch { /* See subscribe contract. */ } }
  }
  #refresh(force = false): void {
    const next = mediaKey(this.#spec), previous = this.#key;
    if (!next) return;
    if (previous && (force || next.width !== previous.width || next.height !== previous.height ||
        next.identity !== previous.identity || next.object !== previous.object || next.time !== previous.time)) {
      if (next.identity !== previous.identity || next.object !== previous.object) {
        if (this.#generation === Number.MAX_SAFE_INTEGER) throw error('INVALID_SOURCE', 'Generation exhausted');
        this.#generation++;
      }
      this.#key = next;
      this.#bump(); this.#notify();
    } else { this.#key = next; }
  }
  #stopScheduled(): void { this.#scheduleEpoch++; const cancel = this.#scheduled; this.#scheduled = undefined; cancel?.(); }
  #stopObserving(): void {
    this.#stopScheduled(); this.#unobserve?.(); this.#unobserve = undefined;
  }
  #schedule(): void {
    if (this.#scheduled || this.#destroyed || this.#paused || !this.#subscribers.size || this.#spec.kind !== 'video') return;
    const video = this.#spec.value;
    if (video.paused || video.ended || video.readyState < 2 || video.error) return;
    const epoch = this.#scheduleEpoch;
    let nativeFrame = false;
    const tick = () => {
      if (epoch !== this.#scheduleEpoch) return;
      this.#scheduled = undefined;
      if (this.#destroyed || this.#paused || this.#spec.kind !== 'video' || this.#spec.value !== video || !this.#subscribers.size) return;
      this.#refresh(nativeFrame); this.#schedule();
    };
    if (!this.#frameCallbackFailed && typeof video.requestVideoFrameCallback === 'function' &&
        typeof video.cancelVideoFrameCallback === 'function') {
      try {
        nativeFrame = true;
        const id = video.requestVideoFrameCallback(tick);
        this.#scheduled = () => video.cancelVideoFrameCallback(id);
        return;
      } catch { this.#frameCallbackFailed = true; nativeFrame = false; }
    }
    const id = setTimeout(tick, 40);
    this.#scheduled = () => clearTimeout(id);
  }
  #observe(): void {
    if (this.#destroyed || this.#paused || !this.#subscribers.size || this.#spec.kind !== 'video' || this.#unobserve) return;
    const video = this.#spec.value;
    const changed = (event: Event) => {
      this.#stopScheduled();
      this.#refresh(event.type !== 'timeupdate');
      this.#schedule();
    };
    const events = ['loadeddata', 'resize', 'seeked', 'timeupdate', 'playing', 'pause', 'ended', 'emptied', 'loadstart', 'error', 'abort'];
    for (const name of events) video.addEventListener(name, changed);
    this.#unobserve = () => { for (const name of events) video.removeEventListener(name, changed); };
    this.#schedule();
  }
  /** Observe invalidation, not pixel delivery. Exceptions from listeners are isolated. */
  subscribe(listener: () => void): () => void {
    this.#assertAlive();
    if (typeof listener !== 'function') throw error('INVALID_SOURCE', 'Expected an invalidation listener');
    const entry = () => listener(); this.#subscribers.add(entry); this.#observe();
    return () => { this.#subscribers.delete(entry); if (!this.#subscribers.size) this.#stopObserving(); };
  }
  replace(spec: SourceSpec): void {
    this.#assertAlive(); const next = specCopy(spec);
    if (this.#generation === Number.MAX_SAFE_INTEGER) throw error('INVALID_SOURCE', 'Generation exhausted');
    const key = mediaKey(next);
    this.#stopObserving(); this.#bump(); this.#generation++; this.#spec = next;
    this.#key = key; this.#frameCallbackFailed = false; this.#observe(); this.#notify();
  }
  invalidate(): void { this.#assertAlive(); this.#bump(); this.#notify(); }
  pause(): void {
    this.#assertAlive(); this.#paused = true; this.#stopObserving(); this.#cancel?.(error('PAUSED', 'Provider paused'));
  }
  resume(): void {
    this.#assertAlive();
    if (this.#paused) { this.#bump(); this.#paused = false; this.#refresh(); this.#observe(); this.#notify(); }
  }
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true; this.#stopObserving(); this.#subscribers.clear();
    this.#cancel?.(error('DESTROYED', 'Provider destroyed'));
    // Forget borrowed objects; never close bitmaps or clear caller media/canvas.
    this.#key = undefined;
    this.#spec = { kind: 'pixels', width: 1, height: 1, data: new Uint8Array(4) };
  }
  read(options: { readonly signal?: AbortSignal } = {}): Promise<SourceSnapshot> {
    if (this.#destroyed) return Promise.reject(error('DESTROYED', 'Provider is destroyed'));
    if (this.#paused) return Promise.reject(error('PAUSED', 'Provider is paused'));
    try { this.#refresh(); } catch (cause) { return Promise.reject(cause); }
    if (options.signal?.aborted) return Promise.reject(error('ABORTED', 'Read aborted'));
    this.#cancel?.(error('SUPERSEDED', 'A newer read superseded this read'));
    const generation = this.#generation, revision = this.#revision;
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      const finish = (reason?: unknown, source?: PixelSource) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        if (this.#cancel === cancel) this.#cancel = undefined;
        if (reason !== undefined) reject(reason);
        else if (source && !this.#destroyed && generation === this.#generation && revision === this.#revision) {
          resolve(Object.freeze({ source, generation, revision }));
        } else reject(error('SUPERSEDED', 'Stale source result'));
      };
      const cancel = (reason: SourceError) => { controller.abort(reason); finish(reason); };
      const abort = () => cancel(error('ABORTED', 'Read aborted'));
      const timer = setTimeout(() => cancel(error('TIMEOUT', 'Source acquisition timed out')), this.#timeoutMs);
      this.#cancel = cancel;
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        // acquire is invoked now, so pixel inputs are copied before read returns.
        Promise.resolve(acquire(this.#spec, revision, controller.signal)).then(
          source => finish(undefined, source), cause => finish(cause));
      } catch (cause) { finish(cause); }
    });
  }
}
