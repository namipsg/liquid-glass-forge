import { MAX_PIXELS } from '@liquid-glass-forge/core';

export interface Size { readonly width: number; readonly height: number }
export interface Rect extends Size { readonly x: number; readonly y: number }
export interface AxisTransform {
  readonly a: number; readonly b: number; readonly c: number;
  readonly d: number; readonly e: number; readonly f: number;
}
export interface MappingInput {
  readonly source: Size;
  /** Untransformed content box. x/y are viewport coordinates of its local origin. */
  readonly box: Rect;
  /** Desired output rectangle in viewport CSS pixels, including any clipped area. */
  readonly target: Rect;
  readonly fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  /** Fractions of remaining space, plus local CSS pixel offsets; not a CSS string parser. */
  readonly position?: { readonly x: number; readonly y: number; readonly offsetX?: number; readonly offsetY?: number };
  /** Additional viewport clip. The content box also clips the painted object. */
  readonly clip?: Rect;
  /** Extra intrinsic source pixels around the visible sample, clamped to its bounds. */
  readonly padding?: number;
  readonly dpr?: number;
  /** local -> viewport: box.origin + (a*x + e, d*y + f). Origin adjustments belong in e/f. */
  readonly transform?: AxisTransform;
}
export type MappingResult = Readonly<{
  ok: true;
  /** Padded crop, suitable for a core source crop. */
  crop: Rect;
  /** Unpadded visible sample in intrinsic source coordinates. */
  sample: Rect;
  /** Sample origin relative to crop, so padding never stretches the visible output. */
  sampleOffset: Readonly<{ x: number; y: number }>;
  /** Visible output region within backing, in backing pixels; may be fractional. */
  output: Rect;
  backing: Size;
  visible: Rect;
}> | Readonly<{ ok: false; code: 'INVALID_GEOMETRY' | 'UNSUPPORTED_TRANSFORM' | 'EMPTY_CLIP'; message: string }>;

const frozenRect = (r: Rect): Rect => Object.freeze(r);
const fail = (code: 'INVALID_GEOMETRY' | 'UNSUPPORTED_TRANSFORM' | 'EMPTY_CLIP', message: string): MappingResult => Object.freeze({ ok: false, code, message });
const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
function validRect(r: Rect): boolean {
  return !!r && Number.isFinite(r.x) && Number.isFinite(r.y) && positive(r.width) && positive(r.height) &&
    Number.isFinite(r.x + r.width) && Number.isFinite(r.y + r.height);
}
function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

/** Pure geometry; callers supply fresh viewport boxes on scroll/resize. No DOM capture. */
export function mapSourceRegion(input: MappingInput): MappingResult {
  if (!input || !input.source || !Number.isSafeInteger(input.source.width) || !Number.isSafeInteger(input.source.height) ||
      !positive(input.source.width) || !positive(input.source.height) || input.source.width * input.source.height > MAX_PIXELS ||
      !validRect(input.box) || !validRect(input.target) || (input.clip !== undefined && !validRect(input.clip))) {
    return fail('INVALID_GEOMETRY', 'Expected bounded intrinsic dimensions and finite positive viewport rectangles');
  }
  const { source, box, target } = input;
  const t = input.transform ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (![t.a, t.b, t.c, t.d, t.e, t.f].every(Number.isFinite) || t.a <= 0 || t.d <= 0 || t.b !== 0 || t.c !== 0 ||
      Object.keys(t).some(key => !['a', 'b', 'c', 'd', 'e', 'f'].includes(key))) {
    return fail('UNSUPPORTED_TRANSFORM', 'Only finite positive axis scale and translation are supported');
  }
  const dpr = input.dpr ?? 1, padding = input.padding ?? 0;
  const position = input.position ?? { x: 0.5, y: 0.5 };
  if (!positive(dpr) || !Number.isFinite(padding) || padding < 0 ||
      ![position.x, position.y, position.offsetX ?? 0, position.offsetY ?? 0].every(Number.isFinite)) {
    return fail('INVALID_GEOMETRY', 'Expected finite position, nonnegative source padding and positive DPR');
  }
  const backing = { width: Math.round(target.width * dpr), height: Math.round(target.height * dpr) };
  if (!Number.isSafeInteger(backing.width) || !Number.isSafeInteger(backing.height) || backing.width < 1 || backing.height < 1 ||
      backing.width * backing.height > MAX_PIXELS) return fail('INVALID_GEOMETRY', 'Output backing exceeds the core pixel limit');
  let width: number, height: number;
  const contain = Math.min(box.width / source.width, box.height / source.height);
  switch (input.fit ?? 'fill') {
    case 'fill': width = box.width; height = box.height; break;
    case 'contain': width = source.width * contain; height = source.height * contain; break;
    case 'cover': {
      const scale = Math.max(box.width / source.width, box.height / source.height);
      width = source.width * scale; height = source.height * scale; break;
    }
    case 'none': width = source.width; height = source.height; break;
    case 'scale-down': width = source.width * Math.min(1, contain); height = source.height * Math.min(1, contain); break;
    default: return fail('INVALID_GEOMETRY', 'Unsupported object-fit');
  }
  const object: Rect = { x: box.x + t.e + ((box.width - width) * position.x + (position.offsetX ?? 0)) * t.a,
    y: box.y + t.f + ((box.height - height) * position.y + (position.offsetY ?? 0)) * t.d,
    width: width * t.a, height: height * t.d };
  const viewportBox: Rect = { x: box.x + t.e, y: box.y + t.f, width: box.width * t.a, height: box.height * t.d };
  if (!validRect(object) || !validRect(viewportBox)) return fail('INVALID_GEOMETRY', 'Transformed geometry overflow');
  let visible = intersection(intersection(target, object), viewportBox);
  if (input.clip) visible = intersection(visible, input.clip);
  if (visible.width <= 0 || visible.height <= 0) return fail('EMPTY_CLIP', 'No readable source intersects the target');
  const clampX = (x: number) => Math.min(source.width, Math.max(0, x));
  const clampY = (y: number) => Math.min(source.height, Math.max(0, y));
  const x = clampX((visible.x - object.x) / object.width * source.width);
  const y = clampY((visible.y - object.y) / object.height * source.height);
  const right = clampX((visible.x + visible.width - object.x) / object.width * source.width);
  const bottom = clampY((visible.y + visible.height - object.y) / object.height * source.height);
  const sample = { x, y, width: right - x, height: bottom - y };
  if (sample.width <= 0 || sample.height <= 0) return fail('EMPTY_CLIP', 'Source intersection has no representable area');
  const cropX = clampX(x - padding), cropY = clampY(y - padding);
  const crop = { x: cropX, y: cropY, width: clampX(right + padding) - cropX, height: clampY(bottom + padding) - cropY };
  const output = { x: (visible.x - target.x) / target.width * backing.width,
    y: (visible.y - target.y) / target.height * backing.height,
    width: visible.width / target.width * backing.width, height: visible.height / target.height * backing.height };
  return Object.freeze({ ok: true, crop: frozenRect(crop), sample: frozenRect(sample),
    sampleOffset: Object.freeze({ x: x - cropX, y: y - cropY }), output: frozenRect(output),
    backing: Object.freeze(backing), visible: frozenRect(visible) });
}
