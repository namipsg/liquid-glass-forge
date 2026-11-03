import test from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../packages/core/dist/index.js';
import { CPU_MATERIAL_MODEL, prepareCpuSource, disposeCpuSource, preparedStorageBytes, renderCpu, sampleGeometry } from '../packages/cpu/dist/index.js';
import { oracleGeometry, oracleRender } from './cpu-oracle.mjs';

const source = (width, height, pixels) => createSource({ contractVersion: 1, width, height, revision: 3,
  data: new Uint8ClampedArray(pixels), ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
const surface = (width, height, patch = {}) => ({ id: 'fixture', width, height, radius: 0, bevel: 2, strength: 0, ...patch });
const effects = patch => ({ model: 'rounded-material-v1', ...patch });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
// Prepared storage is Float32; allow only its final one-byte rounding boundary.
// Fixed analytical fixtures and disabled-effects equality remain exact.
const bytesNear = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 1, `byte ${i}: ${v} != ${expected[i]}`));
};
const gradient = (w, h) => source(w, h, Array.from({ length: w * h }, (_, i) =>
  [(i * 73 + 11) % 256, (i * 47 + 29) % 256, (i * 101 + 3) % 256, [0, 37, 128, 255][i % 4]]).flat());
function compare(src, shape, material) {
  const prepared = prepareCpuSource(src);
  try { bytesNear(renderCpu(prepared, shape, material), oracleRender(src, shape, material)); }
  finally { disposeCpuSource(prepared); }
}

test('M13a analytical identity, linear half-light and hidden transparent colors', () => {
  assert.equal(CPU_MATERIAL_MODEL, 'rounded-material-v1');
  const src = source(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
  const prepared = prepareCpuSource(src);
  assert.deepEqual([...renderCpu(prepared, surface(2, 1))], [...src.data]);
  assert.deepEqual([...renderCpu(prepared, surface(1, 1))], [188, 188, 188, 255]);
  disposeCpuSource(prepared);
  const alpha = prepareCpuSource(source(2, 1, [255, 0, 0, 0, 0, 0, 255, 255]));
  assert.deepEqual([...renderCpu(alpha, surface(1, 1))], [0, 0, 255, 128]);
  disposeCpuSource(alpha);
  compare(source(1, 1, [255, 149, 71, 0]), surface(3, 3, { radius: 1.5 }));
});

test('M13a alpha coverage is last, and rounded-zero alpha removes hidden RGB', () => {
  const src = source(1, 1, [191, 42, 89, 1]);
  compare(src, surface(7, 7, { radius: 3.5 }), effects({ tint: [1, 1, 1, 1], rim: 1 }));
  const prepared = prepareCpuSource(src), out = renderCpu(prepared, surface(7, 7, { radius: 3.5 }));
  assert.deepEqual([...out.slice(0, 4)], [0, 0, 0, 0]);
  disposeCpuSource(prepared);
});

test('default surface parameters match core createFrame defaults', () => {
  const prepared = prepareCpuSource(gradient(5, 4));
  assert.deepEqual(renderCpu(prepared, { id: 'defaults', width: 6, height: 4 }),
    renderCpu(prepared, { id: 'explicit', width: 6, height: 4, radius: 1, bevel: .8, strength: 12 }));
  disposeCpuSource(prepared);
});

test('M13b analytical distance, tie normal, circle and rounded rectangle samples', () => {
  assert.deepEqual(sampleGeometry(5, 5, 0, 2, 2, 2), { distance: -2.5, normalX: 0, normalY: 0, coverage: 1, weight: 0 });
  const edge = sampleGeometry(4, 4, 0, 2, 3, 1);
  near(edge.distance, -.5); near(edge.normalX, 1); near(edge.normalY, 0); near(edge.weight, .5625);
  const circle = sampleGeometry(5, 5, 2.5, 2, 3, 3);
  near(circle.distance, Math.SQRT2 - 2.5); near(circle.normalX, Math.SQRT1_2); near(circle.normalY, Math.SQRT1_2);
  const tie = sampleGeometry(4, 4, 0, 2, 2, 2); near(tie.normalX, 0); near(tie.normalY, 1);
});

test('M13b scalar geometry, reflection symmetry and finite limiting normals', () => {
  for (const [w, h, r, b] of [[1, 1, 0, 1], [5, 5, 2.5, .001], [8, 5, 2, 1e6], [4, 4, 0, 2]]) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const actual = sampleGeometry(w, h, r, b, x, y), expected = oracleGeometry(w, h, r, b, x, y);
      for (const key of Object.keys(expected)) { assert.ok(Number.isFinite(actual[key])); near(actual[key], expected[key]); }
      const reflection = sampleGeometry(w, h, r, b, w - x - 1, h - y - 1);
      near(actual.distance, reflection.distance); near(actual.coverage, reflection.coverage); near(actual.weight, reflection.weight);
      near(actual.normalX, -reflection.normalX); near(actual.normalY, -reflection.normalY);
    }
  }
});

test('M13c independent fractional crop, anisotropic scaling and displaced source-boundary clamps', () => {
  const src = gradient(5, 4);
  for (const strength of [0, .7, 7, 1e6]) for (const radius of [0, 1.5]) {
    compare(src, surface(6, 3, { radius, bevel: 1.25, strength, sourceRect: { x: .3, y: .6, width: 3.9, height: 2.7 } }));
  }
});

test('M13c displaced crop samples source padding outside the crop', () => {
  const src = source(4, 1, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const shape = surface(2, 3, { strength: 2, bevel: 2, sourceRect: { x: 1, y: 0, width: 2, height: 1 } });
  compare(src, shape);
  const prepared = prepareCpuSource(src), out = renderCpu(prepared, shape);
  assert.ok(out[8] > 0, 'left sample must include red padding beyond crop');
  assert.ok(out[12] > 0, 'right sample must include white padding beyond crop');
  disposeCpuSource(prepared);
});

test('M13d constant blur and independently summed clamped impulse fixtures', () => {
  for (const radius of [1, 2, 16]) {
    compare(source(2, 3, Array(6).fill([31, 127, 240, 93]).flat()), surface(5, 4), effects({ blurRadius: radius }));
    compare(source(3, 3, Array.from({ length: 9 }, (_, i) => i === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]).flat()), surface(3, 3), effects({ blurRadius: radius }));
  }
  const src = source(3, 1, [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  const prepared = prepareCpuSource(src);
  assert.deepEqual([...renderCpu(prepared, surface(3, 1), effects({ blurRadius: 1 }))], Array(3).fill([156, 156, 156, 255]).flat());
  disposeCpuSource(prepared);
});

test('M13d blur uses premultiplied alpha and clamped transparent edges before displacement', () => {
  const edge = prepareCpuSource(source(2, 1, [255, 0, 0, 0, 0, 0, 255, 255]));
  assert.deepEqual([...renderCpu(edge, surface(2, 1), effects({ blurRadius: 1 }))], [0, 0, 255, 85, 0, 0, 255, 170]);
  disposeCpuSource(edge);
  const src = source(3, 2, [255, 0, 0, 0, 0, 0, 255, 255, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 128, 0, 255, 0, 0]);
  compare(src, surface(5, 4, { radius: 1.7, strength: 1.8, bevel: 2.3 }), effects({ blurRadius: 2 }));
});

test('M13e dispersion uses separate straight samples and central alpha', () => {
  compare(gradient(7, 5), surface(6, 4, { radius: 1.5, strength: 2.2, bevel: 3 }), effects({ dispersion: .8 }));
  compare(gradient(7, 5), surface(6, 4, { radius: 1.5, strength: 2.2, bevel: 3 }), effects({ dispersion: 1, blurRadius: 1 }));
});

test('M13e analytical tint decode, squared-bevel rim and eighth-power specular', () => {
  const src = source(1, 1, [0, 0, 0, 128]);
  const prepared = prepareCpuSource(src);
  assert.deepEqual([...renderCpu(prepared, surface(1, 1), effects({ tint: [.5, .25, 1, 1] }))], [128, 64, 255, 128]);
  // At (3,1), distance=-.5 and bevel=2 gives w=9/16. A diagonal
  // normalized light contributes dot^8=1/16, retaining the original alpha.
  for (const [material, byte] of [[{ rim: 1 }, 198], [{ specular: 1, light: [1, 0] }, 198],
    [{ specular: 1, light: [1, 1] }, 53], [{ specular: 1, light: [-1, 0] }, 0]]) {
    const out = renderCpu(prepared, surface(4, 4), effects(material));
    assert.deepEqual([...out.slice(28, 32)], [byte, byte, byte, 128]);
  }
  disposeCpuSource(prepared);
  for (const material of [{ rim: .7 }, { specular: .8, light: [3, 0] }, { specular: .8, light: [-1, -1] },
    { tint: [.2, .8, .5, .35], rim: .4, specular: .9, light: [2, -3], blurRadius: 1, dispersion: .7 }]) {
    compare(gradient(5, 4), surface(7, 5, { radius: 2.5, strength: 1.3, bevel: 2 }), effects(material));
  }
});

test('M13e disabled material options preserve baseline bytes exactly', () => {
  const src = gradient(5, 4), prepared = prepareCpuSource(src), shape = surface(7, 5, { radius: 2.1, strength: 2.3 });
  const baseline = renderCpu(prepared, shape);
  for (const material of [{}, { blurRadius: 0 }, { dispersion: 0 }, { tint: [.2, .8, .4, 0] }, { rim: 0, specular: 0 },
    { blurRadius: 0, dispersion: 0, tint: [.8, .2, .1, 0], rim: 0, specular: 0, light: [1, 0] }]) {
    assert.deepEqual(renderCpu(prepared, shape, effects(material)), baseline);
  }
  disposeCpuSource(prepared);
});

test('preparation snapshots borrowed subviews without mutation or detachment', () => {
  const buffer = new Uint8Array(40).fill(19), bytes = buffer.subarray(8, 24);
  bytes.set([10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255, 100, 110, 120, 255]);
  const src = createSource({ ...source(2, 2, bytes), data: bytes });
  const original = buffer.slice(), prepared = prepareCpuSource(src), shape = surface(2, 2), expected = renderCpu(prepared, shape);
  assert.equal(prepared.width, 2); assert.equal(prepared.height, 2); assert.equal(prepared.revision, 3);
  assert.deepEqual(buffer, original); bytes.fill(0);
  assert.deepEqual(renderCpu(prepared, shape), expected); assert.equal(buffer.buffer.byteLength, 40);
  disposeCpuSource(prepared); assert.equal(buffer.buffer.byteLength, 40);
});

test('owned source storage and single-radius cache remain bounded, reuse outputs and release idempotently', () => {
  const src = gradient(5, 4), prepared = prepareCpuSource(src), shape = surface(4, 3);
  const initial = preparedStorageBytes(prepared); assert.ok(initial >= 5 * 4 * 4 * 4);
  const output = new Uint8ClampedArray(4 * 3 * 4);
  assert.equal(renderCpu(prepared, shape, undefined, output), output);
  bytesNear(output, oracleRender(src, shape));
  let retained;
  for (const b of [1, 2, 3, 16, 2, 1]) {
    bytesNear(renderCpu(prepared, shape, effects({ blurRadius: b }), output), oracleRender(src, shape, { blurRadius: b }));
    const bytes = preparedStorageBytes(prepared); assert.ok(bytes <= 3 * 5 * 4 * 4 * 8, 'only source and bounded blur/scratch retained');
    if (retained !== undefined) assert.equal(bytes, retained); retained = bytes;
  }
  disposeCpuSource(prepared); disposeCpuSource(prepared); assert.equal(preparedStorageBytes(prepared), 0);
  assert.throws(() => renderCpu(prepared, shape));
  assert.throws(() => renderCpu({ width: 5, height: 4, revision: 3 }, shape));
});

test('invalid surface, effects and output parameters fail before modifying reusable output', () => {
  const prepared = prepareCpuSource(gradient(3, 3)), shape = surface(2, 2), output = new Uint8ClampedArray(16).fill(41);
  for (const patch of [{ model: 'unknown' }, { model: undefined }, { blurRadius: -1 }, { blurRadius: .5 }, { blurRadius: 17 },
    { dispersion: NaN }, { dispersion: 1.1 }, { rim: -.1 }, { specular: Infinity }, { tint: [0, 0, 0] },
    { tint: [0, 0, 0, 2] }, { tint: [0, 0, NaN, 1] }, { light: [0, 0] }, { light: [Infinity, 1] },
    { light: [1] }, { future: true }]) {
    assert.throws(() => renderCpu(prepared, shape, effects(patch), output)); assert.deepEqual([...output], Array(16).fill(41));
  }
  for (const patch of [{ width: 0 }, { height: .5 }, { radius: 2 }, { bevel: 0 }, { strength: NaN },
    { sourceRect: { x: -1, y: 0, width: 1, height: 1 } }, { sourceRect: null }, { unknown: 1 }]) {
    assert.throws(() => renderCpu(prepared, { ...shape, ...patch }, undefined, output));
    assert.deepEqual([...output], Array(16).fill(41));
  }
  assert.throws(() => renderCpu(prepared, shape, undefined, new Uint8ClampedArray(15)));
  disposeCpuSource(prepared);
});
