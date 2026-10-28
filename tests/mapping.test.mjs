import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSourceRegion } from '../packages/dom/dist/index.js';
import { createSource, createFrame } from '../packages/core/dist/index.js';
const base = { source: { width: 400, height: 200 }, box: { x: 0, y: 0, width: 100, height: 100 }, target: { x: 0, y: 0, width: 100, height: 100 } };
function mapped(input) { const r = mapSourceRegion(input); assert.equal(r.ok, true, JSON.stringify(r)); return r; }
test('independent object-fit and percentage/pixel position oracles', () => {
  assert.deepEqual(mapped(base).sample, { x: 0, y: 0, width: 400, height: 200 });
  const contain = mapped({ ...base, fit: 'contain' });
  assert.deepEqual(contain.visible, { x: 0, y: 25, width: 100, height: 50 });
  assert.deepEqual(contain.output, contain.visible);
  assert.deepEqual(mapped({ ...base, fit: 'cover' }).sample, { x: 100, y: 0, width: 200, height: 200 });
  assert.deepEqual(mapped({ ...base, fit: 'cover', position: { x: 1, y: 0 } }).sample, { x: 200, y: 0, width: 200, height: 200 });
  const offset = mapped({ ...base, fit: 'cover', position: { x: 0, y: 0, offsetX: -10 } }).sample;
  assert.equal(offset.x, 20); assert.ok(Math.abs(offset.width - 200) < 1e-10); assert.equal(offset.height, 200);
  assert.deepEqual(mapped({ ...base, fit: 'none' }).sample, { x: 150, y: 50, width: 100, height: 100 });
  assert.deepEqual(mapped({ ...base, fit: 'scale-down' }).sample, contain.sample);
  const small = mapped({ ...base, source: { width: 20, height: 10 }, fit: 'scale-down' });
  assert.deepEqual(small.visible, { x: 40, y: 45, width: 20, height: 10 });
});
test('scale/translation, source padding and backing placement are separate', () => {
  const input = { ...base, box: { x: 100, y: 200, width: 100, height: 100 },
    target: { x: 160, y: 295, width: 50, height: 75 }, transform: { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 }, padding: 10, dpr: 3 };
  const r = mapped(input);
  assert.deepEqual(r.sample, { x: 100, y: 50, width: 100, height: 50 });
  assert.deepEqual(r.crop, { x: 90, y: 40, width: 120, height: 70 });
  assert.deepEqual(r.sampleOffset, { x: 10, y: 10 });
  assert.deepEqual(r.backing, { width: 150, height: 225 });
  assert.deepEqual(r.output, { x: 0, y: 0, width: 150, height: 225 });
  const source = createSource({ contractVersion: 1, width: 400, height: 200, revision: 0, data: new Uint8Array(320000), ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
  assert.doesNotThrow(() => createFrame({ contractVersion: 1, generation: 0, revision: 0, sourceRevision: 0,
    surfaces: [{ id: 'mapped', width: 150, height: 225, sourceRect: r.crop }] }, source));
  assert.ok(Object.isFrozen(r.crop));
});
test('viewport scroll, resize and clipping use fresh boxes without page offsets', () => {
  const initial = { ...base, fit: 'contain', clip: { x: 20, y: 40, width: 40, height: 60 }, padding: 500 };
  const a = mapped(initial);
  assert.deepEqual(a.sample, { x: 80, y: 60, width: 160, height: 140 });
  assert.deepEqual(a.crop, { x: 0, y: 0, width: 400, height: 200 });
  assert.deepEqual(a.output, { x: 20, y: 40, width: 40, height: 35 });
  const shift = r => ({ ...r, x: r.x - 17, y: r.y - 83 });
  const b = mapped({ ...initial, box: shift(initial.box), target: shift(initial.target), clip: shift(initial.clip) });
  assert.deepEqual(b.sample, a.sample); assert.deepEqual(b.output, a.output);
  const resized = mapped({ ...base, box: { x: 0, y: 0, width: 200, height: 100 } });
  assert.deepEqual(resized.sample, { x: 0, y: 0, width: 200, height: 200 });
  assert.deepEqual(mapped({ ...base, dpr: 1.25 }).backing, { width: 125, height: 125 });
});
test('invalid/empty/unsupported inputs return typed results before allocation', () => {
  for (const transform of [{ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0.1, c: 0, d: 1, e: 0, f: 0 },
    { a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0, c: 0, d: 1, e: Infinity, f: 0 },
    { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, perspective: 1 }]) assert.equal(mapSourceRegion({ ...base, transform }).code, 'UNSUPPORTED_TRANSFORM');
  for (const input of [null, { ...base, source: { width: 4000001, height: 1 } }, { ...base, dpr: 0 }, { ...base, dpr: 100 },
    { ...base, padding: -1 }, { ...base, position: { x: NaN, y: 0 } }, { ...base, target: { ...base.target, width: 0 } }]) assert.equal(mapSourceRegion(input).code, 'INVALID_GEOMETRY');
  assert.equal(mapSourceRegion({ ...base, target: { x: 200, y: 200, width: 1, height: 1 } }).code, 'EMPTY_CLIP');
  assert.equal(mapSourceRegion({ ...base, fit: 'contain', target: { x: 0, y: 0, width: 100, height: 20 } }).code, 'EMPTY_CLIP');
});
