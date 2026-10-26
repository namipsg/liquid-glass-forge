import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { CONTRACT_VERSION, OPTICAL_MODEL, ContractError, createSource, validateSource, createFrame,
  isCurrentFrame, transitionLifecycle, decodeSrgb, encodeSrgb, interpolateRgba } from '../packages/core/dist/index.js';

const input = (overrides = {}) => ({ contractVersion: 1, width: 2, height: 2, revision: 0,
  data: new Uint8ClampedArray(16), ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight', ...overrides });
const frame = (overrides = {}) => ({ contractVersion: 1, generation: 0, revision: 0, sourceRevision: 0,
  surfaces: [{ id: 'a', width: 2, height: 2 }], ...overrides });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('source metadata is owned; borrowed pixels retain identity, contents and attachment', () => {
  const value = input(); value.data[0] = 42;
  const source = createSource(value);
  assert.equal(CONTRACT_VERSION, 1); assert.equal(source.data, value.data);
  assert.equal(source.data.buffer.byteLength, 16); assert.equal(source.data[0], 42);
  value.width = 10; assert.equal(source.width, 2); assert.ok(Object.isFrozen(source));
  source.data[0] = 80; assert.equal(value.data[0], 80); // Borrowing is not a pixel snapshot.
});
test('accepts byte views from another realm and validates the exact view rather than the backing allocation', () => {
  const bytes = vm.runInNewContext('new Uint8ClampedArray(16)');
  assert.equal(createSource(input({ data: bytes })).data, bytes);
  const partial = new Uint8Array(new ArrayBuffer(32), 8, 16);
  assert.equal(createSource(input({ data: partial })).data.byteOffset, 8);
  assert.throws(() => createSource(input({ data: partial, ownership: 'transfer' })), /entire dedicated buffer/);
});
test('transfer permission is explicit and validation itself never detaches', () => {
  const bytes = new Uint8Array(16); const source = createSource(input({ data: bytes, ownership: 'transfer' }));
  validateSource(source); assert.equal(bytes.buffer.byteLength, 16);
  structuredClone(bytes, { transfer: [bytes.buffer] });
  assert.throws(() => validateSource(source), ContractError);
});
test('rejects malformed, unsupported, nonfinite, huge, shared and wrong-format sources', () => {
  for (const patch of [{ contractVersion: 2 }, { width: NaN }, { height: Infinity }, { width: 1.5 },
    { width: 0 }, { width: Number.MAX_SAFE_INTEGER }, { revision: -1 }, { revision: 0.1 },
    { revision: Number.MAX_SAFE_INTEGER + 1 }, { data: new Uint8Array(15) }, { data: new Float32Array(4) },
    { data: new Int8Array(16) }, { ownership: undefined }, { colorSpace: 'display-p3' }, { alphaMode: 'premultiplied' },
    { data: new Uint8Array(new SharedArrayBuffer(16)) }]) {
    assert.throws(() => createSource(input(patch)), ContractError, JSON.stringify(patch));
  }
  for (const value of [null, undefined, [], 'pixels']) assert.throws(() => createSource(value), ContractError);
});
test('frame snapshots crop and material metadata; changes cannot alter a scheduled frame', () => {
  const source = createSource(input()); const value = frame(); value.surfaces[0].sourceRect = { x: .5, y: .5, width: 1, height: 1 };
  const result = createFrame(value, source);
  value.surfaces[0].sourceRect.x = 0; value.surfaces.push({ id: 'b', width: 1, height: 1 });
  assert.equal(result.opticalModel, OPTICAL_MODEL); assert.equal(result.surfaces.length, 1);
  assert.equal(result.surfaces[0].sourceRect.x, .5);
  assert.ok(Object.isFrozen(result.surfaces[0].sourceRect)); assert.ok(Object.isFrozen(result.surfaces));
});
test('rejects stale generations/revisions through the frame acceptance contract', () => {
  const current = createFrame(frame(), createSource(input()));
  assert.ok(isCurrentFrame(current, current));
  for (const key of ['generation', 'revision', 'sourceRevision']) assert.equal(isCurrentFrame(current, { ...current, [key]: 1 }), false);
  assert.throws(() => createFrame(frame({ sourceRevision: 1 }), createSource(input())), { code: 'STALE_SOURCE' });
});
test('rejects unbounded frames, duplicate IDs, invalid effects and out-of-bounds crops', () => {
  const source = createSource(input());
  for (const patch of [{ contractVersion: 2 }, { generation: -1 }, { revision: Infinity }, { surfaces: [] },
    { surfaces: Array.from({ length: 17 }, (_, i) => ({ id: String(i), width: 1, height: 1 })) },
    { surfaces: [{ id: 'a', width: 2, height: 2 }, { id: 'a', width: 2, height: 2 }] },
    { surfaces: [{ id: 'a', width: 2000, height: 2000 }, { id: 'b', width: 1, height: 1 }] }]) {
    assert.throws(() => createFrame(frame(patch), source), ContractError);
  }
  for (const patch of [{ id: '' }, { width: .5 }, { radius: 2 }, { bevel: 0 }, { strength: NaN },
    { strength: 1_000_001 }, { sourceRect: { x: 1, y: 0, width: 2, height: 2 } }]) {
    assert.throws(() => createFrame(frame({ surfaces: [{ id: 'a', width: 2, height: 2, ...patch }] }), source), ContractError);
  }
});
test('lifecycle allows a settled setup/pause/resume and makes destruction terminal and idempotent', () => {
  let state = 'new';
  for (const [event, expected] of [['initialize', 'initializing'], ['resolve', 'ready'], ['pause', 'paused'], ['resume', 'ready'], ['destroy', 'destroyed'], ['destroy', 'destroyed']]) {
    state = transitionLifecycle(state, event); assert.equal(state, expected);
  }
  assert.throws(() => transitionLifecycle(state, 'resolve'), ContractError);
  assert.equal(transitionLifecycle('initializing', 'fail'), 'failed');
  assert.throws(() => transitionLifecycle('failed', 'initialize'), ContractError);
  assert.throws(() => transitionLifecycle('unknown', 'destroy'), ContractError);
});
test('sRGB reference values match independent fixed analytical fixtures', () => {
  for (const [encoded, linear] of [[0, 0], [1, 1], [.04045, .0031308049535603713], [.5, .21404114048223255]]) near(decodeSrgb(encoded), linear);
  near(encodeSrgb(.5), .7353569830524495); near(encodeSrgb(.0031308), .040449936);
  for (const value of [NaN, Infinity, -.1, 1.1]) {
    assert.throws(() => decodeSrgb(value), ContractError); assert.throws(() => encodeSrgb(value), ContractError);
  }
});
test('bilinear reference blends linear light and suppresses transparent hidden colors', () => {
  const black = [0, 0, 0, 1], white = [1, 1, 1, 1];
  const gray = interpolateRgba([black, white, black, white], .5, .5);
  for (const value of gray.slice(0, 3)) near(value, .7353569830524495); assert.equal(gray[3], 1);
  const hiddenRed = [1, 0, 0, 0], blue = [0, 0, 1, 1];
  assert.deepEqual(interpolateRgba([hiddenRed, blue, hiddenRed, blue], .5, .5), [0, 0, 1, .5]);
  assert.deepEqual(interpolateRgba([hiddenRed, hiddenRed, hiddenRed, hiddenRed], .7, .4), [0, 0, 0, 0]);
  assert.throws(() => interpolateRgba([black, white], .5, .5), ContractError);
  assert.throws(() => interpolateRgba([black, white, black, white], NaN, .5), ContractError);
});


test('strict versioned schemas reject unknown fields, null rectangles and sparse inputs', () => {
  assert.throws(() => createSource(input({ colourSpace: 'srgb' })), /Unknown source field/);
  const source = createSource(input());
  assert.throws(() => createFrame(frame({ opticalModel: 'future-model' }), source), /Unknown frame field/);
  assert.throws(() => createFrame(frame({ surfaces: new Array(1) }), source), ContractError);
  assert.throws(() => createFrame(frame({ surfaces: [{ id: 'a', width: 2, height: 2, sourceRect: null }] }), source), ContractError);
  assert.throws(() => createFrame(frame({ surfaces: [{ id: 'a', width: 2, height: 2, blur: 10 }] }), source), /Unknown surface field/);
  assert.throws(() => interpolateRgba(new Array(4), .5, .5), ContractError);
});

test('native storage brands reject spoofed wider views and shared buffers', () => {
  const wider = new Float32Array(4);
  Object.defineProperty(wider, Symbol.toStringTag, { value: 'Uint8Array' });
  assert.throws(() => createSource(input({ data: wider })), ContractError);
  const shared = new SharedArrayBuffer(16);
  Object.defineProperty(shared, Symbol.toStringTag, { value: 'ArrayBuffer' });
  assert.throws(() => createSource(input({ data: new Uint8Array(shared) })), ContractError);
});
