// Phase 1 optical feasibility spike: rounded-mask edge refraction only.
// This intentionally excludes production blur, highlights, and compositing.
const MAX_PIXELS = 4_000_000;
const MAX_EFFECT = 1_000_000;
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

function encodeSrgb(value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
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
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError('prepared alpha must be finite and normalized');
    for (let channel = 0; channel < 3; channel++) {
      const value = data[i + channel];
      if (!Number.isFinite(value) || value < 0 || value > alpha) {
        throw new RangeError('prepared RGB must be finite, normalized, and premultiplied');
      }
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
  for (let y = 0; y < height; y++) {
    const py = y + 0.5 - height / 2;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - width / 2;
      const qx = Math.abs(px) - (width / 2 - radius);
      const qy = Math.abs(py) - (height / 2 - radius);
      const positiveX = Math.max(qx, 0);
      const positiveY = Math.max(qy, 0);
      const length = Math.hypot(positiveX, positiveY);
      const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
      const mask = clamp(0.5 - distance, 0, 1);
      const index = (y * width + x) * 4;
      if (mask === 0) {
        output[index] = output[index + 1] = output[index + 2] = output[index + 3] = 0;
        continue;
      }
      let normalX = 0;
      let normalY = 0;
      if (length > 0) {
        normalX = positiveX / length * Math.sign(px);
        normalY = positiveY / length * Math.sign(py);
      } else if (qx > qy) normalX = Math.sign(px);
      else normalY = Math.sign(py);
      const weight = clamp(1 + distance / bevel, 0, 1) ** 2;
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
      const alpha = (data[a + 3] * (1 - tx) + data[b + 3] * tx) * (1 - ty)
        + (data[c + 3] * (1 - tx) + data[d + 3] * tx) * ty;
      output[index + 3] = Math.round(alpha * mask * 255);
      if (output[index + 3] === 0) {
        output[index] = output[index + 1] = output[index + 2] = 0;
        continue;
      }
      for (let channel = 0; channel < 3; channel++) {
        const sample = (data[a + channel] * (1 - tx) + data[b + channel] * tx) * (1 - ty)
          + (data[c + channel] * (1 - tx) + data[d + channel] * tx) * ty;
        output[index + channel] = Math.round(encodeSrgb(clamp(sample / alpha, 0, 1)) * 255);
      }
    }
  }
  return output;
}
