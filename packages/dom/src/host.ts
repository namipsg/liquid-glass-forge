import { createSource, MAX_PIXELS, type PixelBytes } from '@liquid-glass-forge/core';

export type GlassMaterial = 'glass' | 'opaque';
export interface HostPixels { readonly width: number; readonly height: number; readonly data: PixelBytes }
export interface GlassHostOptions { readonly target?: HTMLCanvasElement; readonly material?: GlassMaterial }
export interface GlassHost {
  readonly element: HTMLElement;
  readonly target: HTMLCanvasElement;
  measure(): Readonly<{ width: number; height: number }>;
  setMaterial(material: GlassMaterial): void;
  present(pixels: HostPixels): void;
  clear(): void;
  dispose(): void;
}
export class HostError extends Error {
  constructor(readonly code: 'INVALID_HOST' | 'INVALID_PIXELS' | 'UNAVAILABLE_HOST' | 'DISPOSED', message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'HostError';
  }
}
const owners = new WeakMap<HTMLElement, GlassHost>();
const materialValid = (value: unknown): value is GlassMaterial => value === 'glass' || value === 'opaque';

/** Own only a decorative target and explicitly touched host styles. Never move semantic children. */
export function mountGlassHost(element: HTMLElement, options: GlassHostOptions = {}): GlassHost {
  const doc = element?.ownerDocument, view = doc?.defaultView;
  if (!view || !(element instanceof view.HTMLElement) ||
      ['IMG','INPUT','CANVAS','VIDEO','AUDIO','TEXTAREA','SELECT','IFRAME','BR','HR','LINK','META'].includes(element.tagName) ||
      ['inline', 'contents'].includes(view.getComputedStyle(element).display)) throw new HostError('INVALID_HOST', 'Expected an HTML block or inline-block container');
  const position = view.getComputedStyle(element).position;
  const needsPosition = !position || position === 'static';
  if (owners.has(element)) throw new HostError('INVALID_HOST', 'Element already has a glass host');
  if (!materialValid(options.material ?? 'glass')) throw new HostError('INVALID_HOST', 'Invalid material');
  const supplied = options.target !== undefined;
  const target = options.target ?? doc.createElement('canvas');
  if (!(target instanceof view.HTMLCanvasElement) || (supplied && target.parentElement !== element)) {
    throw new HostError('INVALID_HOST', 'Supplied target must be a dedicated canvas child of the host');
  }
  const originalWidth = target.width, originalHeight = target.height;
  let originalPixels: ImageData | undefined;
  let context: CanvasRenderingContext2D | null = null;
  if (supplied) {
    if (originalWidth * originalHeight > MAX_PIXELS) throw new HostError('INVALID_HOST', 'Supplied backing exceeds core pixel bound');
    try {
      context = target.getContext('2d', { colorSpace: 'srgb' });
      if (!context) throw new Error('Canvas2D unavailable');
      if (originalWidth && originalHeight) originalPixels = context.getImageData(0, 0, originalWidth, originalHeight);
    } catch (cause) { throw new HostError('UNAVAILABLE_HOST', 'Supplied target must have a readable 2D backing', { cause }); }
  }
  const originalStyleAttributes = new Map<HTMLElement, string | null>([[element, element.getAttribute('style')], [target, target.getAttribute('style')]]);
  const undo: Array<() => void> = [];
  const styleRecords = new Map<CSSStyleDeclaration, Map<string, { value: string; priority: string; ownedValue: string; ownedPriority: string }>>();
  const style = (node: HTMLElement, key: string, value: string) => {
    let records = styleRecords.get(node.style);
    if (!records) { records = new Map(); styleRecords.set(node.style, records); }
    let record = records.get(key);
    if (!record) {
      record = { value: node.style.getPropertyValue(key), priority: node.style.getPropertyPriority(key), ownedValue: '', ownedPriority: '' };
      records.set(key, record);
      const saved = record;
      undo.push(() => {
        if (node.style.getPropertyValue(key) !== saved.ownedValue || node.style.getPropertyPriority(key) !== saved.ownedPriority) return;
        if (saved.value) node.style.setProperty(key, saved.value, saved.priority); else node.style.removeProperty(key);
      });
    }
    node.style.setProperty(key, value); record.ownedValue = node.style.getPropertyValue(key); record.ownedPriority = node.style.getPropertyPriority(key);
  };
  const attrRecords = new Map<string, { value: string | null; owned: string }>();
  const attr = (key: string, value: string) => {
    let record = attrRecords.get(key);
    if (!record) {
      record = { value: target.getAttribute(key), owned: value }; attrRecords.set(key, record); const saved = record;
      undo.push(() => { if (target.getAttribute(key) === saved.owned) { if (saved.value === null) target.removeAttribute(key); else target.setAttribute(key, saved.value); } });
    }
    target.setAttribute(key, value); record.owned = value;
  };
  const token = (node: HTMLElement, name: string) => {
    if (!node.classList.contains(name)) { const hadClass = node.hasAttribute('class'); node.classList.add(name); undo.push(() => { node.classList.remove(name); if (!node.className && !hadClass) node.removeAttribute('class'); }); }
  };
  let disposed = false, ownedWidth = target.width, ownedHeight = target.height, backingTouched = false;
  const alive = () => { if (disposed) throw new HostError('DISPOSED', 'Host is disposed'); };
  const restore = () => {
    if (backingTouched && target.width === ownedWidth && target.height === ownedHeight) {
      target.width = supplied ? originalWidth : 0; target.height = supplied ? originalHeight : 0;
      if (supplied && originalPixels) target.getContext('2d')?.putImageData(originalPixels, 0, 0);
    }
    originalPixels = undefined;
    for (const release of undo.reverse()) { try { release(); } catch { /* Continue releasing independent ownership. */ } }
    for (const [node, text] of originalStyleAttributes) {
      const expected = doc.createElement('div').style; expected.cssText = text ?? '';
      const keys = new Set([...Array.from(node.style), ...Array.from(expected)]);
      if ([...keys].every(key => node.style.getPropertyValue(key) === expected.getPropertyValue(key) && node.style.getPropertyPriority(key) === expected.getPropertyPriority(key))) {
        if (text === null) node.removeAttribute('style'); else node.setAttribute('style', text);
      }
    }
    if (!supplied) target.remove();
    context = null; owners.delete(element);
  };
  const host: GlassHost = Object.freeze({
    element, target,
    measure() { alive(); return Object.freeze({ width: element.clientWidth, height: element.clientHeight }); },
    setMaterial(material: GlassMaterial) {
      alive(); if (!materialValid(material)) throw new HostError('INVALID_HOST', 'Invalid material');
      attr('data-lgf-material', material);
      style(target, 'background-color', material === 'opaque' ? 'Canvas' : 'var(--lgf-tint, rgba(245,248,255,0.78))');
      const filter = material === 'opaque' ? 'none' : 'blur(var(--lgf-blur, 12px)) saturate(1.1)';
      style(target, 'backdrop-filter', filter); style(target, '-webkit-backdrop-filter', filter);
    },
    present(pixels: HostPixels) {
      alive();
      try { createSource({ contractVersion: 1, width: pixels.width, height: pixels.height, data: pixels.data, revision: 0, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' }); }
      catch (cause) { throw new HostError('INVALID_PIXELS', 'Expected bounded RGBA8 output', { cause }); }
      context ??= target.getContext('2d', { colorSpace: 'srgb' });
      if (!context) throw new HostError('UNAVAILABLE_HOST', 'Canvas2D is unavailable');
      target.width = pixels.width; target.height = pixels.height;
      ownedWidth = pixels.width; ownedHeight = pixels.height; backingTouched = true;
      const image = context.createImageData(pixels.width, pixels.height); image.data.set(pixels.data); context.putImageData(image, 0, 0);
    },
    clear() { alive(); target.width = 0; target.height = 0; ownedWidth = 0; ownedHeight = 0; backingTouched = true; },
    dispose() { if (disposed) return; disposed = true; restore(); }
  });
  try {
    token(element, 'lgf-host'); token(target, 'lgf-surface');
    if (needsPosition) { style(element, 'position', 'relative'); for (const key of ['top','right','bottom','left']) style(element, key, 'auto'); }
    style(element, 'isolation', 'isolate');
    for (const [key, value] of Object.entries({ display: 'block', 'box-sizing': 'border-box', 'margin-top':'0px','margin-right':'0px','margin-bottom':'0px','margin-left':'0px','border-width':'0px', padding:'0px', position: 'absolute', top: '0px', right: '0px', bottom: '0px', left: '0px', width: '100%', height: '100%', 'pointer-events': 'none', 'z-index': '-1', 'border-radius': 'inherit' })) style(target, key, value);
    attr('aria-hidden', 'true'); attr('role', 'presentation'); attr('tabindex', '-1');
    host.setMaterial(options.material ?? 'glass');
    if (!supplied) { target.width = 0; target.height = 0; ownedWidth = 0; ownedHeight = 0; backingTouched = true; element.prepend(target); }
    owners.set(element, host); return host;
  } catch (cause) { disposed = true; restore(); throw cause; }
}
