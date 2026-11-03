import test from 'node:test';
import assert from 'node:assert/strict';
import { createSource, decodeSrgb, encodeSrgb } from '../packages/core/dist/index.js';
import { CPU_LOOKUP_BYTES, cpuKernelStorageBytes, prepareCpuSource, disposeCpuSource,
  preparedStorageBytes, renderCpu, sampleGeometry } from '../packages/cpu/dist/kernel.js';

const source = pixels => createSource({ contractVersion: 1, width: pixels.length / 4, height: 1, revision: 1,
  data: new Uint8ClampedArray(pixels), ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
const shape = width => ({ id: 'colour-reference', width, height: 1, radius: 0, bevel: 2, strength: 0 });
const clamp = v => Math.min(1, Math.max(0, v));
// Independent scalar reproduction of the original Float32 preparation and
// premultiplied two-pixel interpolation; no lookup or inverse threshold logic.
function originalSample(pixels, x) {
  const stored = new Float32Array(pixels.length);
  for (let p = 0; p < pixels.length; p += 4) {
    const alpha = pixels[p + 3] / 255;
    for (let c = 0; c < 3; c++) stored[p + c] = decodeSrgb(pixels[p + c] / 255) * alpha;
    stored[p + 3] = alpha;
  }
  const alpha = stored[3] * (1 - x) + stored[7] * x, a = Math.round(clamp(alpha) * 255);
  return [...Array.from({ length: 3 }, (_, c) => a === 0 ? 0 : Math.round(encodeSrgb(clamp(
    (stored[c] * (1 - x) + stored[c + 4] * x) / alpha)) * 255)), a];
}
function fractional(prepared, value, effects) {
  return renderCpu(prepared, { ...shape(1), sourceRect: { x: value, y: 0, width: 1, height: 1 } }, effects);
}
function neighbours(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  return [-2n, -1n, 0n, 1n, 2n].map(offset => {
    view.setBigUint64(0, bits + offset); return view.getFloat64(0);
  });
}

test('colour storage is lazy, fixed at 12296 bytes, and separate from disposable source/blur storage', () => {
  assert.equal(CPU_LOOKUP_BYTES, 256 * 8 + 4096 * 2 + 257 * 8);
  assert.equal(cpuKernelStorageBytes(), 0, 'module import must not allocate tables');
  assert.throws(() => prepareCpuSource({}));
  assert.equal(cpuKernelStorageBytes(), 0, 'invalid sources must not allocate tables');
  for (let i = 0; i < 8; i++) {
    const prepared = prepareCpuSource(source([12, 93, 254, 127, 128, 19, 72, 1]));
    assert.equal(cpuKernelStorageBytes(), 12296);
    assert.equal(preparedStorageBytes(prepared), 2 * 4 * 4);
    for (const radius of [1, 16, 2, 0]) {
      renderCpu(prepared, shape(2), { model: 'rounded-material-v1', blurRadius: radius });
      assert.equal(preparedStorageBytes(prepared), 3 * 2 * 4 * 4);
      assert.equal(cpuKernelStorageBytes(), 12296);
    }
    disposeCpuSource(prepared);
    assert.equal(preparedStorageBytes(prepared), 0);
    assert.equal(cpuKernelStorageBytes(), 12296);
  }
});

test('all 256 opaque byte identities are exact', () => {
  const pixels = Array.from({ length: 256 }, (_, byte) => [byte, 255 - byte, byte ^ 85, 255]).flat();
  const prepared = prepareCpuSource(source(pixels));
  try { assert.deepEqual([...renderCpu(prepared, shape(256))], pixels); }
  finally { disposeCpuSource(prepared); }
});

test('dense linear samples, every coarse bucket and adjacent inverse thresholds match original encode/round exactly', () => {
  const pixels = [0, 0, 0, 255, 255, 255, 255, 255], prepared = prepareCpuSource(source(pixels));
  const values = Array.from({ length: 16385 }, (_, i) => i / 16384);
  for (let i = 1; i < 4096; i++) values.push(...neighbours(i / 4096));
  for (let byte = 1; byte <= 255; byte++) {
    // Independent inverse expression, including values much closer than the
    // original spike's +/-1e-8 fixtures, where floating ties matter.
    const encoded = (byte - .5) / 255;
    const threshold = encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4;
    values.push(...neighbours(threshold), threshold - 1e-8, threshold + 1e-8,
      threshold - 8 * Number.EPSILON, threshold + 8 * Number.EPSILON);
  }
  try {
    for (const value of values) {
      // Fractional crop pixel-center arithmetic is part of the old renderer.
      const sampled = value + .5 - .5;
      assert.deepEqual([...fractional(prepared, value)], originalSample(pixels, sampled), `linear ${value}`);
    }
  } finally { disposeCpuSource(prepared); }
});

test('translucent byte decoding and disabled material options retain original Float32 premultiplied bytes', () => {
  for (const alpha of [0, 1, 37, 128, 254, 255]) for (let byte = 0; byte < 256; byte++) {
    const pixels = [byte, 255 - byte, byte ^ 85, alpha, 255 - byte, byte ^ 170, byte, 255];
    const prepared = prepareCpuSource(source(pixels));
    try {
      for (const x of [0, .013, .25, .5, .93, 1]) {
        const baseline = fractional(prepared, x);
        assert.deepEqual([...baseline], originalSample(pixels, x + .5 - .5), `alpha ${alpha}, byte ${byte}, x ${x}`);
        assert.deepEqual(fractional(prepared, x, { model: 'rounded-material-v1', blurRadius: 0, dispersion: 0,
          tint: [.2, .8, .3, 0], rim: 0, specular: 0, light: [1, 0] }), baseline);
      }
    } finally { disposeCpuSource(prepared); }
  }
});

test('classified opaque output retains exact adjacent half-byte decisions in all sensitive buckets', () => {
  const pixels = [0, 0, 0, 255, 255, 255, 255, 255], extended = [...pixels, 255,255,255,255, 255,255,255,255];
  const prepared = prepareCpuSource(source(extended));
  try {
    for (let byte = 1; byte <= 255; byte++) {
      const encoded = (byte - .5) / 255;
      const threshold = encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4;
      for (const value of neighbours(threshold)) {
        const x = value + .5 - .5 / 64, sampled = x + .5 / 64 - .5;
        const output = renderCpu(prepared, { id: 'classified-threshold', width:64, height:64, radius:0, bevel:2, strength:0,
          sourceRect:{x,y:0,width:1,height:1} });
        assert.deepEqual([...output.subarray(0,4)], originalSample(pixels,sampled), `classified threshold ${byte}/${value}`);
      }
    }
  } finally { disposeCpuSource(prepared); }
});

test('zero-axis geometry shortcut equals the original hypot equations exactly', () => {
  for (const [width, height, radius, bevel] of [[8, 5, 0, 2], [9, 7, 2.5, 3], [5, 5, 2.5, .001], [1, 1, 0, 1]]) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const px = x + .5 - width / 2, py = y + .5 - height / 2;
      const qx = Math.abs(px) - (width / 2 - radius), qy = Math.abs(py) - (height / 2 - radius);
      const ax = Math.max(qx, 0), ay = Math.max(qy, 0), length = Math.hypot(ax, ay);
      const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
      let normalX = 0, normalY = 0;
      if (length > 0) { normalX = ax / length * Math.sign(px); normalY = ay / length * Math.sign(py); }
      else if (qx > qy) normalX = Math.sign(px);
      else normalY = Math.sign(py);
      assert.deepEqual(sampleGeometry(width, height, radius, bevel, x, y), {
        distance, normalX, normalY, coverage: clamp(.5 - distance), weight: clamp(1 + distance / bevel) ** 2 });
    }
  }
});
