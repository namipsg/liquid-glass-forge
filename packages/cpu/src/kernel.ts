import { ContractError, MAX_PIXELS, decodeSrgb, encodeSrgb, validateSource } from '@liquid-glass-forge/core';
import type { PixelSource, SurfaceInput, SurfaceDescriptor } from '@liquid-glass-forge/core';

export const CPU_MATERIAL_MODEL = 'rounded-material-v1' as const;
export const CPU_LENS_MODEL = 'refractive-lens-v2' as const;
export interface CpuEffects {
  readonly model: typeof CPU_MATERIAL_MODEL | typeof CPU_LENS_MODEL;
  readonly blurRadius?: number;
  readonly dispersion?: number;
  readonly tint?: readonly [number, number, number, number];
  readonly rim?: number;
  readonly specular?: number;
  readonly light?: readonly [number, number];
}
export interface PreparedCpuSource { readonly width: number; readonly height: number; readonly revision: number }
export interface GeometrySample {
  readonly distance: number; readonly normalX: number; readonly normalY: number;
  readonly coverage: number; readonly weight: number;
}
interface Storage { opaque: boolean; geometry?: GeometryCache; data: Float32Array; blur?: Float32Array; scratch?: Float32Array; radius?: number }
const storage = new WeakMap<PreparedCpuSource, Storage>();
const ENCODING_STEPS = 4096;
export const CPU_LOOKUP_BYTES = 12296;
interface ColourTables { readonly decoded: Float64Array; readonly bytes: Uint16Array; readonly thresholds: Float64Array }
let colourTables: ColourTables | undefined;
/** Shared fixed storage per realm, separate from prepared-source storage. Lazy at first preparation. */
export function cpuKernelStorageBytes(): number { return colourTables === undefined ? 0 : CPU_LOOKUP_BYTES; }
function getColourTables(): ColourTables {
  if (colourTables === undefined) {
    const decoded = new Float64Array(256), bytes = new Uint16Array(ENCODING_STEPS), thresholds = new Float64Array(257);
    for (let byte = 0; byte < decoded.length; byte++) decoded[byte] = decodeSrgb(byte / 255);
    for (let byte = 1; byte <= 255; byte++) thresholds[byte] = decodeSrgb((byte - .5) / 255);
    thresholds[256] = Infinity;
    for (let i = 0; i < bytes.length; i++) {
      const guess = Math.round(encodeSrgb((i + .5) / ENCODING_STEPS) * 255);
      const low = i / ENCODING_STEPS, high = (i + 1) / ENCODING_STEPS, guard = 8 * Number.EPSILON;
      const sensitive = (low <= thresholds[guess]! + guard && high >= thresholds[guess]! - guard)
        || (low <= thresholds[guess + 1]! + guard && high >= thresholds[guess + 1]! - guard);
      bytes[i] = guess | (sensitive ? 256 : 0);
    }
    colourTables = { decoded, bytes, thresholds };
  }
  return colourTables;
}
// A bucket spans less than one byte at the maximum sRGB slope. Correct the
// midpoint guess using inverse thresholds, preserving the original floating
// encode/round decision when an inverse lands extremely close to a half byte.
function encodeSrgbByte(value: number, table: ColourTables): number {
  if (value >= 1) return 255;
  const entry = table.bytes[Math.floor(value * ENCODING_STEPS)]!;
  if (entry < 256) return entry;
  let byte = entry & 255;
  if (value >= table.thresholds[byte + 1]!) byte++;
  else if (value < table.thresholds[byte]!) byte--;
  if (Math.abs(value - table.thresholds[byte]!) <= 8 * Number.EPSILON
    || Math.abs(value - table.thresholds[byte + 1]!) <= 8 * Number.EPSILON) return Math.round(encodeSrgb(value) * 255);
  return byte;
}
const clamp = (v: number, low = 0, high = 1): number => Math.min(high, Math.max(low, v));
function object(value: unknown, allowed: readonly string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError(`${label} must be an object`);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ContractError(`Unknown ${label} field`);
}
function finite(value: number, low: number, high: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw new ContractError(`Invalid ${label}`);
}
function dimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new ContractError('Invalid CPU dimensions');
}
function live(prepared: PreparedCpuSource): Storage {
  const entry = storage.get(prepared);
  if (!entry) throw new ContractError('Unknown or disposed prepared source');
  return entry;
}

/** Snapshots all caller bytes. Only opaque metadata escapes; no caller resource is transferred. */
export function prepareCpuSource(source: PixelSource): PreparedCpuSource {
  validateSource(source);
  const data = new Float32Array(source.data.length);
  const decoded = getColourTables().decoded;
  let opaque = true;
  for (let i = 0; i < data.length; i += 4) {
    const a = source.data[i + 3]! / 255;
    data[i] = decoded[source.data[i]!]! * a;
    data[i + 1] = decoded[source.data[i + 1]!]! * a;
    data[i + 2] = decoded[source.data[i + 2]!]! * a;
    data[i + 3] = a; if (a !== 1) opaque = false;
  }
  const prepared = Object.freeze({ width: source.width, height: source.height, revision: source.revision });
  storage.set(prepared, { data, opaque });
  return prepared;
}
export function disposeCpuSource(prepared: PreparedCpuSource): void { storage.delete(prepared); }
export function preparedStorageBytes(prepared: PreparedCpuSource): number {
  const s = storage.get(prepared);
  return s ? s.data.byteLength + (s.blur?.byteLength ?? 0) + (s.scratch?.byteLength ?? 0) + (s.geometry?.bytes ?? 0) : 0;
}

export const CPU_GEOMETRY_MAX_BYTES = 270000;
interface GeometryCache {
  key: string; bytes: number; n: number; corners: Float64Array; xs: Float64Array; ys: Float64Array; classes?: Uint8Array;
  axes?: { baseX: Float64Array; dx: Float64Array; dy: Float64Array };
  sourceResampling?: boolean; resampled?: { key: string; rgb: Uint8Array };
  identity?: Uint8Array;
}
function geometryCache(s: Storage, w: number, h: number, r: number, b: number, preferResampling = false): GeometryCache | undefined {
  const n = Math.ceil(Math.max(0, r - .5)), bytes = (w + h + n * n * 4) * 8;
  if (w * h < 4096 || bytes > CPU_GEOMETRY_MAX_BYTES) { delete s.geometry; return undefined; }
  const identityBytes = Math.ceil(w * h / 8);
  const sourceResampling = preferResampling && bytes + w * h * 3 + identityBytes <= CPU_GEOMETRY_MAX_BYTES;
  const key = `${w}/${h}/${r}/${b}/${sourceResampling}`;
  if (s.geometry?.key === key) return s.geometry;
  const xs = new Float64Array(w), ys = new Float64Array(h), corners = new Float64Array(n*n*4);
  for(let x=0;x<w;x++) xs[x]=geometry(w,h,r,b,x,Math.floor(h/2)).weight;
  for(let y=0;y<h;y++) ys[y]=geometry(w,h,r,b,Math.floor(w/2),y).weight;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const g=geometry(w,h,r,b,w-1-x,h-1-y),i=(y*n+x)*4;corners[i]=g.coverage;corners[i+1]=g.normalX;corners[i+2]=g.normalY;corners[i+3]=g.weight;}
  const identity = sourceResampling ? new Uint8Array(identityBytes) : undefined;
  if (identity) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = geometry(w, h, r, b, x, y), pixel = y * w + x;
    if (g.coverage === 1 && g.weight === 0) identity[pixel >> 3]! |= 1 << (pixel & 7);
  }
  const scratchBytes = (w * 2 + h) * Float64Array.BYTES_PER_ELEMENT;
  const classes = !sourceResampling && s.opaque && bytes + w * h + scratchBytes <= CPU_GEOMETRY_MAX_BYTES ? new Uint8Array(w * h) : undefined;
  if (classes) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + .5 - w / 2, py = y + .5 - h / 2, ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y);
    let kind = 1; // Exact identity region, including a zero-normal center.
    if (ex < n && ey < n) kind = Math.round(corners[(ey * n + ex) * 4]! * 255) === 0 ? 0 : 6;
    else if (Math.abs(px) - w / 2 > Math.abs(py) - h / 2) {
      if (xs[x] !== 0 && px !== 0) kind = px < 0 ? 2 : 3;
    } else if (ys[y] !== 0 && py !== 0) kind = py < 0 ? 4 : 5;
    classes[y * w + x] = kind;
  }
  return s.geometry={key,bytes:bytes+(classes?.byteLength??0)+(classes?scratchBytes:0)+(identity?.byteLength??0),n,corners,xs,ys,sourceResampling,
    ...(identity?{identity}:{}),
    ...(classes?{classes,axes:{baseX:new Float64Array(w),dx:new Float64Array(w),dy:new Float64Array(h)}}:{})};
}
/** Exact source resampling only: independent of mask, coverage, strength and material. */
function resampledSourceRgb(prepared: PreparedCpuSource, data: Float32Array, surface: SurfaceDescriptor,
  geo: GeometryCache, encoding: ColourTables): Uint8Array {
  const { width, height, sourceRect: rect } = surface;
  const key = `${rect.x}/${rect.y}/${rect.width}/${rect.height}`;
  if (geo.resampled?.key === key) return geo.resampled.rgb;
  delete geo.resampled;
  geo.bytes = geo.corners.byteLength + geo.xs.byteLength + geo.ys.byteLength + (geo.identity?.byteLength ?? 0);
  const rgb = new Uint8Array(width * height * 3), stride = prepared.width * 4;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = ((rect.y + y * 2) * prepared.width + rect.x + x * 2) * 4, b = a + 4, c = a + stride, d = c + 4;
    const index = (y * width + x) * 3;
    // Same exact Float32-domain half/half mean proved in the classified path.
    for (let k = 0; k < 3; k++) rgb[index + k] = encodeSrgbByte((data[a + k]! + data[b + k]! + data[c + k]! + data[d + k]!) * .25, encoding);
  }
  geo.bytes += rgb.byteLength; geo.resampled = { key, rgb }; return rgb;
}
function cachedGeometry(c:GeometryCache|undefined,w:number,h:number,r:number,b:number,x:number,y:number):GeometrySample {
  if(!c)return geometry(w,h,r,b,x,y);
  const px=x+.5-w/2,py=y+.5-h/2,ex=Math.min(x,w-1-x),ey=Math.min(y,h-1-y);
  if(ex<c.n&&ey<c.n){const i=(ey*c.n+ex)*4;return{distance:0,coverage:c.corners[i]!,normalX:c.corners[i+1]!*Math.sign(px),normalY:c.corners[i+2]!*Math.sign(py),weight:c.corners[i+3]!};}
  const dominantX=Math.abs(px)-w/2>Math.abs(py)-h/2;
  return{distance:0,coverage:1,normalX:dominantX?Math.sign(px):0,normalY:dominantX?0:Math.sign(py),weight:dominantX?c.xs[x]!:c.ys[y]!};
}
function geometry(width: number, height: number, radius: number, bevel: number, x: number, y: number): GeometrySample {
  const px = x + .5 - width / 2, py = y + .5 - height / 2;
  const qx = Math.abs(px) - (width / 2 - radius), qy = Math.abs(py) - (height / 2 - radius);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0), length = ax === 0 ? ay : ay === 0 ? ax : Math.hypot(ax, ay);
  const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
  let normalX = 0, normalY = 0;
  if (length > 0) { normalX = ax / length * Math.sign(px); normalY = ay / length * Math.sign(py); }
  else if (Math.abs(px) - width / 2 > Math.abs(py) - height / 2) normalX = Math.sign(px);
  else normalY = Math.sign(py);
  return { distance, normalX, normalY, coverage: clamp(.5 - distance), weight: clamp(1 + distance / bevel) ** 2 };
}
export function sampleGeometry(width: number, height: number, radius: number, bevel: number, x: number, y: number): GeometrySample {
  dimensions(width, height); finite(radius, 0, Math.min(width, height) / 2, 'radius'); finite(bevel, Number.MIN_VALUE, 1_000_000, 'bevel');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) throw new ContractError('Invalid geometry pixel');
  return Object.freeze(geometry(width, height, radius, bevel, x, y));
}
function surfaceOptions(input: SurfaceInput, source: PreparedCpuSource): SurfaceDescriptor {
  object(input, ['id', 'width', 'height', 'radius', 'bevel', 'strength', 'sourceRect'], 'surface');
  const { width, height } = input; dimensions(width, height);
  if (typeof input.id !== 'string' || input.id.length < 1 || input.id.length > 128) throw new ContractError('Invalid surface id');
  const radius = input.radius === undefined ? Math.min(width, height) / 4 : input.radius;
  const bevel = input.bevel === undefined ? Math.min(width, height) / 5 : input.bevel, strength = input.strength === undefined ? 12 : input.strength;
  finite(radius, 0, Math.min(width, height) / 2, 'radius'); finite(bevel, Number.MIN_VALUE, 1_000_000, 'bevel'); finite(strength, 0, 1_000_000, 'strength');
  const rect = input.sourceRect === undefined ? { x: 0, y: 0, width: source.width, height: source.height } : input.sourceRect;
  object(rect, ['x', 'y', 'width', 'height'], 'sourceRect');
  finite(rect.x, 0, source.width, 'sourceRect.x'); finite(rect.y, 0, source.height, 'sourceRect.y');
  finite(rect.width, Number.MIN_VALUE, source.width, 'sourceRect.width'); finite(rect.height, Number.MIN_VALUE, source.height, 'sourceRect.height');
  if (rect.x + rect.width > source.width || rect.y + rect.height > source.height) throw new ContractError('Source rectangle exceeds source');
  return { id: input.id, width, height, radius, bevel, strength, sourceRect: rect };
}
function effectOptions(input?: CpuEffects): { lens: boolean; blurRadius: number; dispersion: number; tint: readonly number[]; rim: number; specular: number; light: readonly number[] } {
  if (input !== undefined) {
    object(input, ['model', 'blurRadius', 'dispersion', 'tint', 'rim', 'specular', 'light'], 'effects');
    if (input.model !== CPU_MATERIAL_MODEL && input.model !== CPU_LENS_MODEL) throw new ContractError('Unsupported CPU material model');
  }
  const blurRadius = input?.blurRadius === undefined ? 0 : input.blurRadius, dispersion = input?.dispersion === undefined ? 0 : input.dispersion;
  const rim = input?.rim === undefined ? 0 : input.rim, specular = input?.specular === undefined ? 0 : input.specular;
  finite(blurRadius, 0, 16, 'blurRadius'); if (!Number.isInteger(blurRadius)) throw new ContractError('blurRadius must be an integer');
  finite(dispersion, 0, 1, 'dispersion'); finite(rim, 0, 1, 'rim'); finite(specular, 0, 1, 'specular');
  const tint = input?.tint === undefined ? [0, 0, 0, 0] : input.tint;
  const light = input?.light === undefined ? [-Math.SQRT1_2, -Math.SQRT1_2] : input.light;
  if (!Array.isArray(tint) || tint.length !== 4) throw new ContractError('Tint requires four normalized channels');
  for (let i = 0; i < 4; i++) finite(tint[i]!, 0, 1, 'tint');
  if (!Array.isArray(light) || light.length !== 2) throw new ContractError('Light requires a nonzero finite direction');
  for (let i = 0; i < 2; i++) finite(light[i]!, -Number.MAX_VALUE, Number.MAX_VALUE, 'light');
  const scale = Math.max(Math.abs(light[0]!), Math.abs(light[1]!));
  if (scale === 0) throw new ContractError('Light direction must be nonzero');
  const lx = light[0]! / scale, ly = light[1]! / scale, length = Math.hypot(lx, ly);
  return { lens: input?.model === CPU_LENS_MODEL, blurRadius, dispersion, tint: [decodeSrgb(tint[0]!), decodeSrgb(tint[1]!), decodeSrgb(tint[2]!), tint[3]!], rim, specular, light: [lx / length, ly / length] };
}
/** Validate and freeze a data-only snapshot before asynchronous execution. */
export function snapshotCpuEffects(input?: CpuEffects): CpuEffects | undefined {
  effectOptions(input);
  if (input === undefined) return undefined;
  return Object.freeze({ ...input,
    ...(input.tint === undefined ? {} : { tint: Object.freeze([...input.tint]) as readonly [number, number, number, number] }),
    ...(input.light === undefined ? {} : { light: Object.freeze([...input.light]) as readonly [number, number] }) });
}

/** Two sliding box passes; storage is reused for the next radius, never accumulated. */
function blurred(source: PreparedCpuSource, s: Storage, radius: number): Float32Array {
  if (radius === 0) return s.data;
  if (s.radius === radius) return s.blur!;
  s.scratch ??= new Float32Array(s.data.length); s.blur ??= new Float32Array(s.data.length);
  const width = source.width, height = source.height, divisor = 2 * radius + 1;
  for (let y = 0; y < height; y++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += s.data[(y * width + clamp(k, 0, width - 1)) * 4 + c]!;
    for (let x = 0; x < width; x++) {
      s.scratch[(y * width + x) * 4 + c] = sum / divisor;
      sum += s.data[(y * width + clamp(x + radius + 1, 0, width - 1)) * 4 + c]! - s.data[(y * width + clamp(x - radius, 0, width - 1)) * 4 + c]!;
    }
  }
  for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += s.scratch[(clamp(k, 0, height - 1) * width + x) * 4 + c]!;
    for (let y = 0; y < height; y++) {
      s.blur[(y * width + x) * 4 + c] = sum / divisor;
      sum += s.scratch[(clamp(y + radius + 1, 0, height - 1) * width + x) * 4 + c]! - s.scratch[(clamp(y - radius, 0, height - 1) * width + x) * 4 + c]!;
    }
  }
  s.radius = radius;
  return s.blur;
}
function sample(data: Float32Array, width: number, height: number, x: number, y: number, out: number[]): void {
  const sx = clamp(x, 0, width - 1), sy = clamp(y, 0, height - 1), x0 = Math.floor(sx), y0 = Math.floor(sy);
  const tx = sx - x0, ty = sy - y0;
  const a = (y0 * width + x0) * 4, b = (y0 * width + Math.min(x0 + 1, width - 1)) * 4;
  const c = (Math.min(y0 + 1, height - 1) * width + x0) * 4, d = (Math.min(y0 + 1, height - 1) * width + Math.min(x0 + 1, width - 1)) * 4;
  for (let k = 0; k < 4; k++) out[k] = (data[a + k]! * (1 - tx) + data[b + k]! * tx) * (1 - ty) + (data[c + k]! * (1 - tx) + data[d + k]! * tx) * ty;
}
const byteBrand = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!.get!;
const byteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;

/** Classification caches geometry decisions only; optical strength is evaluated on every call. */
function renderClassifiedOpaque(prepared: PreparedCpuSource, surface: SurfaceDescriptor, data: Float32Array,
  geo: GeometryCache, encoding: ColourTables, output: Uint8ClampedArray): Uint8ClampedArray {
  const { width, height, strength, sourceRect: rect } = surface;
  const sourceWidth = prepared.width, maxX = sourceWidth - 1, maxY = prepared.height - 1;
  const scaleX = rect.width / width, scaleY = rect.height / height, classes = geo.classes!, axes = geo.axes!;
  const halfTexels = scaleX === 2 && scaleY === 2 && Number.isInteger(rect.x) && Number.isInteger(rect.y);
  const sourceStride = sourceWidth * 4;
  // Scratch is recomputed for current optical state, rather than cached across
  // strength/crop changes. It contains coordinates, never sampled source pixels.
  for (let x = 0; x < width; x++) {
    axes.baseX[x] = rect.x + (x + .5) * scaleX - .5;
    axes.dx[x] = Math.sign(x + .5 - width / 2) * strength * geo.xs[x]! * scaleX;
  }
  for (let y = 0; y < height; y++) axes.dy[y] = Math.sign(y + .5 - height / 2) * strength * geo.ys[y]! * scaleY;
  let index = 0;
  for (let y = 0; y < height; y++) {
    const baseY = rect.y + (y + .5) * scaleY - .5;
    const halfRow = ((rect.y + y * 2) * sourceWidth + rect.x) * 4;
    for (let x = 0; x < width; x++, index += 4) {
      const kind = classes[index / 4]!;
      if (kind === 0) { output[index] = 0; output[index + 1] = 0; output[index + 2] = 0; output[index + 3] = 0; continue; }
      if (halfTexels && kind === 1) {
        // Opaque sRGB8-decoded Float32 values are multiples of 2^-35.
        // Four sum to <=4, so every addition fits binary64 exactly (<38 bits).
        // This mean equals half/half bilinear interpolation, including byte ties.
        const a = halfRow + x * 8, b = a + 4, c = a + sourceStride, d = c + 4;
        output[index] = encodeSrgbByte((data[a]! + data[b]! + data[c]! + data[d]!) * .25, encoding);
        output[index + 1] = encodeSrgbByte((data[a + 1]! + data[b + 1]! + data[c + 1]! + data[d + 1]!) * .25, encoding);
        output[index + 2] = encodeSrgbByte((data[a + 2]! + data[b + 2]! + data[c + 2]! + data[d + 2]!) * .25, encoding);
        output[index + 3] = 255; continue;
      }
      let dx = 0, dy = 0, alphaByte = 255;
      if (kind === 2 || kind === 3) dx = axes.dx[x]!;
      else if (kind === 4 || kind === 5) dy = axes.dy[y]!;
      else if (kind === 6) {
        const ex = Math.min(x, width - 1 - x), ey = Math.min(y, height - 1 - y), at = (ey * geo.n + ex) * 4;
        const nx = geo.corners[at + 1]! * Math.sign(x + .5 - width / 2), ny = geo.corners[at + 2]! * Math.sign(y + .5 - height / 2);
        const weight = geo.corners[at + 3]!;
        dx = nx * strength * weight * scaleX; dy = ny * strength * weight * scaleY;
        alphaByte = Math.round(geo.corners[at]! * 255);
      }
      const baseX = axes.baseX[x]!;
      const rawX = baseX + dx, rawY = baseY + dy;
      const sx = rawX < 0 ? 0 : rawX > maxX ? maxX : rawX, sy = rawY < 0 ? 0 : rawY > maxY ? maxY : rawY;
      // Validated source dimensions total at most MAX_PIXELS (four million).
      // Clamped nonnegative coordinates therefore fit exact signed32 truncation.
      const x0 = sx | 0, y0 = sy | 0, x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const tx = sx - x0, ty = sy - y0, oneX = 1 - tx, oneY = 1 - ty;
      const a = (y0 * sourceWidth + x0) * 4, b = (y0 * sourceWidth + x1) * 4;
      const c = (y1 * sourceWidth + x0) * 4, d = (y1 * sourceWidth + x1) * 4;
      const red = (data[a]! * oneX + data[b]! * tx) * oneY + (data[c]! * oneX + data[d]! * tx) * ty;
      const green = (data[a + 1]! * oneX + data[b + 1]! * tx) * oneY + (data[c + 1]! * oneX + data[d + 1]! * tx) * ty;
      const blue = (data[a + 2]! * oneX + data[b + 2]! * tx) * oneY + (data[c + 2]! * oneX + data[d + 2]! * tx) * ty;
      output[index + 3] = alphaByte;
      // Convex interpolation is nonnegative; encodeSrgbByte already saturates >=1.
      output[index] = encodeSrgbByte(red, encoding); output[index + 1] = encodeSrgbByte(green, encoding); output[index + 2] = encodeSrgbByte(blue, encoding);
    }
  }
  return output;
}

/** Pure JavaScript optics, straight-alpha sRGB RGBA8 output. No Canvas or WebGL access. */
export function renderCpu(prepared: PreparedCpuSource, input: SurfaceInput, effects?: CpuEffects, output?: Uint8ClampedArray): Uint8ClampedArray {
  const s = live(prepared), surface = surfaceOptions(input, prepared), e = effectOptions(effects);
  const { width, height, radius, bevel, strength, sourceRect: rect } = surface;
  // A bevel wider than the corner's curvature reaches the SDF medial axis,
  // where the nearest edge (and its normal) changes discontinuously. Keep the
  // v2 ray profile outside that axis; a sharp corner has only subpixel bevel.
  // The versioned v1 material retains its original geometry.
  const opticalBevel = e.lens ? Math.min(bevel, Math.max(radius, .5)) : bevel;
  if (output === undefined) output = new Uint8ClampedArray(width * height * 4);
  try { byteLength.call(output.buffer); } catch { throw new ContractError('CPU output requires an attached unshared buffer'); }
  if (byteBrand.call(output) !== 'Uint8ClampedArray' || output.byteLength !== width * height * 4) throw new ContractError('Invalid CPU output storage');
  const data = blurred(prepared, s, e.blurRadius), scaleX = rect.width / width, scaleY = rect.height / height;
  const encoding = getColourTables();
  const baseline = !e.lens && e.blurRadius===0 && e.dispersion===0 && e.tint[3]===0 && e.rim===0 && e.specular===0;
  const preferResampling = baseline && s.opaque && scaleX === 2 && scaleY === 2 && Number.isInteger(rect.x) && Number.isInteger(rect.y);
  const geo = baseline ? geometryCache(s,width,height,radius,bevel,preferResampling) : undefined;
  const sourceRgb = geo?.sourceResampling ? resampledSourceRgb(prepared, data, surface, geo, encoding) : undefined;
  if (baseline && s.opaque && geo?.classes) return renderClassifiedOpaque(prepared, surface, data, geo, encoding, output);
  const center = [0, 0, 0, 0], shifted = [0, 0, 0, 0], rgb = [0, 0, 0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const pixel = y * width + x;
    if (sourceRgb && (geo!.identity![pixel >> 3]! & (1 << (pixel & 7)))) {
      const at = pixel * 3;
      output[index] = sourceRgb[at]!; output[index + 1] = sourceRgb[at + 1]!; output[index + 2] = sourceRgb[at + 2]!; output[index + 3] = 255;
      continue;
    }
    let coverage=1,normalX=0,normalY=0,weight=0;
    if(baseline&&geo){
      const px=x+.5-width/2,py=y+.5-height/2,ex=Math.min(x,width-1-x),ey=Math.min(y,height-1-y);
      if(ex<geo.n&&ey<geo.n){const i=(ey*geo.n+ex)*4;coverage=geo.corners[i]!;normalX=geo.corners[i+1]!*Math.sign(px);normalY=geo.corners[i+2]!*Math.sign(py);weight=geo.corners[i+3]!;}
      else if(Math.abs(px)-width/2>Math.abs(py)-height/2){normalX=Math.sign(px);weight=geo.xs[x]!;}
      else{normalY=Math.sign(py);weight=geo.ys[y]!;}
    }else{const g=geometry(width,height,radius,opticalBevel,x,y);coverage=g.coverage;normalX=g.normalX;normalY=g.normalY;weight=g.weight;}
    if (coverage === 0) { output.fill(0, index, index + 4); continue; }
    const baseX = rect.x + (x + .5) * scaleX - .5, baseY = rect.y + (y + .5) * scaleY - .5;
    // Opt-in v2: trace an air-to-glass ray through an elliptical bevel
    // (eta = 1 / 1.5). Backdrop sampling bends inward; v1 remains unchanged.
    let displacement = weight;
    if (e.lens && weight > 0) {
      const u = Math.sqrt(weight), nz = Math.sqrt(Math.max(0, 1 - u * u)), eta = 2 / 3;
      const bend = Math.sqrt(1 - eta * eta * u * u) - eta * nz;
      displacement = -u * bend / (eta + bend * nz);
    }
    const dx = normalX * strength * displacement * scaleX, dy = normalY * strength * displacement * scaleY;
    if (sourceRgb && dx === 0 && dy === 0) {
      output[index + 3] = Math.round(coverage * 255);
      const at = (y * width + x) * 3;
      output[index] = output[index + 3] === 0 ? 0 : sourceRgb[at]!;
      output[index + 1] = output[index + 3] === 0 ? 0 : sourceRgb[at + 1]!;
      output[index + 2] = output[index + 3] === 0 ? 0 : sourceRgb[at + 2]!;
      continue;
    }
    if(baseline && s.opaque){
      const sx=clamp(baseX+dx,0,prepared.width-1),sy=clamp(baseY+dy,0,prepared.height-1),x0=Math.floor(sx),y0=Math.floor(sy),tx=sx-x0,ty=sy-y0;
      const a=(y0*prepared.width+x0)*4,b=(y0*prepared.width+Math.min(x0+1,prepared.width-1))*4,c=(Math.min(y0+1,prepared.height-1)*prepared.width+x0)*4,d=(Math.min(y0+1,prepared.height-1)*prepared.width+Math.min(x0+1,prepared.width-1))*4;
      output[index+3]=Math.round(coverage*255);
      for(let k=0;k<3;k++)output[index+k]=output[index+3]===0?0:encodeSrgbByte(clamp((data[a+k]!*(1-tx)+data[b+k]!*tx)*(1-ty)+(data[c+k]!*(1-tx)+data[d+k]!*tx)*ty),encoding);
      continue;
    }
    sample(data, prepared.width, prepared.height, baseX + dx, baseY + dy, center);
    const alpha = center[3]!;
    output[index + 3] = Math.round(clamp(alpha) * coverage * 255);
    if (output[index + 3] === 0) { output.fill(0, index, index + 3); continue; }
    for (let c = 0; c < 3; c++) rgb[c] = alpha > 0 ? clamp(center[c]! / alpha) : 0;
    if (e.dispersion > 0) for (const c of [0, 2]) {
      const multiplier = c === 0 ? 1 + e.dispersion : 1 - e.dispersion;
      sample(data, prepared.width, prepared.height, baseX + dx * multiplier, baseY + dy * multiplier, shifted);
      rgb[c] = shifted[3]! > 0 ? clamp(shifted[c]! / shifted[3]!) : 0;
    }
    if(baseline){for(let c=0;c<3;c++)output[index+c]=encodeSrgbByte(rgb[c]!, encoding);continue;}
    const highlight = clamp(weight * (e.rim + e.specular * Math.max(normalX * e.light[0]! + normalY * e.light[1]!, 0) ** 8));
    for (let c = 0; c < 3; c++) {
      const tinted = rgb[c]! * (1 - e.tint[3]!) + e.tint[c]! * e.tint[3]!;
      output[index + c] = encodeSrgbByte(clamp(tinted + (1 - tinted) * highlight), encoding);
    }
  }
  return output;
}
