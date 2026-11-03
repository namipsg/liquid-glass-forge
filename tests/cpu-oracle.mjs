// Scalar specification of CONTRACTS.md / PHASE-5.md, deliberately independent
// of the package and Phase 1 spike. Small fixtures favor clarity over speed.
const clamp = (v, low = 0, high = 1) => Math.min(high, Math.max(low, v));
export const decode = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
export const encode = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;

export function oracleGeometry(width, height, radius, bevel, x, y) {
  const px = x + .5 - width / 2, py = y + .5 - height / 2;
  const qx = Math.abs(px) - width / 2 + radius, qy = Math.abs(py) - height / 2 + radius;
  const ax = Math.max(0, qx), ay = Math.max(0, qy), length = Math.hypot(ax, ay);
  const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
  const normalX = length ? ax / length * Math.sign(px) : qx > qy ? Math.sign(px) : 0;
  const normalY = length ? ay / length * Math.sign(py) : qx > qy ? 0 : Math.sign(py);
  return { distance, normalX, normalY, coverage: clamp(.5 - distance), weight: clamp(1 + distance / bevel) ** 2 };
}

export function oracleRender(source, surface, effects = {}) {
  const { width: sw, height: sh, data } = source;
  const { width, height, radius, bevel, strength } = surface;
  const crop = surface.sourceRect ?? { x: 0, y: 0, width: sw, height: sh };
  const blur = effects.blurRadius ?? 0;
  // Evaluate the full square kernel directly. This is independently equivalent
  // to horizontal/vertical clamped box passes, without their cached intermediates.
  function texel(x, y) {
    const sum = [0, 0, 0, 0];
    for (let dy = -blur; dy <= blur; dy++) for (let dx = -blur; dx <= blur; dx++) {
      const i = (clamp(y + dy, 0, sh - 1) * sw + clamp(x + dx, 0, sw - 1)) * 4;
      const a = data[i + 3] / 255;
      for (let c = 0; c < 3; c++) sum[c] += decode(data[i + c] / 255) * a;
      sum[3] += a;
    }
    return sum.map(v => v / (2 * blur + 1) ** 2);
  }
  function sample(x, y) {
    const cx = clamp(x, 0, sw - 1), cy = clamp(y, 0, sh - 1);
    const result = [0, 0, 0, 0];
    for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
      const tx = Math.min(Math.floor(cx) + ox, sw - 1), ty = Math.min(Math.floor(cy) + oy, sh - 1);
      const fraction = (ox ? cx % 1 : 1 - cx % 1) * (oy ? cy % 1 : 1 - cy % 1);
      texel(tx, ty).forEach((v, c) => { result[c] += v * fraction; });
    }
    return result;
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const light = effects.light ?? [-Math.SQRT1_2, -Math.SQRT1_2];
  const lightLength = Math.hypot(...light);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const g = oracleGeometry(width, height, radius, bevel, x, y);
    const at = multiplier => sample(
      crop.x + (x + .5 + g.normalX * strength * g.weight * multiplier) * crop.width / width - .5,
      crop.y + (y + .5 + g.normalY * strength * g.weight * multiplier) * crop.height / height - .5);
    const center = at(1), dispersion = effects.dispersion ?? 0;
    const samples = dispersion ? [at(1 + dispersion), center, at(1 - dispersion)] : [center, center, center];
    const highlight = clamp(g.weight * ((effects.rim ?? 0) + (effects.specular ?? 0) * Math.max(0,
      (g.normalX * light[0] + g.normalY * light[1]) / lightLength) ** 8));
    const index = (y * width + x) * 4;
    out[index + 3] = Math.round(center[3] * g.coverage * 255);
    for (let c = 0; c < 3; c++) {
      let value = samples[c][3] ? samples[c][c] / samples[c][3] : 0;
      if (effects.tint) value += (decode(effects.tint[c]) - value) * effects.tint[3];
      value += (1 - value) * highlight;
      out[index + c] = out[index + 3] ? Math.round(clamp(encode(value)) * 255) : 0;
    }
  }
  return out;
}
