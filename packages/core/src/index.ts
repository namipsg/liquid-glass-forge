/** Data contracts only: no browser access or resource acquisition at import. */
export const CONTRACT_VERSION = 1 as const;
export const OPTICAL_MODEL = 'rounded-refraction-v1' as const;
export const MAX_PIXELS = 4_000_000;
export const MAX_SURFACES = 16;

export class ContractError extends TypeError {
  readonly code: 'INVALID_CONTRACT' | 'STALE_SOURCE';
  constructor(message: string, code: ContractError['code'] = 'INVALID_CONTRACT') {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

export type PixelBytes = Uint8Array | Uint8ClampedArray;
export type Ownership = 'borrowed' | 'transfer';
export interface SourceInput {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  readonly data: PixelBytes;
  readonly ownership: Ownership;
  readonly colorSpace: 'srgb';
  readonly alphaMode: 'straight';
}
export interface PixelSource extends SourceInput { readonly kind: 'rgba8' }
export interface SourceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface SurfaceInput {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly radius?: number;
  readonly bevel?: number;
  readonly strength?: number;
  readonly sourceRect?: SourceRect;
}
export interface SurfaceDescriptor {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly bevel: number;
  readonly strength: number;
  readonly sourceRect: Readonly<SourceRect>;
}
export interface FrameInput {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly generation: number;
  readonly revision: number;
  readonly sourceRevision: number;
  readonly surfaces: readonly SurfaceInput[];
}
export interface FrameDescriptor {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly opticalModel: typeof OPTICAL_MODEL;
  readonly generation: number;
  readonly revision: number;
  readonly sourceRevision: number;
  readonly surfaces: readonly Readonly<SurfaceDescriptor>[];
}

type RecordValue = Record<string, unknown>;
const byteViewBrand = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
function record(value: unknown, label: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ContractError(`${label} must be an object`);
  return value as RecordValue;
}
function finite(value: unknown, low: number, high: number, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw new ContractError(`${label} must be finite in [${low}, ${high}]`);
  }
}
function revision(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ContractError(`${label} must be a nonnegative safe integer`);
}
function dimensions(width: unknown, height: unknown): asserts width is number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || (width as number) < 1 || (height as number) < 1
    || (width as number) * (height as number) > MAX_PIXELS) throw new ContractError(`Dimensions must be positive safe integers totaling at most ${MAX_PIXELS} pixels`);
}
function version(value: unknown): void {
  if (value !== CONTRACT_VERSION) throw new ContractError('Unsupported contractVersion');
}
function keys(value: RecordValue, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new ContractError(`Unknown ${label} field: ${key}`);
}

/** Validates without copying, transferring, closing, freezing or mutating pixel storage. */
export function validateSource(input: unknown): asserts input is PixelSource {
  const source = record(input, 'source');
  keys(source, ['kind', 'contractVersion', 'width', 'height', 'revision', 'data', 'ownership', 'colorSpace', 'alphaMode'], 'source');
  version(source.contractVersion);
  if (source.kind !== 'rgba8' || source.colorSpace !== 'srgb' || source.alphaMode !== 'straight') {
    throw new ContractError('Only straight-alpha sRGB RGBA8 sources are supported');
  }
  dimensions(source.width, source.height);
  revision(source.revision, 'source.revision');
  if (source.ownership !== 'borrowed' && source.ownership !== 'transfer') throw new ContractError('Explicit source ownership is required');
  const bytes = source.data;
  let attachedBufferSize: number;
  try { attachedBufferSize = bufferSize.call((bytes as PixelBytes)?.buffer) as number; }
  catch { throw new ContractError('Source pixels must use an unshared ArrayBuffer'); }
  if (!ArrayBuffer.isView(bytes) || !['Uint8Array', 'Uint8ClampedArray'].includes(byteViewBrand.call(bytes) as string)
    || bytes.byteLength !== (source.width as number) * (source.height as number) * 4) {
    throw new ContractError('Source data must be an attached, unshared RGBA8 byte view of exactly width * height * 4 bytes');
  }
  if (source.ownership === 'transfer' && (bytes.byteOffset !== 0 || bytes.byteLength !== attachedBufferSize)) {
    throw new ContractError('Transfer ownership requires an entire dedicated buffer');
  }
}

export function createSource(input: SourceInput): Readonly<PixelSource> {
  const value = record(input, 'source');
  keys(value, ['kind', 'contractVersion', 'width', 'height', 'revision', 'data', 'ownership', 'colorSpace', 'alphaMode'], 'source');
  if (value.kind !== undefined && value.kind !== 'rgba8') throw new ContractError('Unsupported source kind');
  const source = { kind: 'rgba8', contractVersion: value.contractVersion, width: value.width, height: value.height,
    revision: value.revision, data: value.data, ownership: value.ownership, colorSpace: value.colorSpace, alphaMode: value.alphaMode };
  validateSource(source);
  return Object.freeze(source);
}

/** Creates an owned metadata snapshot; it never performs rendering or transfers pixels. */
export function createFrame(input: FrameInput, source: PixelSource): Readonly<FrameDescriptor> {
  validateSource(source);
  const frame = record(input, 'frame');
  keys(frame, ['contractVersion', 'generation', 'revision', 'sourceRevision', 'surfaces'], 'frame');
  version(frame.contractVersion);
  revision(frame.generation, 'frame.generation');
  revision(frame.revision, 'frame.revision');
  revision(frame.sourceRevision, 'frame.sourceRevision');
  if (frame.sourceRevision !== source.revision) throw new ContractError('Frame refers to a stale source revision', 'STALE_SOURCE');
  if (!Array.isArray(frame.surfaces) || frame.surfaces.length < 1 || frame.surfaces.length > MAX_SURFACES) {
    throw new ContractError(`A frame requires 1..${MAX_SURFACES} surfaces`);
  }
  const ids = new Set<string>();
  let pixels = 0;
  const surfaces = Array.from(frame.surfaces, (entry: unknown) => {
    const surface = record(entry, 'surface');
    keys(surface, ['id', 'width', 'height', 'radius', 'bevel', 'strength', 'sourceRect'], 'surface');
    if (typeof surface.id !== 'string' || surface.id.length < 1 || surface.id.length > 128 || ids.has(surface.id)) {
      throw new ContractError('Surface IDs must be nonempty, distinct strings of at most 128 characters');
    }
    ids.add(surface.id);
    dimensions(surface.width, surface.height);
    const width = surface.width as number, height = surface.height as number;
    pixels += width * height;
    if (pixels > MAX_PIXELS) throw new ContractError('Total output pixels exceed the frame budget');
    const radius = surface.radius === undefined ? Math.min(width, height) / 4 : surface.radius;
    const bevel = surface.bevel === undefined ? Math.min(width, height) / 5 : surface.bevel;
    const strength = surface.strength === undefined ? 12 : surface.strength;
    finite(radius, 0, Math.min(width, height) / 2, 'radius');
    finite(bevel, Number.MIN_VALUE, 1_000_000, 'bevel');
    finite(strength, 0, 1_000_000, 'strength');
    const rect = record(surface.sourceRect === undefined ? { x: 0, y: 0, width: source.width, height: source.height } : surface.sourceRect, 'sourceRect');
    keys(rect, ['x', 'y', 'width', 'height'], 'sourceRect');
    finite(rect.x, 0, source.width, 'sourceRect.x'); finite(rect.y, 0, source.height, 'sourceRect.y');
    finite(rect.width, Number.MIN_VALUE, source.width, 'sourceRect.width');
    finite(rect.height, Number.MIN_VALUE, source.height, 'sourceRect.height');
    if (rect.x + rect.width > source.width || rect.y + rect.height > source.height) throw new ContractError('Source rectangle must fit within the source');
    return Object.freeze({ id: surface.id, width, height, radius, bevel, strength,
      sourceRect: Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }) });
  });
  return Object.freeze({ contractVersion: CONTRACT_VERSION, opticalModel: OPTICAL_MODEL,
    generation: frame.generation as number, revision: frame.revision as number, sourceRevision: frame.sourceRevision as number,
    surfaces: Object.freeze(surfaces) });
}

/** Compare generation and source revision before accepting any future async result. */
export function isCurrentFrame(frame: FrameDescriptor, current: Pick<FrameDescriptor, 'generation' | 'revision' | 'sourceRevision'>): boolean {
  return frame.generation === current.generation && frame.revision === current.revision && frame.sourceRevision === current.sourceRevision;
}

export type LifecycleState = 'new' | 'initializing' | 'ready' | 'paused' | 'failed' | 'destroyed';
export type LifecycleEvent = 'initialize' | 'resolve' | 'pause' | 'resume' | 'fail' | 'destroy';
/** Pure lifecycle contract; no async initialization, scheduling or resource management is performed. */
export function transitionLifecycle(state: LifecycleState, event: LifecycleEvent): LifecycleState {
  const states: readonly string[] = ['new', 'initializing', 'ready', 'paused', 'failed', 'destroyed'];
  if (!states.includes(state)) throw new ContractError('Unknown lifecycle state');
  if (event === 'destroy') return 'destroyed';
  if (state === 'new' && event === 'initialize') return 'initializing';
  if (state === 'initializing' && event === 'resolve') return 'ready';
  if (state === 'ready' && event === 'pause') return 'paused';
  if (state === 'paused' && event === 'resume') return 'ready';
  if (['initializing', 'ready', 'paused'].includes(state) && event === 'fail') return 'failed';
  throw new ContractError(`Invalid lifecycle transition: ${state} -> ${event}`);
}

export function decodeSrgb(encoded: number): number {
  finite(encoded, 0, 1, 'encoded sRGB');
  return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}
export function encodeSrgb(linear: number): number {
  finite(linear, 0, 1, 'linear sRGB');
  if (linear === 0 || linear === 1) return linear;
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
}
export type Rgba = readonly [number, number, number, number];

/** Reference interpolation: straight sRGB inputs -> linear premultiplied blend -> straight sRGB. */
export function interpolateRgba(corners: readonly [Rgba, Rgba, Rgba, Rgba], x: number, y: number): Rgba {
  finite(x, 0, 1, 'x'); finite(y, 0, 1, 'y');
  if (!Array.isArray(corners) || corners.length !== 4) throw new ContractError('Four RGBA corners are required');
  const weights = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
  const channels = [0, 0, 0, 0];
  Array.from(corners).forEach((corner, index) => {
    if (!Array.isArray(corner) || corner.length !== 4) throw new ContractError('RGBA colors require four normalized channels');
    for (const value of corner) finite(value, 0, 1, 'RGBA channel');
    const alpha = corner[3], weight = weights[index]!;
    for (let c = 0; c < 3; c++) channels[c] = channels[c]! + decodeSrgb(corner[c]!) * alpha * weight;
    channels[3] = channels[3]! + alpha * weight;
  });
  const alpha = channels[3]!;
  if (alpha === 0) return Object.freeze([0, 0, 0, 0]);
  return Object.freeze([encodeSrgb(Math.min(1, channels[0]! / alpha)), encodeSrgb(Math.min(1, channels[1]! / alpha)),
    encodeSrgb(Math.min(1, channels[2]! / alpha)), alpha]);
}
