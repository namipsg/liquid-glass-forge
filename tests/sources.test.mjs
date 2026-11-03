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
test('pixel snapshots bulk-copy offset views of both byte brands without aliasing or changing the result brand', async () => {
  for (const Type of [Uint8Array, Uint8ClampedArray]) {
    const backing = new Type([90, 91, 0, 128, 255, 255, 92, 93]), input = backing.subarray(2, 6);
    const provider = new SourceProvider(spec(input));
    const pending = provider.read(); input.fill(1);
    const snapshot = await pending;
    assert.ok(snapshot.source.data instanceof Uint8ClampedArray);
    assert.equal(snapshot.source.data.byteOffset, 0); assert.equal(snapshot.source.data.buffer.byteLength, 4);
    assert.deepEqual([...snapshot.source.data], [0, 128, 255, 255]);
    snapshot.source.data.fill(2); assert.deepEqual([...input], [1, 1, 1, 1]);
    assert.deepEqual([...backing.subarray(0, 2)], [90, 91]); assert.deepEqual([...backing.subarray(6)], [92, 93]);
    assert.equal(backing.buffer.byteLength, 8); provider.destroy();
  }
});
test('readInto captures every byte synchronously into caller-owned subviews without changing default read ownership', async () => {
  for (const Type of [Uint8Array,Uint8ClampedArray]) {
    const input=new Type([0,128,255,255]),backing=new Type([90,91,8,8,8,8,92,93]),target=backing.subarray(2,6),provider=new SourceProvider(spec(input));
    const pending=provider.readInto(target);input.fill(1);const captured=await pending;
    assert.equal(captured.source.data,target);assert.equal(captured.source.ownership,'borrowed');assert.deepEqual([...target],[0,128,255,255]);
    assert.deepEqual([...backing.subarray(0,2)],[90,91]);assert.deepEqual([...backing.subarray(6)],[92,93]);
    input.set([4,5,6,255]);provider.invalidate();const next=await provider.readInto(target);assert.deepEqual([...target],[4,5,6,255]);assert.equal(next.revision,1);
    const owned=await provider.read();assert.equal(owned.source.ownership,'transfer');assert.notEqual(owned.source.data.buffer,target.buffer);
    provider.destroy();assert.equal(backing.byteLength,8);assert.deepEqual([...target],[4,5,6,255]);
  }
});
test('readInto rejects invalid/aliased targets before writing and preserves abort/latest/replacement/disposal semantics', async () => {
  const input=new Uint8Array([12,34,56,255]),provider=new SourceProvider(spec(input));
  const detached=new Uint8Array(4);structuredClone(detached,{transfer:[detached.buffer]});
  for(const target of [undefined,input,new Uint8Array(3),new Float32Array(1),new Uint8Array(new SharedArrayBuffer(4)),detached]) {
    await assert.rejects(provider.readInto(target),{code:'INVALID_SOURCE'});assert.deepEqual([...input],[12,34,56,255]);
  }
  const target=new Uint8Array([9,9,9,9]),abort=new AbortController();abort.abort();
  await assert.rejects(provider.readInto(target,{signal:abort.signal}),{code:'ABORTED'});assert.deepEqual([...target],[9,9,9,9]);
  const a=provider.readInto(target),b=provider.readInto(new Uint8Array(4));await assert.rejects(a,{code:'SUPERSEDED'});await b;
  provider.replace(spec(new Uint8Array([1,2,3,255])));const snapshot=await provider.readInto(target);assert.equal(snapshot.generation,1);assert.deepEqual([...target],[1,2,3,255]);
  provider.destroy();await assert.rejects(provider.readInto(target),{code:'DESTROYED'});assert.equal(target.byteLength,4);
  const image=new SourceProvider({kind:'image',url:'https://example.invalid/not-fetched.png'});await assert.rejects(image.readInto(target),{code:'UNSUPPORTED_SOURCE'});image.destroy();
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
