import { MAX_PIXELS, MAX_SURFACES } from '@liquid-glass-forge/core';
import type { SourceSnapshot } from './providers.js';
import { mountGlassHost, type GlassHost, type GlassHostOptions, type GlassMaterial, type HostPixels } from './host.js';

export interface SceneSource {
  read(options?: { readonly signal?: AbortSignal }): Promise<SourceSnapshot>;
  subscribe?(listener: () => void): () => void;
  destroy?(): void;
}
export interface FramePixels extends HostPixels { readonly release?: () => void }
export interface RenderRequest {
  readonly snapshot: SourceSnapshot;
  readonly width: number; readonly height: number; readonly dpr: number;
  readonly rect: Readonly<{ x: number; y: number; width: number; height: number }>;
}
export interface GlassRenderer {
  initialize?(signal: AbortSignal): void | (() => void) | Promise<void | (() => void)>;
  render(request: RenderRequest, signal: AbortSignal): FramePixels | Promise<FramePixels>;
}
export interface GlassSceneOptions {
  readonly source?: SceneSource; readonly renderer?: GlassRenderer;
  readonly ownsSource?: boolean; readonly timeoutMs?: number;
  readonly signal?: AbortSignal; readonly onError?: (error: unknown) => void;
}
export class SceneError extends Error {
  constructor(readonly code: 'INVALID_OPTIONS' | 'TIMEOUT' | 'ABORTED' | 'PAUSED' | 'DESTROYED' | 'SUPERSEDED' | 'FAILED', message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'SceneError';
  }
}
export interface GlassAttachment {
  readonly host: GlassHost;
  update(options?: Pick<GlassHostOptions, 'material'>): void;
  invalidate(): void;
  dispose(): void;
}
interface Entry { host: GlassHost; live: boolean; intersecting: boolean; width: number; height: number }

/** One deadline per active operation. Late owned results are reclaimed even after cancellation. */
function bounded<T>(work: (signal: AbortSignal) => T | Promise<T>, parent: AbortSignal, ms: number, late: (result: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController(); let settled = false;
    const finish = (cause?: unknown, value?: T, failed = false) => {
      if (settled) return;
      settled = true; clearTimeout(timer); parent.removeEventListener('abort', abort);
      if (failed) reject(cause instanceof Error ? cause : new SceneError('FAILED', 'Scene operation rejected', { cause })); else resolve(value as T);
    };
    const abort = () => { controller.abort(parent.reason); finish(parent.reason, undefined, true); };
    const timer = setTimeout(() => { const cause = new SceneError('TIMEOUT', 'Scene operation timed out'); controller.abort(cause); finish(cause, undefined, true); }, ms);
    parent.addEventListener('abort', abort, { once: true });
    if (parent.aborted) { abort(); return; }
    try {
      Promise.resolve(work(controller.signal)).then(value => { if (settled) late(value); else finish(undefined, value); }, cause => finish(cause, undefined, true));
    } catch (cause) { finish(cause, undefined, true); }
  });
}

/** Shared source ownership and dirty scheduling; the default is material-only. No animation clock. */
export class GlassScene {
  readonly #options: GlassSceneOptions;
  readonly #timeout: number;
  #state: 'initializing' | 'ready' | 'paused' | 'failed' | 'destroyed' = 'initializing';
  #ready!: Promise<void>;
  #generation = 0; #revision = 0;
  #controller = new AbortController();
  #job: AbortController | undefined;
  #entries = new Set<Entry>(); #dirty = new Set<Entry>();
  #queued = false; #busy = false;
  #prime: SourceSnapshot | undefined;
  #initialCleanup: (() => void) | undefined;
  #unsubscribe: (() => void) | undefined;
  #sourceDestroyed = false;
  #subscribing = false;
  #doc: Document | undefined;
  #resize: ResizeObserver | undefined;
  #intersection: IntersectionObserver | undefined;
  #listeners: Array<() => void> = [];
  #externalAbort: (() => void) | undefined;
  constructor(options: GlassSceneOptions = {}) {
    if (!!options.source !== !!options.renderer || (options.source && typeof options.source.read !== 'function') ||
        (options.renderer && typeof options.renderer.render !== 'function') || (options.ownsSource && !options.source?.destroy)) {
      throw new SceneError('INVALID_OPTIONS', 'Use a source/renderer pair and an explicitly destroyable owned source');
    }
    const timeout = options.timeoutMs ?? 5000;
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60000) throw new SceneError('INVALID_OPTIONS', 'timeoutMs must be 1–60000');
    this.#options = { ...options }; this.#timeout = timeout;
    this.#doc = typeof document === 'undefined' ? undefined : document;
    this.#externalAbort = () => this.#fail(new SceneError('ABORTED', 'Scene aborted'));
    options.signal?.addEventListener('abort', this.#externalAbort, { once: true });
    this.#start();
    if (options.signal?.aborted) this.#externalAbort();
  }
  get ready(): Promise<void> { return this.#ready; }
  get state(): 'initializing' | 'ready' | 'paused' | 'failed' | 'destroyed' { return this.#state; }
  #report(cause: unknown): void { try { this.#options.onError?.(cause); } catch { /* Error observers do not own cleanup. */ } }
  #release(fn: (() => void) | undefined): void { try { fn?.(); } catch (cause) { this.#report(cause); } }
  #releaseFrame(frame: FramePixels): void { this.#release(frame?.release ? () => frame.release!() : undefined); }
  #alive(): void { if (this.#state === 'destroyed') throw new SceneError('DESTROYED', 'Scene destroyed'); }
  #stopJob(reason: SceneError): void { this.#job?.abort(reason); }
  #sourceDispose(): void {
    if (this.#options.ownsSource && !this.#sourceDestroyed) { this.#sourceDestroyed = true; this.#release(() => this.#options.source?.destroy?.()); }
  }
  #stopObservers(): void {
    const resize = this.#resize, intersection = this.#intersection; this.#resize = undefined; this.#intersection = undefined;
    this.#release(() => resize?.disconnect()); this.#release(() => intersection?.disconnect());
    for (const off of this.#listeners.splice(0)) this.#release(off);
    const off = this.#unsubscribe; this.#unsubscribe = undefined; this.#release(off);
  }
  #fail(cause: unknown): void {
    if (this.#state === 'destroyed' || this.#state === 'failed') return;
    this.#state = 'failed'; this.#generation++; this.#revision++;
    this.#controller.abort(cause); this.#stopJob(new SceneError('FAILED', 'Scene failed'));
    this.#dirty.clear(); this.#prime = undefined; this.#stopObservers();
    const cleanup = this.#initialCleanup; this.#initialCleanup = undefined; this.#release(cleanup);
    for (const e of this.#entries) { try { e.host.clear(); } catch (error) { this.#report(error); } }
    this.#sourceDispose(); this.#report(cause);
  }
  #start(): void {
    this.#state = 'initializing'; const generation = ++this.#generation;
    this.#controller = new AbortController();
    if (this.#options.signal?.aborted) this.#controller.abort(new SceneError('ABORTED', 'Scene aborted'));
    const signal = this.#controller.signal;
    this.#ready = (async () => {
      const initialize = this.#options.renderer?.initialize;
      if (initialize) {
        const cleanup = await bounded(s => initialize.call(this.#options.renderer, s), signal, this.#timeout, value => this.#release(typeof value === 'function' ? value : undefined));
        if (generation !== this.#generation || signal.aborted) { this.#release(typeof cleanup === 'function' ? cleanup : undefined); throw signal.reason; }
        if (cleanup !== undefined && typeof cleanup !== 'function') throw new SceneError('INVALID_OPTIONS', 'Initialize must return a cleanup function or void');
        this.#initialCleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
      // Hidden documents need a usable material baseline, not background source acquisition.
      if (this.#options.source && !this.#doc?.hidden) {
        const snapshot = await bounded(s => this.#options.source!.read({ signal: s }), signal, this.#timeout, () => {});
        if (generation !== this.#generation || signal.aborted) throw signal.reason;
        this.#prime = snapshot;
      }
      if (generation !== this.#generation || signal.aborted) throw signal.reason;
      this.#state = 'ready'; this.#observe(); this.#syncSubscription(); this.#queue();
    })().catch(cause => {
      if (generation === this.#generation && this.#state !== 'destroyed' && this.#state !== 'paused') this.#fail(cause);
      throw cause;
    });
    void this.#ready.catch(() => {});
  }
  #visible(e: Entry): boolean {
    const element = e.host.element, view = element.ownerDocument.defaultView;
    if (!e.live || !element.isConnected || !e.intersecting || !view || !element.clientWidth || !element.clientHeight) return false;
    if (view.getComputedStyle(element).visibility === 'hidden') return false;
    const r = element.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < view.innerHeight && r.left < view.innerWidth;
  }
  #active(): boolean { return this.#state === 'ready' && !this.#doc?.hidden; }
  #syncSubscription(): void {
    const active = () => this.#active() && [...this.#entries].some(e => this.#visible(e));
    if (active() && !this.#unsubscribe && !this.#subscribing && this.#options.source?.subscribe) {
      this.#subscribing = true;
      try {
        const off = this.#options.source.subscribe(() => { if (this.#state !== 'destroyed' && this.#state !== 'failed') this.invalidate(); });
        if (typeof off !== 'function') throw new SceneError('INVALID_OPTIONS', 'subscribe must return an unsubscribe function');
        if (active()) this.#unsubscribe = off; else this.#release(off);
      } catch (cause) { this.#fail(cause); }
      finally { this.#subscribing = false; }
    } else if (!active() && this.#unsubscribe) { const off = this.#unsubscribe; this.#unsubscribe = undefined; this.#release(off); }
  }
  #observe(): void {
    const doc = this.#doc, view = doc?.defaultView;
    if (!doc || !view || !this.#entries.size || this.#listeners.length || this.#state !== 'ready') return;
    const listen = (target: EventTarget, name: string, fn: EventListener, capture = false) => {
      target.addEventListener(name, fn, { passive: true, capture }); this.#listeners.push(() => target.removeEventListener(name, fn, capture));
    };
    const wake = () => this.invalidate();
    listen(view, 'scroll', wake, true); listen(view, 'resize', wake);
    listen(doc, 'visibilitychange', () => {
      if (doc.hidden) { this.#revision++; this.#prime = undefined; this.#stopJob(new SceneError('SUPERSEDED', 'Document hidden')); this.#syncSubscription(); }
      else this.invalidate();
    });
    if (typeof view.ResizeObserver === 'function') {
      this.#resize = new view.ResizeObserver(entries => {
        for (const item of entries) for (const e of this.#entries) if (e.host.element === item.target) {
          const size = e.host.measure();
          if (e.width !== size.width || e.height !== size.height) { e.width = size.width; e.height = size.height; this.#invalidate(e); }
        }
      });
    }
    if (typeof view.IntersectionObserver === 'function') {
      this.#intersection = new view.IntersectionObserver(entries => {
        for (const item of entries) for (const e of this.#entries) if (e.host.element === item.target && e.intersecting !== item.isIntersecting) {
          e.intersecting = item.isIntersecting; this.#invalidate(e);
        }
        this.#syncSubscription();
      });
    }
    for (const e of this.#entries) { this.#resize?.observe(e.host.element); this.#intersection?.observe(e.host.element); }
  }
  #invalidate(e: Entry): void {
    if (!e.live || this.#state === 'destroyed' || this.#state === 'failed') return;
    this.#revision++; this.#prime = undefined; this.#dirty.add(e); this.#syncSubscription(); this.#queue();
  }
  #queue(): void {
    if (this.#queued || this.#busy || !this.#active() || !this.#options.renderer || ![...this.#dirty].some(e => this.#visible(e))) return;
    this.#queued = true;
    queueMicrotask(() => { this.#queued = false; void this.#flush().catch(cause => this.#fail(cause)); });
  }
  async #flush(): Promise<void> {
    if (this.#busy || !this.#active() || !this.#options.renderer || !this.#options.source) return;
    const batch = [...this.#dirty].filter(e => this.#visible(e)); if (!batch.length) return;
    batch.forEach(e => this.#dirty.delete(e)); this.#busy = true;
    const generation = this.#generation, revision = this.#revision, controller = new AbortController(); this.#job = controller;
    try {
      let totalPixels = 0;
      for (const e of batch) { const size = e.host.measure(), dpr = e.host.element.ownerDocument.defaultView!.devicePixelRatio || 1; totalPixels += Math.round(size.width*dpr) * Math.round(size.height*dpr); }
      if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_PIXELS) throw new SceneError('INVALID_OPTIONS', 'Scene batch exceeds core output pixel limit');
      const snapshot = this.#prime ?? await bounded(s => this.#options.source!.read({ signal: s }), controller.signal, this.#timeout, () => {});
      this.#prime = undefined;
      for (const e of batch) {
        if (generation !== this.#generation || revision !== this.#revision || !this.#active() || !this.#visible(e)) break;
        const size = e.host.measure(), view = e.host.element.ownerDocument.defaultView!;
        const dpr = view.devicePixelRatio || 1, width = Math.round(size.width * dpr), height = Math.round(size.height * dpr);
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new SceneError('INVALID_OPTIONS', 'Host backing exceeds core limits');
        e.width = size.width; e.height = size.height;
        const box = e.host.element.getBoundingClientRect(), rect = Object.freeze({ x: box.x, y: box.y, width: box.width, height: box.height });
        const frame = await bounded(s => this.#options.renderer!.render(Object.freeze({ snapshot, width, height, dpr, rect }), s), controller.signal, this.#timeout, value => this.#releaseFrame(value));
        try { if (generation === this.#generation && revision === this.#revision && this.#active() && this.#visible(e)) e.host.present(frame); }
        finally { this.#releaseFrame(frame); }
      }
    } catch (cause) {
      if (generation === this.#generation && revision === this.#revision && this.#active()) this.#fail(cause);
    } finally {
      if (generation === this.#generation && revision !== this.#revision && this.#state !== 'failed') for (const e of batch) if (e.live) this.#dirty.add(e);
      if (this.#job === controller) this.#job = undefined;
      this.#busy = false; this.#syncSubscription(); this.#queue();
    }
  }
  attach(element: HTMLElement, options: GlassHostOptions = {}): GlassAttachment {
    this.#alive();
    if (this.#doc && this.#doc !== element.ownerDocument) throw new SceneError('INVALID_OPTIONS', 'A scene uses one document');
    this.#doc = element.ownerDocument;
    if (this.#entries.size >= MAX_SURFACES) throw new SceneError('INVALID_OPTIONS', 'At most sixteen hosts per scene');
    const host = mountGlassHost(element, options), size = host.measure();
    const e: Entry = { host, live: true, intersecting: true, width: size.width, height: size.height }; this.#entries.add(e); this.#dirty.add(e);
    try {
      const hadObservers = this.#listeners.length > 0; this.#observe();
      if (hadObservers) { this.#resize?.observe(element); this.#intersection?.observe(element); }
      this.#syncSubscription(); this.#queue();
    } catch (cause) { this.#entries.delete(e); this.#dirty.delete(e); host.dispose(); this.#fail(cause); throw cause; }
    return Object.freeze({ host,
      update: (next: Pick<GlassHostOptions, 'material'> = {}) => { if (!e.live) throw new SceneError('DESTROYED', 'Attachment disposed'); if (next.material !== undefined) host.setMaterial(next.material); this.#invalidate(e); },
      invalidate: () => { if (!e.live) throw new SceneError('DESTROYED', 'Attachment disposed'); this.#invalidate(e); },
      dispose: () => {
        if (!e.live) return; e.live = false; this.#revision++; this.#entries.delete(e); this.#dirty.delete(e);
        this.#release(() => this.#resize?.unobserve(element)); this.#release(() => this.#intersection?.unobserve(element)); this.#release(() => host.dispose()); this.#syncSubscription();
        if (!this.#entries.size) { this.#stopJob(new SceneError('SUPERSEDED', 'No attached hosts')); this.#stopObservers(); }
      }
    });
  }
  update(options: { readonly material?: GlassMaterial } = {}): void {
    this.#alive(); if (options.material !== undefined) for (const e of this.#entries) e.host.setMaterial(options.material); this.invalidate();
  }
  invalidate(): void {
    this.#alive(); if (this.#state === 'failed') return;
    this.#revision++; this.#prime = undefined; for (const e of this.#entries) this.#dirty.add(e); this.#syncSubscription(); this.#queue();
  }
  pause(): void {
    this.#alive(); if (this.#state === 'paused' || this.#state === 'failed') return;
    this.#state = 'paused'; this.#generation++; this.#revision++; const reason = new SceneError('PAUSED', 'Scene paused');
    this.#controller.abort(reason); this.#stopJob(reason); this.#prime = undefined; this.#stopObservers();
    const cleanup = this.#initialCleanup; this.#initialCleanup = undefined; this.#release(cleanup);
  }
  resume(): void { this.#alive(); if (this.#state === 'paused') { for (const e of this.#entries) this.#dirty.add(e); this.#start(); } }
  dispose(): void {
    if (this.#state === 'destroyed') return;
    this.#state = 'destroyed'; this.#generation++; this.#revision++;
    const reason = new SceneError('DESTROYED', 'Scene disposed'); this.#controller.abort(reason); this.#stopJob(reason); this.#stopObservers();
    const cleanup = this.#initialCleanup; this.#initialCleanup = undefined; this.#release(cleanup);
    for (const e of this.#entries) { e.live = false; try { e.host.dispose(); } catch (cause) { this.#report(cause); } }
    this.#entries.clear(); this.#dirty.clear(); this.#prime = undefined; this.#sourceDispose();
    if (this.#externalAbort) this.#options.signal?.removeEventListener('abort', this.#externalAbort);
    this.#externalAbort = undefined;
  }
}
export function createGlassScene(options: GlassSceneOptions = {}): GlassScene { return new GlassScene(options); }
