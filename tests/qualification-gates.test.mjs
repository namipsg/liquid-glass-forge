import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';
import {assertFrozenPlan,originalBenchmarkPass,soakGates,qualificationMatrix}from'../scripts/qualification-gates.mjs';
const plan=JSON.parse(await readFile('docs/qualification-plan.json')),artifacts=[{name:'core',sha256:'exact'}];
const run=()=>({backend:'cpu',execution:'required',repeat:1,width:320,height:180,source:{width:640,height:360},frames:90,warmup:15,environment:{visibility:'visible'},accountedImageBytes:8000000,rawFrames:Array.from({length:90},(_,i)=>({frame:i,optics:{radius:36,bevel:30,strength:12+((i+15)%20)/5},batchMs:30,intervalMs:34,completionAgeMs:34}))});
const soak=()=>({backend:'worker',diagnostic:false,completed:true,elapsedMs:1800001,hostElapsedMs:1800002,artifacts,errors:[],cycles:[{backend:'worker',count:100,adapters:plan.requiredAdapters}],summary:Object.fromEntries(plan.requiredAdapters.map(a=>[a,{frames:52000,ageP95Ms:34,intervalP95Ms:34,knownImageBytesMax:8300000}])),cleanup:plan.requiredAdapters.map(adapter=>({adapter,active:0,subscriptions:0,workers:0,leased:0})),samples:[{adapters:plan.requiredAdapters.map(adapter=>({adapter,visibility:'visible',active:1,subscriptions:1,errors:[],targets:[{width:320,height:180}]}))}]});
test('original budgets and full reference workload remain binding',()=>{assertFrozenPlan(plan);assert.equal(originalBenchmarkPass(run(),'cpu',plan),true);for(const mutate of [r=>r.source.width=1,r=>r.frames=24,r=>r.rawFrames[0].optics.strength=0,r=>r.rawFrames.forEach(f=>f.intervalMs=35.1),r=>r.environment.visibility='hidden']){const r=run();mutate(r);assert.equal(originalBenchmarkPass(r,'cpu',plan),false)}});
test('cannot reduce the original limits or replace 30 minutes by a short test',()=>{for(const mutate of [p=>p.cpu.intervalMs=36,p=>p.soakMinimumMs=10000,p=>p.lifecycleCycles=5]){const p=structuredClone(plan);mutate(p);assert.throws(()=>assertFrozenPlan(p));}});
test('complete correctly scoped soak satisfies the gate without trusting its pass flag',()=>{assert.deepEqual(soakGates(soak(),'worker',plan,artifacts),[])});
test('diagnostic, short duration, stale artifacts and 99 cycles remain incomplete',()=>{for(const mutate of [r=>r.diagnostic=true,r=>r.elapsedMs=1799999,r=>r.hostElapsedMs=1799999,r=>r.artifacts=[],r=>r.cycles[0].count=99]){const r=soak();r.pass=true;mutate(r);assert.ok(soakGates(r,'worker',plan,artifacts).length)}});
test('hidden, undersized and leaking runs cannot pass with a reported green flag',()=>{for(const mutate of [r=>r.samples[0].adapters[0].visibility='hidden',r=>r.samples[0].adapters[0].targets[0].width=160,r=>r.cleanup[0].workers=1,r=>r.summary.vanilla.intervalP95Ms=35.01]){const r=soak();r.pass=true;mutate(r);assert.ok(soakGates(r,'worker',plan,artifacts).length)}});
test('one valid worker campaign cannot qualify CPU/GPU or substitute for missing physical devices',()=>{const s=soak();s.environmentId='mac-chrome-m4';const result=qualificationMatrix(plan,{artifacts},[],[s]);assert.equal(result.status,'hold');assert.equal(result.betaFrozen,false);assert.equal(result.environments.find(e=>e.id==='ipad').status,'held');assert.ok(soakGates(s,'webgl',plan,artifacts).length)});
test('missing durations or an emptied required matrix cannot create a green beta',()=>{for(const mutate of [r=>delete r.elapsedMs,r=>delete r.hostElapsedMs,r=>delete r.diagnostic]){const r=soak();mutate(r);assert.ok(soakGates(r,'worker',plan,artifacts).length)}for(const mutate of [p=>delete p.soakMinimumMs,p=>p.requiredAdapters=[],p=>p.requiredBackends=['cpu'],p=>p.requiredEnvironments=p.requiredEnvironments.filter(e=>e.id!=='ipad')]){const p=structuredClone(plan);mutate(p);assert.throws(()=>assertFrozenPlan(p))}});

function completeMatrix() {
  const p=structuredClone(plan);
  for(const e of p.requiredEnvironments) e.device ||= 'explicitly supplied test hardware';
  const gpu=()=>({backend:'webgl',count:4,width:640,height:360,source:{width:640,height:360},frames:90,warmup:15,environment:{visibility:'visible'},fullyOnScreen:true,accountedImageBytes:16000000,
    rawFrames:Array.from({length:90},(_,i)=>({batchMs:10,intervalMs:16,completionAgeMs:10,optics:Array.from({length:4},(_,j)=>({width:640,height:360,radius:72,bevel:60,strength:12+((i+15+j)%20)/5}))}))});
  const devices=p.requiredEnvironments.map(e=>({environment:e.id,diagnostic:false,completed:true,sourceBindingsValid:true,artifacts,
    host:{model:'Mac16,10',chip:'Apple M4'},device:{model:'SM-A047F'},capabilities:{platformName:'iOS'},
    checks:p.requiredAdapters.flatMap(adapter=>p.requiredBackends.map(backend=>({adapter,backend,pass:true,lifecycleCycles:100,native:{visibility:'visible'},diagnostics:{effectiveBackend:backend==='webgl'?'webgl':'cpu',cpu:{execution:'worker'}},gpuIdentity:{renderer:'named hardware GPU'}}))),
    benchmarks:[...['off','required'].flatMap(execution=>[1,2].map(repeat=>({...run(),execution,repeat}))),...[1,2].map(repeat=>({...gpu(),repeat}))],cpuConformance:{pass:true},gpuConformance:{pass:true},pageErrors:[]}));
  const soaks=p.requiredEnvironments.flatMap(e=>p.requiredBackends.map(backend=>{
    const s=soak();s.environmentId=e.id;s.backend=backend;s.cycles[0].backend=backend;
    if(backend==='webgl')for(const a of p.requiredAdapters){s.summary[a].ageP95Ms=10;s.summary[a].intervalP95Ms=16;s.summary[a].knownImageBytesMax=16000000;s.samples[0].adapters.find(r=>r.adapter===a).targets=Array.from({length:4},()=>({width:640,height:360}));}
    return s;
  }));
  const visuals=p.requiredEnvironments.flatMap(e=>p.requiredAdapters.flatMap(adapter=>p.requiredBackends.map(backend=>({environment:e.id,adapter,backend,status:'reviewed-capture',sha256:'exact-image',reasons:[]}))));
  return {p,devices,soaks,visuals};
}
test('only the complete required physical, admission, visual and soak matrix permits beta freeze',()=>{
  const {p,devices,soaks,visuals}=completeMatrix();
  assert.equal(qualificationMatrix(p,{artifacts},devices,soaks,visuals).betaFrozen,true);
  assert.equal(qualificationMatrix(p,{artifacts},devices,soaks,visuals.slice(1)).betaFrozen,false);
  visuals[0].status='held';assert.equal(qualificationMatrix(p,{artifacts},devices,soaks,visuals).betaFrozen,false);
});
test('a producer flag cannot hide failing admission or software GPU identity',()=>{
  for(const mutate of [d=>d.benchmarks[0].rawFrames.forEach(f=>f.batchMs=34),d=>d.checks.find(c=>c.backend==='webgl').gpuIdentity.renderer='SwiftShader',d=>d.sourceBindingsValid=false,d=>d.artifacts=[]]) {
    const {p,devices,soaks,visuals}=completeMatrix();devices[0].pass=true;mutate(devices[0]);
    assert.equal(qualificationMatrix(p,{artifacts},devices,soaks,visuals).betaFrozen,false);
  }
});
