import test from 'node:test';import assert from'node:assert/strict';import{createSource,createFrame}from'../packages/core/dist/index.js';import{CpuBatchSession}from'../packages/cpu/dist/protocol.js';import{CpuExecutor}from'../packages/cpu/dist/index.js';
const source=(revision,color)=>createSource({contractVersion:1,width:1,height:1,revision,data:new Uint8Array([color,0,0,255]),ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'});const frame=(s,generation=0)=>createFrame({contractVersion:1,generation,revision:s.revision,sourceRevision:s.revision,surfaces:[{id:'x',width:1,height:1,radius:0,strength:0}]},s);
test('one prepared source per session obeys revision/generation, retains owned pixels and disposes',()=>{const c=new CpuBatchSession();const run=(s,g=0)=>c.run({type:'render',id:0,source:s,frame:frame(s,g),outputs:[new Uint8ClampedArray(4)]});const a=source(0,200);assert.equal(run(a).surfaces[0].data[0],200);a.data[0]=50;assert.equal(run(a).surfaces[0].data[0],200,'unchanged logical revision reuses owned preparation');assert.equal(run(source(1,50)).surfaces[0].data[0],50);assert.equal(run(source(0,90),1).surfaces[0].data[0],90);assert.equal(c.storageBytes,16);c.dispose();c.dispose();assert.equal(c.storageBytes,0);});
test('executor cache is opt-in and releases retained storage and outstanding leases',async()=>{const e=new CpuExecutor({worker:'off',cacheSources:true}),s=source(0,160);const a=await e.render(s,frame(s));assert.equal(a.surfaces[0].data[0],160);assert.equal(e.diagnostics.mainCachedBytes,16);assert.equal(s.data.byteLength,4);a.release();await new Promise(r=>setTimeout(r,0));const b=await e.render(source(1,80),frame(source(1,80)));assert.equal(b.surfaces[0].data[0],80);e.dispose();assert.equal(e.diagnostics.mainCachedBytes,0);b.release();assert.equal(e.diagnostics.leasedBytes,0);});

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
class CachedWorker {
  onmessage = null; onerror = null; onmessageerror = null;
  session = new CpuBatchSession(); calls = []; terminated = 0;
  postMessage(work, transfer) { this.calls.push(structuredClone(work, { transfer })); }
  finish(index = this.calls.length - 1, patch = message => message) {
    const work = this.calls[index], result = this.session.run(work);
    const message = patch({ type: 'result', id: work.id, result, returnedInput: work.source.data });
    this.onmessage?.({ data: structuredClone(message, { transfer: [work.source.data.buffer, ...result.surfaces.map(s => s.data.buffer)] }) });
  }
  terminate() { this.terminated++; this.session.dispose(); }
}
class ReturningWorker extends CachedWorker {
  finish(index = this.calls.length - 1, patch = message => message) {
    const work = this.calls[index], result = this.session.run(work);
    const message = patch({ type:'result', id:work.id, result, returnedInput:work.source.data });
    this.onmessage?.({data:structuredClone(message, {transfer:[work.source.data.buffer, ...result.surfaces.map(s=>s.data.buffer)]})});
  }
}
const effects = { model: 'rounded-material-v1', blurRadius: 1 };
const request = async (executor, worker, s, options) => {
  const promise = executor.render(s, frame(s), options); await tick(); worker.finish(); return promise;
};

test('executor bulk snapshots both byte brands and offset views before yielding', async () => {
  for (const Type of [Uint8Array, Uint8ClampedArray]) {
    const backing = new Type([99, 98, 0, 128, 255, 255, 97, 96]);
    const pixels = backing.subarray(2, 6), before = backing.slice();
    const s = createSource({ contractVersion: 1, width: 1, height: 1, revision: 0, data: pixels, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
    const executor = new CpuExecutor({ worker: 'off', cacheSources: true });
    const pending = executor.render(s, frame(s)); pixels.fill(1);
    const batch = await pending;
    assert.deepEqual([...batch.surfaces[0].data], [0, 128, 255, 255]);
    assert.equal(backing.buffer.byteLength, 8); assert.deepEqual([...backing.subarray(0, 2)], [...before.subarray(0, 2)]);
    assert.deepEqual([...backing.subarray(6)], [...before.subarray(6)]);
    batch.release(); executor.dispose();
  }
});

test('cached worker retains blur across a baseline request and invalidates source revision/generation', async () => {
  const worker = new CachedWorker(), executor = new CpuExecutor({ worker: 'required', cacheSources: true, workerFactory: () => worker });
  const first = source(0, 190), original = first.data.slice();
  let batch = await request(executor, worker, first, { effects }); batch.release(); await tick();
  assert.equal(executor.diagnostics.workerCachedBytes, 48);
  batch = await request(executor, worker, first); assert.equal(batch.surfaces[0].data[0], 190); batch.release(); await tick();
  assert.equal(executor.diagnostics.workerCachedBytes, 48, 'blur arrays remain owned and charged');
  batch = await request(executor, worker, source(1, 70)); assert.equal(batch.surfaces[0].data[0], 70); batch.release(); await tick();
  assert.equal(executor.diagnostics.workerCachedBytes, 16, 'new revision drops old blur/source');
  const replacement = source(0, 110), promise = executor.render(replacement, frame(replacement, 1)); await tick(); worker.finish();
  batch = await promise; assert.equal(batch.surfaces[0].data[0], 110); batch.release(); await tick();
  assert.deepEqual(first.data, original); assert.equal(first.data.byteLength, 4);
  executor.dispose(); assert.equal(worker.session.storageBytes, 0); assert.equal(executor.diagnostics.workerCachedBytes, 0);
});

test('cached worker rejects absent, undersized and malformed retained-storage reports', async () => {
  for (const retainedBytes of [undefined, 0, -1, NaN, 1.5, 1e9]) {
    const worker = new CachedWorker(), executor = new CpuExecutor({ worker: 'required', cacheSources: true, workerFactory: () => worker });
    const s = source(0, 150), promise = executor.render(s, frame(s)); await tick();
    worker.finish(0, message => ({ ...message, result: { ...message.result, retainedBytes } }));
    await assert.rejects(promise, { code: 'WORKER_PROTOCOL' }); await tick();
    assert.equal(executor.diagnostics.workerCachedBytes, 0); assert.equal(executor.diagnostics.reservedBytes, 0);
    assert.equal(worker.terminated, 1); executor.dispose();
  }
});

test('populated cached worker failure falls back to current borrowed snapshot and conservatively records abandoned storage', async () => {
  const worker = new CachedWorker(), executor = new CpuExecutor({ cacheSources: true, workerFactory: () => worker });
  const first = source(0, 200); const held = await request(executor, worker, first); await tick();
  const retained = executor.diagnostics.workerCachedBytes;
  const next = source(1, 60), promise = executor.render(next, frame(next)); next.data.fill(0); await tick();
  const submitted = worker.calls[1], late = worker.onmessage;
  assert.equal(submitted.source.data[0], 60, 'snapshot happened before await');
  const reserved = executor.diagnostics.reservedBytes;
  worker.onerror({ preventDefault() {} });
  const batch = await promise; await tick(); assert.equal(batch.surfaces[0].data[0], 60);
  assert.equal(executor.diagnostics.execution, 'main'); assert.equal(executor.diagnostics.workerCachedBytes, 0);
  assert.equal(executor.diagnostics.mainCachedBytes, 16);
  assert.ok(executor.diagnostics.lostBytes >= retained + reserved - next.data.byteLength);
  late?.({ data: { type: 'result', id: -1 } });
  executor.dispose(); assert.equal(executor.diagnostics.leasedBytes, 8, 'dispose preserves outstanding output lease accounting');
  held.release(); batch.release(); assert.equal(executor.diagnostics.leasedBytes, 0); assert.equal(executor.diagnostics.mainCachedBytes, 0);
});

test('cached abort, supersession, pending cancellation and late disposal cannot revive older pixels', async () => {
  const worker = new CachedWorker(), executor = new CpuExecutor({ worker: 'required', cacheSources: true, workerFactory: () => worker });
  let batch = await request(executor, worker, source(0, 180)); batch.release(); await tick();
  const abort = new AbortController(), s = source(1, 80), a = executor.render(s, frame(s), { signal: abort.signal }); await tick(); abort.abort();
  await assert.rejects(a, { code: 'ABORTED' });
  const superseded = source(2, 40), b = executor.render(superseded, frame(superseded));
  const latest = source(3, 30), c = executor.render(latest, frame(latest)); await assert.rejects(b, { code: 'SUPERSEDED' });
  worker.finish(1); await tick(); worker.finish(2); batch = await c;
  assert.equal(batch.surfaces[0].data[0], 30); batch.release(); await tick();
  await assert.rejects(executor.render(s, frame(s)), { code: 'STALE' });
  const stop = new AbortController(), d = executor.render(source(4, 20), frame(source(4, 20)), { signal: stop.signal }); await tick();
  const pendingStop = new AbortController(), e = executor.render(source(5, 10), frame(source(5, 10)), { signal: pendingStop.signal });
  await assert.rejects(d, { code: 'SUPERSEDED' }); pendingStop.abort(); await assert.rejects(e, { code: 'ABORTED' });
  const late = worker.onmessage; executor.dispose(); late?.({ data: { type: 'result', id: -1 } }); await tick();
  assert.equal(executor.diagnostics.reservedBytes, 0); assert.equal(executor.diagnostics.workerCachedBytes, 0);
  assert.equal(executor.diagnostics.pending, 0); assert.equal(worker.session.storageBytes, 0);
});

test('retained source, blur, geometry and leases count against the cached executor allocation limit', async () => {
  const { CPU_LOOKUP_BYTES, CPU_GEOMETRY_MAX_BYTES } = await import('../packages/cpu/dist/index.js');
  const bytes = new Uint8Array(64 * 64 * 4); bytes.fill(255);
  const s = createSource({ contractVersion: 1, width: 64, height: 64, revision: 0, data: bytes, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
  const f = createFrame({ contractVersion: 1, generation: 0, revision: 0, sourceRevision: 0, surfaces: [{ id: 'large', width: 64, height: 64, radius: 12, bevel: 6, strength: 3 }] }, s);
  const limit = CPU_LOOKUP_BYTES + bytes.byteLength * 6 + CPU_GEOMETRY_MAX_BYTES;
  const executor = new CpuExecutor({ worker: 'off', cacheSources: true, maxOwnedBytes: limit });
  const held = await executor.render(s, f); await tick();
  assert.ok(executor.diagnostics.mainCachedBytes > bytes.byteLength * 4, 'prepared geometry is retained');
  await assert.rejects(executor.render(s, f), { code: 'BUDGET' });
  executor.dispose(); held.release(); assert.equal(executor.diagnostics.leasedBytes, 0);
  const uncached = new CpuExecutor({ worker: 'off' }); const out = await uncached.render(source(0, 100), frame(source(0, 100))); out.release();
  assert.equal(uncached.diagnostics.mainCachedBytes, 0); uncached.dispose();
});

test('required and auto input buffers share pool limits with outputs and snapshot fresh pixels before await', async () => {
  for (const mode of ['required', 'auto']) {
  const worker = new ReturningWorker(), executor = new CpuExecutor({worker:mode,cacheSources:true,workerFactory:()=>worker,maxPoolBytes:8});
  for (let revision=0;revision<4;revision++) {
    const s=source(revision, 30+revision*40), expected=s.data.slice(), pending=executor.render(s,frame(s));
    s.data.fill(0); await tick();
    assert.deepEqual([...worker.calls[revision].source.data], [...expected]);
    assert.equal(executor.diagnostics.inputPooledBytes, 0, 'pooled input is exclusively leased to the in-flight copy');
    worker.finish();const batch=await pending; await tick();
    assert.equal(batch.surfaces[0].data[0],expected[0]);assert.equal(s.data.byteLength,4);
    const inputs = mode === 'required' ? 1 : 2;
    assert.equal(executor.diagnostics.inputPooledBytes,4*inputs);assert.equal(executor.diagnostics.inputPooledBuffers,inputs);assert.ok(executor.diagnostics.pooledBytes<=8);
    batch.release();assert.ok(executor.diagnostics.pooledBytes<=8);
  }
  executor.dispose();assert.equal(executor.diagnostics.inputPooledBytes,0);assert.equal(executor.diagnostics.pooledBytes,0);
  }
});

test('returned input cannot alias output or have invalid storage, and a valid late reply cannot revive disposed state', async () => {
  for (const mode of ['wrong-size','output-alias']) {
    const worker=new ReturningWorker(),executor=new CpuExecutor({worker:'required',workerFactory:()=>worker,cacheSources:true}),s=source(0,140);
    const promise=executor.render(s,frame(s));await tick();
    worker.finish(0,message=>({...message,returnedInput:mode==='wrong-size'?new Uint8Array(3):new Uint8Array(message.result.surfaces[0].data.buffer)}));
    await assert.rejects(promise,{code:'WORKER_PROTOCOL'});await tick();
    assert.equal(worker.terminated,1);assert.equal(executor.diagnostics.workerCachedBytes,0);executor.dispose();assert.equal(executor.diagnostics.inputPooledBytes,0);
  }
  const worker=new ReturningWorker(),executor=new CpuExecutor({worker:'required',workerFactory:()=>worker,cacheSources:true}),s=source(0,150);
  const promise=executor.render(s,frame(s));await tick();
  const work=worker.calls[0],result=worker.session.run(work),late=worker.onmessage;
  const message=structuredClone({type:'result',id:work.id,result,returnedInput:work.source.data},{transfer:[work.source.data.buffer,...result.surfaces.map(s=>s.data.buffer)]});
  executor.dispose();await assert.rejects(promise,{code:'DISPOSED'});await tick();late({data:message});await tick();
  assert.equal(executor.diagnostics.workerCachedBytes,0);assert.equal(executor.diagnostics.inputPooledBytes,0);assert.equal(executor.diagnostics.pooledBytes,0);
  assert.equal(executor.diagnostics.completedBatches,0);assert.equal(executor.diagnostics.reservedBytes,0);
});

test('a duplicate worker reply cannot add the same returned input twice or detach a later snapshot', async () => {
  const worker=new ReturningWorker(),executor=new CpuExecutor({worker:'required',workerFactory:()=>worker,cacheSources:true,maxPoolBytes:64});
  const s=source(0,170),promise=executor.render(s,frame(s));await tick();
  const work=worker.calls[0],result=worker.session.run(work),receive=worker.onmessage;
  const message=structuredClone({type:'result',id:work.id,result,returnedInput:work.source.data},{transfer:[work.source.data.buffer,...result.surfaces.map(s=>s.data.buffer)]});
  receive({data:message});receive({data:message});const batch=await promise;batch.release();await tick();
  assert.equal(executor.diagnostics.inputPooledBuffers,1);assert.equal(executor.diagnostics.inputPooledBytes,4);
  const current=source(1,60),pending=executor.render(current,frame(current));await tick();worker.finish();
  const next=await pending;assert.equal(next.surfaces[0].data[0],60);assert.equal(current.data.byteLength,4);
  next.release();executor.dispose();assert.equal(executor.diagnostics.pooledBytes,0);
});
