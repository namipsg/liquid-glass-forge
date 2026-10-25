import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSource, renderCpu } from './cpu.mjs';

const options = { width: 2, height: 2, radius: 0, strength: 0 };
const source = (width, height, values) => prepareSource({ width, height, data: new Uint8ClampedArray(values) });
const pixel = (bytes, width, x, y) => Array.from(bytes.slice((y * width + x) * 4, (y * width + x + 1) * 4));

test('prepareSource owns its storage, decodes sRGB, and premultiplies alpha', () => {
  const borrowed = new Uint8Array([128, 255, 0, 128, 255, 100, 250, 0]);
  const copy = borrowed.slice();
  const prepared = prepareSource({ width: 2, height: 1, data: borrowed });
  assert.ok(prepared.data instanceof Float32Array);
  assert.notEqual(prepared.data.buffer, borrowed.buffer);
  assert.ok(Math.abs(prepared.data[0] - 0.1083535) < 1e-6);
  assert.ok(Math.abs(prepared.data[1] - 128 / 255) < 1e-7);
  assert.deepEqual(Array.from(prepared.data.slice(4)), [0, 0, 0, 0]);
  assert.deepEqual(borrowed, copy);
  borrowed.fill(0);
  assert.ok(prepared.data[0] > 0.1);
});

test('zero-strength equal-size rendering is identity within one byte for visible colors', () => {
  const bytes = new Uint8ClampedArray([0, 128, 255, 255, 17, 88, 199, 128, 250, 1, 90, 1, 27, 53, 99, 240]);
  const prepared = prepareSource({ width: 2, height: 2, data: bytes });
  const result = renderCpu(prepared, options);
  result.forEach((value, i) => assert.ok(Math.abs(value - bytes[i]) <= 1));
});

test('2x2 bilinear center averages linear light rather than encoded sRGB', () => {
  const prepared = source(2, 2, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual(Array.from(renderCpu(prepared, { width: 1, height: 1, radius: 0, strength: 0 })), [188, 188, 188, 255]);
  const resized = renderCpu(prepared, { width: 3, height: 3, radius: 0, strength: 0 });
  assert.deepEqual(pixel(resized, 3, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(resized, 3, 2, 2), [255, 255, 255, 255]);
  assert.deepEqual(pixel(resized, 3, 1, 1), [188, 188, 188, 255]);
  // At source coordinate (.25, .125), corner weights are
  // .65625, .21875, .09375, .03125: linear RGB = (.6875, .25, .125).
  const offset = renderCpu(prepared, { width: 1, height: 1, radius: 0, strength: 0, sourceRect: { x: 0.25, y: 0.125, width: 1, height: 1 } });
  assert.deepEqual(Array.from(offset), [216, 137, 99, 255]);
});

test('bilinear interpolation uses premultiplied alpha and ignores hidden colors', () => {
  const prepared = source(2, 2, [255, 0, 0, 255, 0, 255, 255, 0, 255, 0, 255, 0, 0, 255, 0, 0]);
  assert.deepEqual(Array.from(renderCpu(prepared, { width: 1, height: 1, radius: 0, strength: 0 })), [255, 0, 0, 64]);
  const transparent = source(1, 1, [255, 100, 20, 0]);
  assert.deepEqual(Array.from(renderCpu(transparent, { width: 1, height: 1 })), [0, 0, 0, 0]);
});

test('sourceRect maps output pixel centers into the selected source region', () => {
  const prepared = source(4, 1, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const result = renderCpu(prepared, { width: 2, height: 1, radius: 0, strength: 0, sourceRect: { x: 1, y: 0, width: 2, height: 1 } });
  assert.deepEqual(Array.from(result), [0, 255, 0, 255, 0, 0, 255, 255]);
});

test('reuses output storage and leaves all source storage unchanged', () => {
  const borrowed = new Uint8ClampedArray([255, 20, 100, 200, 99, 65, 43, 100, 0, 0, 0, 255, 255, 255, 255, 255]);
  const borrowedCopy = borrowed.slice();
  const prepared = prepareSource({ width: 2, height: 2, data: borrowed });
  const preparedCopy = prepared.data.slice();
  const output = new Uint8ClampedArray(16).fill(42);
  assert.equal(renderCpu(prepared, options, output), output);
  assert.deepEqual(output, renderCpu(prepared, options));
  assert.deepEqual(borrowed, borrowedCopy);
  assert.deepEqual(prepared.data, preparedCopy);
  assert.equal(borrowed.buffer.byteLength, 16);
  assert.equal(prepared.data.buffer.byteLength, 64);
  assert.throws(() => renderCpu(prepared, options, new Uint8ClampedArray(prepared.data.buffer, 0, 16)), /overlap/);
});

test('rounded mask remains at zero strength and produces symmetric antialiased corners', () => {
  const prepared = source(1, 1, [255, 255, 255, 255]);
  const result = renderCpu(prepared, { width: 12, height: 12, radius: 6, strength: 0 });
  assert.deepEqual(pixel(result, 12, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result, 12, 6, 6), [255, 255, 255, 255]);
  const edge = pixel(result, 12, 2, 1);
  assert.ok(edge[3] > 0 && edge[3] < 255);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    assert.deepEqual(pixel(result, 12, x, y), pixel(result, 12, 11 - x, y));
    assert.deepEqual(pixel(result, 12, x, y), pixel(result, 12, x, 11 - y));
  }
  const rectangle = renderCpu(prepared, { width: 12, height: 12, radius: 0, strength: 0 });
  for (let i = 3; i < rectangle.length; i += 4) assert.equal(rectangle[i], 255);
});

test('outward edge refraction visibly changes sampling while the deep interior stays fixed', () => {
  const bytes = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    bytes.set([x * 17, y * 17, 40, 255], (y * 16 + x) * 4);
  }
  const prepared = prepareSource({ width: 16, height: 16, data: bytes });
  const base = { width: 8, height: 8, radius: 0, bevel: 3, sourceRect: { x: 4, y: 4, width: 8, height: 8 } };
  const flat = renderCpu(prepared, { ...base, strength: 0 });
  const bent = renderCpu(prepared, { ...base, strength: 2 });
  assert.notDeepEqual(bent, flat);
  assert.ok(pixel(bent, 8, 0, 4)[0] < pixel(flat, 8, 0, 4)[0]);
  assert.ok(pixel(bent, 8, 7, 4)[0] > pixel(flat, 8, 7, 4)[0]);
  assert.deepEqual(pixel(bent, 8, 4, 4), pixel(flat, 8, 4, 4));
});

test('validates dimensions, finite effect values, rectangles, and buffer sizes', () => {
  const prepared = source(2, 2, new Array(16).fill(255));
  for (const width of [0, -1, 1.5, NaN, Infinity, 4_000_001]) {
    assert.throws(() => prepareSource({ width, height: 1, data: new Uint8Array(4) }));
    assert.throws(() => renderCpu(prepared, { ...options, width }));
  }
  assert.throws(() => prepareSource({ width: 2001, height: 2000, data: new Uint8Array(4) }));
  assert.throws(() => prepareSource({ width: 1, height: 1, data: new Uint8Array(3) }));
  assert.throws(() => prepareSource({ width: 1, height: 1, data: [0, 0, 0, 0] }));
  for (const key of ['radius', 'bevel', 'strength']) for (const value of [NaN, Infinity, -1, null]) {
    assert.throws(() => renderCpu(prepared, { ...options, [key]: value }), `${key}: ${value}`);
  }
  assert.throws(() => renderCpu(prepared, { ...options, radius: 2 }));
  assert.throws(() => renderCpu(prepared, { ...options, bevel: 0 }));
  assert.throws(() => renderCpu(prepared, { ...options, strength: 1_000_001 }));
  for (const rect of [null, {}, { x: -1, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 2, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }, { x: 0, y: NaN, width: 1, height: 1 }]) {
    assert.throws(() => renderCpu(prepared, { ...options, sourceRect: rect }));
  }
  assert.throws(() => renderCpu(prepared, options, new Uint8Array(16)));
  assert.throws(() => renderCpu(prepared, options, new Uint8ClampedArray(15)));
  assert.throws(() => renderCpu({ ...prepared, data: new Float32Array(3) }, options));
  prepared.data[0] = NaN;
  assert.throws(() => renderCpu(prepared, options), /finite/);
});

test('encoding matches analytical byte decisions between table buckets and near thresholds', () => {
  const values = Array.from({ length: 4100 }, (_, i) => i / 4099);
  for (let byte = 1; byte <= 255; byte++) {
    const encoded = (byte - .5) / 255;
    const threshold = encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4;
    values.push(threshold - 1e-8, threshold, threshold + 1e-8);
  }
  for (const value of values) {
    const linear = Math.fround(value);
    const prepared = { width: 1, height: 1, data: new Float32Array([linear, linear, linear, 1]) };
    const expected = Math.round((linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055) * 255);
    const actual = renderCpu(prepared, { width: 1, height: 1, radius: 0, strength: 0 });
    assert.equal(actual[0], expected, `linear ${linear}`);
  }
});

test('cached geometry and the opaque fast path observe source alpha changes', () => {
  const prepared = source(2, 2, [255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]);
  const settings = { width: 2, height: 2, radius: 0, strength: 0 };
  assert.deepEqual(pixel(renderCpu(prepared, settings), 2, 0, 0), [255, 0, 0, 255]);
  prepared.data.set([0, 0, 0, 0]);
  assert.deepEqual(pixel(renderCpu(prepared, settings), 2, 0, 0), [0, 0, 0, 0]);
  prepared.data.set([.5, 0, 0, .5]);
  assert.deepEqual(pixel(renderCpu(prepared, settings), 2, 0, 0), [255, 0, 0, 128]);
});
