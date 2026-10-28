import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceProvider } from '../packages/dom/dist/index.js';

class Video extends EventTarget {
  videoWidth = 4; videoHeight = 2; currentTime = 0; currentSrc = '/one.mp4'; src = '/one.mp4';
  readyState = 2; paused = false; ended = false; error = null; next = 0; callbacks = new Map(); listeners = 0;
  addEventListener(...args) { this.listeners++; super.addEventListener(...args); }
  removeEventListener(...args) { this.listeners--; super.removeEventListener(...args); }
  requestVideoFrameCallback(fn) { this.callbacks.set(++this.next, fn); return this.next; }
  cancelVideoFrameCallback(id) { this.callbacks.delete(id); }
  frame() { const [id, fn] = this.callbacks.entries().next().value; this.callbacks.delete(id); fn(0, {}); }
}
test('video observation is lazy, one callback, cancellable, and never owns playback', () => {
  const v = new Video(), p = new SourceProvider({ kind: 'video', value: v });
  assert.equal(v.listeners, 0); assert.equal(v.callbacks.size, 0);
  let updates = 0;
  const unsubscribe = p.subscribe(() => updates++), other = p.subscribe(() => { throw new Error('consumer'); });
  assert.equal(v.listeners, 11); assert.equal(v.callbacks.size, 1);
  v.currentTime = 0.1; v.frame(); assert.equal(updates, 1); assert.equal(p.revision, 1); assert.equal(v.callbacks.size, 1);
  const stale = [...v.callbacks.values()][0];
  p.pause(); assert.equal(v.listeners, 0); assert.equal(v.callbacks.size, 0);
  assert.equal(v.paused, false); const revision = p.revision; stale(); assert.equal(p.revision, revision);
  p.resume(); assert.equal(updates, 2); assert.equal(v.callbacks.size, 1);
  v.paused = true; v.dispatchEvent(new Event('pause')); assert.equal(v.callbacks.size, 0);
  v.paused = false; v.dispatchEvent(new Event('playing')); assert.equal(v.callbacks.size, 1);
  other(); assert.equal(v.callbacks.size, 1); unsubscribe(); unsubscribe();
  assert.equal(v.callbacks.size, 0); assert.equal(v.listeners, 0);
  p.destroy(); assert.equal(v.src, '/one.mp4'); assert.equal(v.paused, false);
});
test('video identity, size and media faults invalidate; replacing detaches old listeners', async () => {
  const v = new Video(), p = new SourceProvider({ kind: 'video', value: v });
  const off = p.subscribe(() => {});
  v.currentSrc = '/two.mp4'; v.dispatchEvent(new Event('loadstart'));
  assert.equal(p.generation, 1); assert.equal(p.revision, 1);
  v.videoWidth = 8; v.dispatchEvent(new Event('resize')); assert.equal(p.revision, 2);
  v.error = {}; v.dispatchEvent(new Event('error')); assert.equal(v.callbacks.size, 0);
  await assert.rejects(p.read(), { code: 'UNAVAILABLE_SOURCE' });
  p.replace({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array(4) });
  assert.equal(v.listeners, 0); const rev = p.revision; v.dispatchEvent(new Event('resize')); assert.equal(p.revision, rev);
  assert.equal((await p.read()).generation, 2); off(); p.destroy();
});
test('fallback timer is bounded, detects changed time and stops on pause/unsubscribe/ended', () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let next = 0;
  globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 40); timers.set(++next, fn); return next; };
  globalThis.clearTimeout = id => timers.delete(id);
  try {
    for (const mode of ['absent', 'throws', 'no-cancel']) {
      const v = new Video();
      if (mode === 'absent') v.requestVideoFrameCallback = undefined;
      if (mode === 'throws') v.requestVideoFrameCallback = () => { throw new Error('unsupported'); };
      if (mode === 'no-cancel') v.cancelVideoFrameCallback = undefined;
      const p = new SourceProvider({ kind: 'video', value: v }); let updates = 0;
      const off = p.subscribe(() => updates++);
      assert.equal(timers.size, 1);
      const tick = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); };
      tick(); assert.equal(updates, 0); assert.equal(timers.size, 1);
      v.currentTime = 0.5; tick(); assert.equal(updates, 1);
      const stale = [...timers.values()][0]; p.pause(); assert.equal(timers.size, 0); stale(); assert.equal(timers.size, 0);
      p.resume(); assert.equal(timers.size, 1);
      v.ended = true; v.dispatchEvent(new Event('ended')); assert.equal(timers.size, 0);
      off(); p.destroy(); assert.equal(v.listeners, 0);
    }
  } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});
test('canvas resize is detected on read and explicit invalidation notifies without a polling clock', async () => {
  const canvas = { width: 2, height: 2 }, p = new SourceProvider({ kind: 'canvas', value: canvas });
  let updates = 0; const off = p.subscribe(() => updates++);
  canvas.width = 4;
  await assert.rejects(p.read(), { code: 'UNSUPPORTED_SOURCE' });
  assert.equal(p.revision, 1); assert.equal(updates, 1);
  p.invalidate(); assert.equal(updates, 2); off(); p.destroy();
  assert.equal(canvas.width, 4);
});

test('protected, seeking and not-yet-current replacement videos fail before raster access', async () => {
  for (const props of [{mediaKeys:{}}, {seeking:true}, {getAttribute:()=>'/next.mp4',src:'/next.mp4',currentSrc:'/old.mp4'}]) {
    const v = Object.assign(new Video(), props), p = new SourceProvider({kind:'video',value:v});
    await assert.rejects(p.read(), {code: props.mediaKeys ? 'UNREADABLE_SOURCE' : 'UNAVAILABLE_SOURCE'}); p.destroy();
  }
  const v = new Video(), p = new SourceProvider({kind:'video',value:v});p.pause();
  v.srcObject = {};p.resume();assert.equal(p.generation,1);p.destroy();
});
