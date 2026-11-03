import test from 'node:test';
import assert from 'node:assert/strict';
import { createSource, createFrame } from '../packages/core/dist/index.js';
import { CpuExecutor, CpuDeadlineScheduler, CPU_LOOKUP_BYTES, prepareCpuSource, renderCpu, disposeCpuSource } from '../packages/cpu/dist/index.js';
import { runCpuBatch } from '../packages/cpu/dist/protocol.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const source = (color = [180, 37, 91, 128]) => createSource({ contractVersion: 1, width: 2, height: 2, revision: 0,
  ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight', data: new Uint8Array(Array(4).fill(color).flat()) });
const frame = (s, revision = 0, width = 3, generation = 0) => createFrame({ contractVersion: 1, generation, revision, sourceRevision: s.revision,
  surfaces: [{ id: 'card', width, height: 2, radius: 0, strength: 0 }] }, s);
const material = { model: 'rounded-material-v1', blurRadius: 1, dispersion: .4, tint: [.1, .6, .2, .2], rim: .2, specular: .3 };
class FakeWorker {
  onmessage = null; onerror = null; onmessageerror = null; terminated = 0; calls = []; live = 0; peak = 0;
  postMessage(message, transfer) {
    const owned = structuredClone(message, { transfer });
    this.calls.push(owned); this.live++; this.peak = Math.max(this.peak, this.live);
  }
  finish(index = this.calls.length - 1, patch = v => v) {
    const work = this.calls[index], result = runCpuBatch(work); this.live--;
    const message = patch({ type: 'result', id: work.id, result, returnedInput: work.source.data });
    this.onmessage?.({ data: structuredClone(message, { transfer: [...new Set([work.source.data.buffer, ...result.surfaces.map(s => s.data.buffer)])] }) });
  }
  terminate() { this.terminated++; this.live = 0; }
}

test('main CPU batch snapshots borrowed bytes/effects and matches direct verified kernel', async () => {
  const s = source(), before = [...s.data], f = frame(s), effects = structuredClone(material);
  const prepared = prepareCpuSource(s), expected = renderCpu(prepared, f.surfaces[0], effects); disposeCpuSource(prepared);
  const executor = new CpuExecutor({ worker: 'off', workerFactory() { throw new Error('must not construct'); } });
  const pending = executor.render(s, f, { effects }); s.data.fill(0); effects.tint[3] = 1;
  const result = await pending; assert.deepEqual(result.surfaces[0].data, expected); assert.equal(result.generation, 0);
  assert.ok(Object.values(result.timings).every(t => t >= 0 && Number.isFinite(t)));
  assert.equal(executor.diagnostics.execution, 'main'); result.release(); result.release(); executor.dispose();
  await tick(); assert.equal(executor.diagnostics.reservedBytes, 0); assert.deepEqual(before.slice(0, 4), [180, 37, 91, 128]);
});

test('worker transfers owned staging and reuses bounded output leases without detaching shared inputs', async () => {
  const worker = new FakeWorker(), s = source(), original = [...s.data], executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker, maxPoolBytes: 64 });
  for (let revision = 0; revision < 3; revision++) {
    const f = frame(s, revision), pending = executor.render(s, f, { effects: material }); await tick();
    worker.finish(); const result = await pending;
    const prepared = prepareCpuSource(s); assert.deepEqual(result.surfaces[0].data, renderCpu(prepared, f.surfaces[0], material)); disposeCpuSource(prepared);
    assert.equal(s.data.buffer.byteLength, 16); assert.deepEqual([...s.data], original);
    result.release(); assert.equal(executor.diagnostics.leasedBytes, 0); assert.ok(executor.diagnostics.pooledBytes <= 64); await tick();
  }
  assert.equal(worker.peak, 1); assert.equal(executor.diagnostics.completedBatches, 3); executor.dispose(); assert.equal(worker.terminated, 1);
  assert.equal(executor.diagnostics.pooledBytes, 0);
});

test('required worker transfers one owned capture of either byte subview and pools the returned input', async () => {
  for (const Bytes of [Uint8Array, Uint8ClampedArray]) {
    const backing = new Bytes(24).fill(77), view = backing.subarray(4, 20);
    view.set(source().data);
    const s = createSource({ ...source(), data: view }), worker = new FakeWorker();
    const executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker });
    let returnedBuffer;
    const post = worker.postMessage.bind(worker);
    worker.postMessage = (work, transfer) => {
      if (returnedBuffer) assert.equal(work.source.data.buffer, returnedBuffer);
      assert.notEqual(work.source.data.buffer, backing.buffer);
      post(work, transfer);
    };
    try {
      for (let revision = 0; revision < 2; revision++) {
        view.set(source().data); const expected = [...view];
        const pending = executor.render(s, frame(s, revision)); view.fill(0); await tick();
        assert.deepEqual([...worker.calls[revision].source.data], expected);
        const receive = worker.onmessage;
        worker.onmessage = event => { returnedBuffer = event.data.returnedInput.buffer; receive(event); };
        worker.finish(); const result = await pending;
        assert.equal(result.timings.transferCopyMs, 0);
        assert.equal(executor.diagnostics.inputPooledBuffers, 1);
        assert.equal(executor.diagnostics.inputPooledBytes, 16);
        assert.equal(backing.byteLength, 24); assert.deepEqual([...backing.subarray(0, 4)], [77, 77, 77, 77]);
        assert.deepEqual([...view], Array(16).fill(0)); result.release(); await tick();
      }
    } finally { executor.dispose(); }
  }
});

test('auto fallback keeps captured bytes after staging has actually transferred and the worker fails', async () => {
  const s = source(), worker = new FakeWorker(), executor = new CpuExecutor({ worker: 'auto', workerFactory: () => worker });
  const f = frame(s), prepared = prepareCpuSource(s), expected = renderCpu(prepared, f.surfaces[0]); disposeCpuSource(prepared);
  const pending = executor.render(s, f); s.data.fill(0); await tick();
  assert.deepEqual([...worker.calls[0].source.data.slice(0, 4)], [180, 37, 91, 128]);
  worker.onerror({ preventDefault() {} });
  const result = await pending;
  assert.deepEqual(result.surfaces[0].data, expected);
  assert.equal(executor.diagnostics.execution, 'main'); assert.equal(executor.diagnostics.fallbackReason, 'WORKER_FAILED');
  assert.equal(s.data.byteLength, 16); assert.ok(executor.diagnostics.lostBytes > 0);
  result.release(); executor.dispose();
});

test('direct transfer still rejects missing or aliased input and too-small retained cache after detachment', async () => {
  for (const mode of ['missing', 'wrong-size', 'output-alias', 'retained-too-small']) {
    const s = source(), worker = new FakeWorker();
    const executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker, cacheSources: true });
    const pending = executor.render(s, frame(s, 0, 2)); await tick();
    worker.finish(0, message => {
      message.result.retainedBytes = mode === 'retained-too-small' ? 0 : 64;
      if (mode === 'missing') delete message.returnedInput;
      if (mode === 'wrong-size') message.returnedInput = new Uint8Array(4);
      if (mode === 'output-alias') message.returnedInput = new Uint8Array(message.result.surfaces[0].data.buffer);
      return message;
    });
    await assert.rejects(pending, { code: 'WORKER_PROTOCOL' }); await tick();
    assert.equal(executor.diagnostics.completedBatches, 0, mode);
    assert.equal(executor.diagnostics.reservedBytes, 0, mode);
    assert.ok(executor.diagnostics.lostBytes > 0, mode);
    assert.equal(worker.terminated, 1, mode); assert.equal(s.data.byteLength, 16, mode); executor.dispose();
  }
});

test('one in-flight plus latest pending rejects superseded batches and recycles stale resized output', async () => {
  const s = source(), worker = new FakeWorker(), executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker });
  const first = executor.render(s, frame(s, 0)); await tick();
  const second = executor.render(s, frame(s, 1, 4));
  const latest = executor.render(s, frame(s, 2, 5));
  await assert.rejects(first, { code: 'SUPERSEDED' }); await assert.rejects(second, { code: 'SUPERSEDED' });
  assert.equal(executor.diagnostics.inFlight, 1); assert.equal(executor.diagnostics.pending, 1); assert.equal(worker.calls.length, 1);
  worker.finish(0); await tick(); assert.equal(worker.calls.length, 2); assert.equal(worker.calls[1].frame.revision, 2);
  worker.finish(1); const result = await latest; assert.equal(result.revision, 2); assert.equal(result.surfaces[0].width, 5);
  result.release(); await tick(); assert.equal(worker.peak, 1); assert.equal(executor.diagnostics.reservedBytes, 0);
  assert.equal(executor.diagnostics.discardedBatches, 2); executor.dispose();
});

test('abort pending/active, disposal and late completion cannot revive or leak queue reservations', async () => {
  const s = source(), worker = new FakeWorker(), executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker });
  const activeAbort = new AbortController(), a = executor.render(s, frame(s), { signal: activeAbort.signal }); await tick(); activeAbort.abort();
  await assert.rejects(a, { code: 'ABORTED' });
  const pendingAbort = new AbortController(), b = executor.render(s, frame(s, 1), { signal: pendingAbort.signal }); pendingAbort.abort();
  await assert.rejects(b, { code: 'ABORTED' }); assert.equal(executor.diagnostics.pending, 0);
  worker.finish(); await tick(); assert.equal(executor.diagnostics.reservedBytes, 0);
  const c = executor.render(s, frame(s, 2)); await tick(); executor.dispose(); executor.dispose(); await assert.rejects(c, { code: 'DISPOSED' });
  await tick(); assert.equal(executor.diagnostics.reservedBytes, 0); assert.equal(executor.diagnostics.pooledBytes, 0);
  assert.ok(executor.diagnostics.lostBytes > 0); assert.equal(worker.terminated, 1); assert.equal(s.data.byteLength, 16);
  await assert.rejects(executor.render(s, frame(s, 3)), { code: 'DISPOSED' });
});

test('unavailable/blocked worker falls back once in auto, remains an explicit failure in required and stays unused in off', async () => {
  let attempts = 0; const factory = () => { attempts++; throw new Error('blocked by policy'); }, s = source();
  const auto = new CpuExecutor({ workerFactory: factory });
  for (let i = 0; i < 2; i++) { const out = await auto.render(s, frame(s, i)); out.release(); await tick(); }
  assert.equal(attempts, 1); assert.equal(auto.diagnostics.execution, 'main'); assert.equal(auto.diagnostics.fallbackReason, 'WORKER_FAILED'); auto.dispose();
  const required = new CpuExecutor({ worker: 'required', workerFactory: factory });
  await assert.rejects(required.render(s, frame(s)), { code: 'WORKER_FAILED' }); required.dispose();
  const off = new CpuExecutor({ worker: 'off', workerFactory: factory }), count = attempts;
  const out = await off.render(s, frame(s)); out.release(); off.dispose(); assert.equal(attempts, count);
});

test('worker timeout/error/messageerror and malformed identities are bounded with loss accounting', async () => {
  const s = source();
  for (const mode of ['timeout', 'error', 'messageerror', 'wrong-id', 'wrong-frame', 'wrong-pixels']) {
    const worker = new FakeWorker(), executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker, timeoutMs: 15 });
    const pending = executor.render(s, frame(s)); await tick();
    if (mode === 'error') worker.onerror({ preventDefault() {} });
    if (mode === 'messageerror') worker.onmessageerror({});
    if (mode === 'wrong-id') worker.finish(0, m => ({ ...m, id: m.id + 1 }));
    if (mode === 'wrong-frame') worker.finish(0, m => ({ ...m, result: { ...m.result, generation: 9 } }));
    if (mode === 'wrong-pixels') worker.finish(0, m => ({ ...m, result: { ...m.result, surfaces: [] } }));
    await assert.rejects(pending); await tick();
    assert.equal(worker.terminated, 1, mode); assert.equal(executor.diagnostics.reservedBytes, 0, mode); assert.ok(executor.diagnostics.lostBytes > 0, mode);
    assert.equal(executor.diagnostics.completedBatches, 0, mode); executor.dispose();
  }
  const worker = new FakeWorker(), auto = new CpuExecutor({ workerFactory: () => worker, timeoutMs: 10 });
  const result = await auto.render(s, frame(s)); assert.equal(auto.diagnostics.execution, 'main'); assert.equal(auto.diagnostics.fallbackReason, 'TIMEOUT');
  assert.deepEqual([...s.data.slice(0, 4)], [180, 37, 91, 128]); result.release(); auto.dispose();
});

test('live allocation budget includes unreleased leases; pooling and disposal preserve honest outstanding accounting', async () => {
  const s = createSource({ contractVersion: 1, width: 1, height: 1, revision: 0, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight', data: new Uint8Array([1, 2, 3, 255]) });
  const f = revision => createFrame({ contractVersion: 1, generation: 0, revision, sourceRevision: 0, surfaces: [{ id: 'one', width: 1, height: 1, radius: 0, strength: 0 }] }, s);
  const executor = new CpuExecutor({ worker: 'off', maxOwnedBytes: 32 + CPU_LOOKUP_BYTES, maxPoolBytes: 4 }), held = [];
  for (let i = 0; i < 3; i++) { held.push(await executor.render(s, f(i))); await tick(); }
  await assert.rejects(executor.render(s, f(4)), { code: 'BUDGET' }); assert.equal(executor.diagnostics.leasedBytes, 12);
  executor.dispose(); assert.equal(executor.diagnostics.leasedBytes, 12);
  for (const out of held) { out.release(); out.release(); }
  assert.equal(executor.diagnostics.leasedBytes, 0); assert.equal(executor.diagnostics.pooledBytes, 0);
});

test('invalid/stale metadata fails before a worker or allocation, and data-only frame metadata is snapshotted', async () => {
  const s = source(), worker = new FakeWorker(), executor = new CpuExecutor({ worker: 'required', workerFactory: () => worker });
  await assert.rejects(executor.render(s, { ...frame(s), opticalModel: 'forged' }));
  await assert.rejects(executor.render(s, frame(s), { effects: { model: 'rounded-material-v1', blurRadius: null } }));
  assert.equal(worker.calls.length, 0); assert.equal(executor.diagnostics.reservedBytes, 0);
  const f = structuredClone(frame(s, 3)), pending = executor.render(s, f); f.surfaces[0].width = 99; await tick();
  assert.equal(worker.calls[0].frame.surfaces[0].width, 3); worker.finish(); const out = await pending; out.release(); await tick();
  await assert.rejects(executor.render(s, frame(s, 2)), { code: 'STALE' }); executor.dispose();
});

test('deferred execution owns its snapshot before awaiting and reports actual owner-realm start timing', async () => {
  const s=source(),worker=new FakeWorker(),executor=new CpuExecutor({worker:'required',workerFactory:()=>worker});
  const original=[...s.data],deadline=performance.now()+40,starts=[];
  const options={notBefore:deadline,onStart:at=>starts.push(at)},pending=executor.render(s,frame(s),options);
  options.notBefore=0;options.onStart=()=>{throw new Error('late option mutation');};s.data.fill(0);
  await tick();assert.equal(worker.calls.length,0);assert.equal(executor.diagnostics.inFlight,1);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(starts.length,1);assert.ok(starts[0]>=deadline);assert.deepEqual([...worker.calls[0].source.data],original);
  worker.finish(0,m=>({...m,result:{...m.result,timings:{...m.result.timings,scheduledWaitMs:-1,startedAt:-1}}}));
  const batch=await pending;
  assert.ok(batch.timings.scheduledWaitMs>0);assert.equal(batch.timings.startedAt,starts[0]);assert.equal(s.data.byteLength,16);
  batch.release();executor.dispose();
});

test('deferred supersession, abort and disposal clear waits without constructing a worker or starting late', async () => {
  let workers=0,starts=0;const s=source(),executor=new CpuExecutor({worker:'required',workerFactory:()=>{workers++;return new FakeWorker();}});
  const schedule={notBefore:performance.now()+50,onStart:()=>starts++};
  const a=executor.render(s,frame(s,0),schedule);await tick();
  const b=executor.render(s,frame(s,1),schedule),abort=new AbortController();
  const c=executor.render(s,frame(s,2),{...schedule,signal:abort.signal});
  await assert.rejects(a,{code:'SUPERSEDED'});await assert.rejects(b,{code:'SUPERSEDED'});abort.abort();
  await assert.rejects(c,{code:'ABORTED'});await tick();
  const d=executor.render(s,frame(s,3),schedule);await tick();executor.dispose();await assert.rejects(d,{code:'DISPOSED'});
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(workers,0);assert.equal(starts,0);assert.equal(executor.diagnostics.reservedBytes,0);
  assert.equal(executor.diagnostics.inFlight,0);assert.equal(executor.diagnostics.pending,0);assert.equal(executor.diagnostics.pooledBytes,0);
});

test('invalid schedules fail before capture and callback failures free owned reservations before worker creation', async () => {
  const s=source();let workers=0;const executor=new CpuExecutor({worker:'required',workerFactory:()=>{workers++;return new FakeWorker();}});
  for(const notBefore of [-1,null,NaN,Infinity,performance.now()+120000]) await assert.rejects(executor.render(s,frame(s),{notBefore}),{code:'INVALID_OPTIONS'});
  await assert.rejects(executor.render(s,frame(s),{onStart:42}),{code:'INVALID_OPTIONS'});
  assert.equal(executor.diagnostics.pooledBytes,0);assert.equal(executor.diagnostics.reservedBytes,0);
  await assert.rejects(executor.render(s,frame(s),{onStart:()=>{throw new Error('start callback failure');}}),/start callback failure/);await tick();
  assert.equal(workers,0);assert.equal(executor.diagnostics.reservedBytes,0);assert.equal(executor.diagnostics.completedBatches,0);
  executor.dispose();
});

test('deadline scheduler uses active posted tasks across a 3.5ms wait without resolving early or posting after completion', async () => {
  const descriptors = new Map(['performance', 'setTimeout', 'clearTimeout', 'MessageChannel']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let now = 100, timerCalls = 0, posts = 0, closed = 0, settled = false;
  const tasks = [], timers = new Map(); let timerId = 0;
  const scheduler = new CpuDeadlineScheduler();
  try {
    const replacements = {
      performance: { now: () => now },
      setTimeout: callback => { timerCalls++; timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => { timers.delete(id); },
      MessageChannel: class {
        port1 = { onmessage: null, close() { closed++; } };
        port2 = { postMessage: data => { posts++; tasks.push(() => this.port1.onmessage?.({ data })); }, close() { closed++; } };
      }
    };
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const deadline = now + 3.5;
    const pending = scheduler.waitUntil(deadline).then(elapsed => { settled = true; return elapsed; });
    void pending.catch(() => {});
    assert.equal(timerCalls, 0); assert.equal(tasks.length, 1); assert.equal(posts, 1);
    for (const at of [100, 101, 103, 103.499]) {
      now = at; assert.equal(tasks.length, 1); tasks.shift()(); await Promise.resolve();
      assert.equal(settled, false, `must still wait at ${at}`);
      assert.equal(tasks.length, 1); assert.equal(timerCalls, 0);
    }
    now = deadline; tasks.shift()();
    assert.equal(await pending, 3.5); assert.equal(settled, true);
    assert.equal(tasks.length, 0); assert.equal(timers.size, 0); assert.equal(timerCalls, 0);
    const completedPosts = posts; now += 100; await Promise.resolve();
    assert.equal(posts, completedPosts); assert.equal(tasks.length, 0);
    scheduler.dispose(); assert.equal(closed, 2); assert.equal(posts, completedPosts);
  } finally {
    scheduler.dispose();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test('deadline scheduler is lazy, strict, cancellable, generation-bound and posts nothing while idle', async () => {
  const Native = globalThis.MessageChannel; let created=0,closed=0,posts=0;
  globalThis.MessageChannel=class {
    constructor(){const channel=new Native();created++;
      for(const port of [channel.port1,channel.port2]){const close=port.close.bind(port);port.close=()=>{closed++;close();};}
      const post=channel.port2.postMessage.bind(channel.port2);channel.port2.postMessage=(...args)=>{posts++;return post(...args);};return channel;}
  };
  const scheduler=new CpuDeadlineScheduler();
  try {
    assert.equal(created,0);await scheduler.waitUntil(0);assert.equal(created,0);
    const deadline=performance.now()+2;await scheduler.waitUntil(deadline);assert.ok(performance.now()>=deadline);assert.equal(created,1);
    const idle=posts;await new Promise(r=>setTimeout(r,10));assert.equal(posts,idle);
    const old=scheduler.waitUntil(performance.now()+30),nextDeadline=performance.now()+3,next=scheduler.waitUntil(nextDeadline);
    await assert.rejects(old,{code:'SUPERSEDED'});await next;assert.ok(performance.now()>=nextDeadline);
    const controller=new AbortController(),aborted=scheduler.waitUntil(performance.now()+30,controller.signal);controller.abort(new Error('abort deadline'));
    await assert.rejects(aborted,/abort deadline/);
    const disposed=scheduler.waitUntil(performance.now()+30);scheduler.dispose();await assert.rejects(disposed,{code:'DISPOSED'});
    const final=posts;await new Promise(r=>setTimeout(r,40));assert.equal(posts,final);assert.equal(closed,created*2);
    await assert.rejects(scheduler.waitUntil(0),{code:'DISPOSED'});
  } finally {scheduler.dispose();globalThis.MessageChannel=Native;}
});
