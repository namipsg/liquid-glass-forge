// Phase 1 optical feasibility spike: rounded-mask edge refraction only.
// This intentionally excludes production blur, highlights, and compositing.
const MAX_PIXELS = 4_000_000;
const MAX_EFFECT = 1_000_000;
const ENCODING_STEPS = 4096;
export const CPU_ENCODING_TABLE_BYTES = ENCODING_STEPS + 257 * Float64Array.BYTES_PER_ELEMENT;
let encodingTable;
let geometryCache;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function dimensions(width, height, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new RangeError(`${label} dimensions must be positive integers totaling at most ${MAX_PIXELS} pixels`);
  }
}

function finiteRange(value, low, high, label) {
  if (!Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${label} must be finite and between ${low} and ${high}`);
  }
}

function decodeSrgb(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getEncodingTable() {
  if (!encodingTable) {
    const bytes = new Uint8Array(ENCODING_STEPS), thresholds = new Float64Array(257);
    for (let i = 0; i < ENCODING_STEPS; i++) {
      const value = (i + .5) / ENCODING_STEPS;
      bytes[i] = Math.round((value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055) * 255);
    }
    for (let byte = 1; byte <= 255; byte++) thresholds[byte] = decodeSrgb((byte - .5) / 255);
    thresholds[256] = Infinity;
    encodingTable = { bytes, thresholds };
  }
  return encodingTable;
}

// The coarse guess differs by at most one byte (bounded sRGB slope). Exact
// inverse thresholds correct the guess; this is not interpolated output color.
function encodeSrgbByte(value, table) {
  if (value >= 1) return 255;
  let byte = table.bytes[Math.floor(value * ENCODING_STEPS)];
  if (value >= table.thresholds[byte + 1]) byte++;
  else if (value < table.thresholds[byte]) byte--;
  return byte;
}

// One bounded entry: no source pixels or rendered output are cached.
function getGeometry(width, height, radius, bevel) {
  if (width * height > 262_144) return null;
  const key = `${width}/${height}/${radius}/${bevel}`;
  if (geometryCache?.key === key) return geometryCache.data;
  const data = new Float64Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x + .5 - width / 2, py = y + .5 - height / 2;
    const qx = Math.abs(px) - (width / 2 - radius), qy = Math.abs(py) - (height / 2 - radius);
    const a = Math.max(qx, 0), b = Math.max(qy, 0), length = Math.sqrt(a * a + b * b);
    const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
    const index = (y * width + x) * 4;
    data[index] = clamp(.5 - distance, 0, 1);
    if (length > 0) { data[index + 1] = a / length * Math.sign(px); data[index + 2] = b / length * Math.sign(py); }
    else if (qx > qy) data[index + 1] = Math.sign(px);
    else data[index + 2] = Math.sign(py);
    data[index + 3] = clamp(1 + distance / bevel, 0, 1) ** 2;
  }
  geometryCache = { key, data };
  return data;
}

export function cpuStorage() {
  return { encodingTableBytes: encodingTable ? CPU_ENCODING_TABLE_BYTES : 0, geometryBytes: geometryCache?.data.byteLength ?? 0 };
}

/** Copy borrowed RGBA8 pixels into owned, linear-light premultiplied storage. */
export function prepareSource(source) {
  if (!source || typeof source !== 'object') throw new TypeError('source is required');
  const { width, height, data } = source;
  dimensions(width, height, 'source');
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)
    || data.length !== width * height * 4) {
    throw new TypeError('source data must be an RGBA8 byte array of exactly width * height * 4 elements');
  }
  const owned = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    owned[i] = decodeSrgb(data[i] / 255) * alpha;
    owned[i + 1] = decodeSrgb(data[i + 1] / 255) * alpha;
    owned[i + 2] = decodeSrgb(data[i + 2] / 255) * alpha;
    owned[i + 3] = alpha;
  }
  return { width, height, data: owned };
}

/** Render straight-alpha sRGB RGBA8, optionally reusing caller-owned output. */
export function renderCpu(prepared, options, output) {
  if (!prepared || typeof prepared !== 'object') throw new TypeError('prepared source is required');
  const { width: sourceWidth, height: sourceHeight, data } = prepared;
  dimensions(sourceWidth, sourceHeight, 'source');
  if (!(data instanceof Float32Array) || data.length !== sourceWidth * sourceHeight * 4) {
    throw new TypeError('prepared data must be a Float32Array of exactly width * height * 4 elements');
  }
  let opaque = true;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha !== 1) opaque = false;
    if (!(alpha >= 0 && alpha <= 1)) throw new RangeError('prepared alpha must be finite and normalized');
    const red = data[i], green = data[i + 1], blue = data[i + 2];
    // Bounded comparisons also reject NaN and infinities, without repeated
    // finite checks or a tiny inner loop for every source pixel on each frame.
    if (!(red >= 0 && red <= alpha && green >= 0 && green <= alpha && blue >= 0 && blue <= alpha)) {
      throw new RangeError('prepared RGB must be finite, normalized, and premultiplied');
    }
  }
  if (!options || typeof options !== 'object') throw new TypeError('render options are required');
  const { width, height } = options;
  dimensions(width, height, 'output');
  const radius = options.radius === undefined ? Math.min(width, height) / 4 : options.radius;
  const bevel = options.bevel === undefined ? Math.min(width, height) / 5 : options.bevel;
  const strength = options.strength === undefined ? 12 : options.strength;
  finiteRange(radius, 0, Math.min(width, height) / 2, 'radius');
  finiteRange(bevel, Number.MIN_VALUE, MAX_EFFECT, 'bevel');
  finiteRange(strength, 0, MAX_EFFECT, 'strength');
  const rect = options.sourceRect === undefined ? { x: 0, y: 0, width: sourceWidth, height: sourceHeight } : options.sourceRect;
  if (!rect || typeof rect !== 'object') throw new TypeError('sourceRect must be an object');
  finiteRange(rect.x, 0, sourceWidth, 'sourceRect.x');
  finiteRange(rect.y, 0, sourceHeight, 'sourceRect.y');
  finiteRange(rect.width, Number.MIN_VALUE, sourceWidth, 'sourceRect.width');
  finiteRange(rect.height, Number.MIN_VALUE, sourceHeight, 'sourceRect.height');
  if (rect.x + rect.width > sourceWidth || rect.y + rect.height > sourceHeight) {
    throw new RangeError('sourceRect must fit within the source');
  }
  if (output === undefined) output = new Uint8ClampedArray(width * height * 4);
  if (!(output instanceof Uint8ClampedArray) || output.length !== width * height * 4) {
    throw new TypeError('output must be a Uint8ClampedArray of exactly width * height * 4 elements');
  }
  if (output.buffer === data.buffer
    && output.byteOffset < data.byteOffset + data.byteLength
    && data.byteOffset < output.byteOffset + output.byteLength) {
    throw new TypeError('output must not overlap prepared source storage');
  }

  const scaleX = rect.width / width;
  const scaleY = rect.height / height;
  const encoding = getEncodingTable();
  const geometry = getGeometry(width, height, radius, bevel);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      let mask, normalX = 0, normalY = 0, weight;
      if (geometry) {
        mask = geometry[index]; normalX = geometry[index + 1]; normalY = geometry[index + 2]; weight = geometry[index + 3];
      } else {
        const px = x + .5 - width / 2, py = y + .5 - height / 2;
        const qx = Math.abs(px) - (width / 2 - radius), qy = Math.abs(py) - (height / 2 - radius);
        const positiveX = Math.max(qx, 0), positiveY = Math.max(qy, 0);
        const length = Math.sqrt(positiveX * positiveX + positiveY * positiveY);
        const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
        mask = clamp(.5 - distance, 0, 1);
        if (length > 0) { normalX = positiveX / length * Math.sign(px); normalY = positiveY / length * Math.sign(py); }
        else if (qx > qy) normalX = Math.sign(px);
        else normalY = Math.sign(py);
        weight = clamp(1 + distance / bevel, 0, 1) ** 2;
      }
      if (mask === 0) {
        output[index] = output[index + 1] = output[index + 2] = output[index + 3] = 0;
        continue;
      }
      const sx = clamp((x + 0.5) * scaleX + rect.x - 0.5 + normalX * strength * weight * scaleX, 0, sourceWidth - 1);
      const sy = clamp((y + 0.5) * scaleY + rect.y - 0.5 + normalY * strength * weight * scaleY, 0, sourceHeight - 1);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sourceWidth - 1);
      const y1 = Math.min(y0 + 1, sourceHeight - 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const a = (y0 * sourceWidth + x0) * 4;
      const b = (y0 * sourceWidth + x1) * 4;
      const c = (y1 * sourceWidth + x0) * 4;
      const d = (y1 * sourceWidth + x1) * 4;
      const oneX = 1 - tx, oneY = 1 - ty;
      const alpha = opaque ? 1 : (data[a + 3] * oneX + data[b + 3] * tx) * oneY
        + (data[c + 3] * oneX + data[d + 3] * tx) * ty;
      output[index + 3] = Math.round(alpha * mask * 255);
      if (output[index + 3] === 0) {
        output[index] = output[index + 1] = output[index + 2] = 0;
        continue;
      }
      const red = (data[a] * oneX + data[b] * tx) * oneY + (data[c] * oneX + data[d] * tx) * ty;
      const green = (data[a + 1] * oneX + data[b + 1] * tx) * oneY + (data[c + 1] * oneX + data[d + 1] * tx) * ty;
      const blue = (data[a + 2] * oneX + data[b + 2] * tx) * oneY + (data[c + 2] * oneX + data[d + 2] * tx) * ty;
      output[index] = encodeSrgbByte(opaque ? red : red / alpha, encoding);
      output[index + 1] = encodeSrgbByte(opaque ? green : green / alpha, encoding);
      output[index + 2] = encodeSrgbByte(opaque ? blue : blue / alpha, encoding);
    }
  }
  return output;
}
