import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceProvider, SourceError } from '../packages/dom/dist/index.js';

const spec = (data = new Uint8Array([12, 34, 56, 78])) => ({ kind: 'pixels', width: 1, height: 1, data });
test('application bytes snapshot before yielding; metadata and storage are independent', async () => {
  const input = spec(), provider = new SourceProvider(input);
  const pending = provider.read(); input.data[0] = 222; input.width = 2;
  const snapshot = await pending;
  assert.equal(snapshot.source.data[0], 12);
  assert.notEqual(snapshot.source.data.buffer, input.data.buffer);
  assert.equal(snapshot.source.ownership, 'transfer');
  assert.ok(Object.isFrozen(snapshot));
  provider.destroy(); provider.destroy();
  assert.equal(input.data.byteLength, 4);
  assert.equal(snapshot.source.data[0], 12);
});
test('latest read wins, replacement and invalidation reject stale work', async () => {
  const p = new SourceProvider(spec());
  const a = p.read(), rejected = assert.rejects(a, { code: 'SUPERSEDED' });
  const b = p.read(); await rejected; assert.equal((await b).revision, 0);
  const c = p.read(), replaced = assert.rejects(c, { code: 'SUPERSEDED' });
  p.replace(spec(new Uint8Array([1, 2, 3, 255]))); await replaced;
  assert.equal((await p.read()).generation, 1);
  const d = p.read(), invalidated = assert.rejects(d, { code: 'SUPERSEDED' });
  p.invalidate(); await invalidated; assert.equal((await p.read()).revision, 2);
  p.destroy();
});
test('abort, pause, resume and terminal idempotent destroy all settle', async () => {
  const p = new SourceProvider(spec()), controller = new AbortController();
  const pending = p.read({ signal: controller.signal });
  const aborted = assert.rejects(pending, { code: 'ABORTED' }); controller.abort(); await aborted;
  await assert.rejects(p.read({ signal: controller.signal }), { code: 'ABORTED' });
  const pausedRead = p.read(), paused = assert.rejects(pausedRead, { code: 'PAUSED' }); p.pause(); await paused;
  await assert.rejects(p.read(), { code: 'PAUSED' });
  p.resume(); assert.equal((await p.read()).revision, 1);
  const destroyedRead = p.read(), destroyed = assert.rejects(destroyedRead, { code: 'DESTROYED' });
  p.destroy(); p.destroy(); await destroyed;
  await assert.rejects(p.read(), { code: 'DESTROYED' });
  assert.throws(() => p.replace(spec()), { code: 'DESTROYED' });
  assert.throws(() => p.resume(), { code: 'DESTROYED' });
});
test('invalid, shared, detached and oversized storage is rejected before copying', async () => {
  for (const input of [spec(new Float32Array(1)), spec(new Uint8Array(new SharedArrayBuffer(4))),
    { ...spec(), width: NaN }, { ...spec(), width: 4000001 }, { ...spec(), height: -1 }]) {
    const p = new SourceProvider(input); await assert.rejects(p.read(), { code: 'INVALID_SOURCE' }); p.destroy();
  }
  const data = new Uint8Array(4); structuredClone(data.buffer, { transfer: [data.buffer] });
  await assert.rejects(new SourceProvider(spec(data)).read(), { code: 'INVALID_SOURCE' });
  assert.throws(() => new SourceProvider({ kind: 'dom-capture' }), { code: 'UNSUPPORTED_SOURCE' });
  for (const timeoutMs of [0, Infinity, NaN, 60001]) assert.throws(() => new SourceProvider(spec(), { timeoutMs }), SourceError);
  await assert.rejects(new SourceProvider({ kind: 'image', url: '/x.png' }).read(), { code: 'UNSUPPORTED_SOURCE' });
});
test('native decode that never settles is bounded and owned image handlers are released', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image'); const images = [];
  class HungImage {
    onload = null; onerror = null; src = '';
    constructor() { images.push(this); }
    decode() { return new Promise(() => {}); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: HungImage });
  try {
    const p = new SourceProvider({ kind: 'image', url: '/hang' }, { timeoutMs: 5 });
    await assert.rejects(p.read(), { code: 'TIMEOUT' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(images[0].src, ''); assert.equal(images[0].onload, null); assert.equal(images[0].onerror, null);
    // The no-decode capability path must be bounded by the same deadline.
    delete HungImage.prototype.decode;
    await assert.rejects(p.read(), { code: 'TIMEOUT' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(images[1].src, ''); assert.equal(images[1].onload, null); assert.equal(images[1].onerror, null);
    p.destroy();
  } finally {
    if (original) Object.defineProperty(globalThis, 'Image', original); else delete globalThis.Image;
  }
});
