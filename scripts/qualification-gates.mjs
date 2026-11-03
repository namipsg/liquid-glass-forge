import { ADMISSION } from '../spikes/phase-1/admission.mjs';
const sameArtifacts=(a,b)=>a?.length===b?.length&&a.every(item=>b.some(other=>other.name===item.name&&other.sha256===item.sha256));
const finite=value=>Number.isFinite(value)&&value>=0;
const p95=values=>values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
export function candidatePackageVersion(manifests) {
  const expected=['core','cpu','dom','webgl','react','vue','angular'].map(n=>'@liquid-glass-forge/'+n);
  if(manifests.length!==7||new Set(manifests.map(m=>m.name)).size!==7||manifests.some(m=>!expected.includes(m.name)))throw Error('Unexpected candidate package set');
  const version=manifests[0].version;
  if(manifests.some(m=>m.version!==version))throw Error('Mixed candidate versions');
  if(version==='0.0.0-dev'&&manifests.every(m=>m.private===true))return version;
  if(/^\d+\.\d+\.\d+-rc\.(0|[1-9]\d*)$/.test(version)&&manifests.every(m=>m.private===false))return version;
  throw Error('Expected a private development set or explicit synchronized public release candidate');
}
export function assertFrozenPlan(plan) {
  for(const backend of ['cpu','webgl'])for(const [key,value]of Object.entries(ADMISSION[backend])) {
    const configured=plan[backend]?.[key];
    // JSON's 35/17.5 spellings can be one IEEE-754 ULP stricter than the
    // original rate expression. Never accept a larger budget or real change.
    if(configured!==value&&!(finite(configured)&&configured<=value&&value-configured<=Number.EPSILON*Math.max(1,Math.abs(value))))throw Error('Changed original '+backend+'.'+key+' limit');
  }
  if(!Number.isSafeInteger(plan.soakMinimumMs)||plan.soakMinimumMs<1800000||!Number.isSafeInteger(plan.lifecycleCycles)||plan.lifecycleCycles<100)throw Error('Reduced or missing lifecycle/soak requirement');
  for(const [key,expected]of [['requiredAdapters',['vanilla','react','vue','angular']],['requiredBackends',['cpu','worker','webgl']]])if(!Array.isArray(plan[key])||plan[key].length!==expected.length||expected.some(value=>!plan[key].includes(value)))throw Error('Reduced '+key+' matrix');
  for(const id of ['mac-chrome-m4','mac-safari-m4','android-a04s','iphone','ipad','additional-desktop-gpu'])if(!plan.requiredEnvironments?.some(e=>e.id===id&&e.physical===true))throw Error('Missing physical environment '+id);
}
export function originalBenchmarkPass(run,backend,plan) {
  const limit=plan[backend],frames=run?.rawFrames;
  if(!Array.isArray(frames)||frames.length!==90||run.frames!==90||run.warmup!==15||run.width!==limit.width||run.height!==limit.height||run.source?.width!==640||run.source?.height!==360||run.environment?.visibility!=='visible'||!finite(run.accountedImageBytes)||run.accountedImageBytes>limit.bytes)return false;
  if(backend==='cpu') {
    if(!frames.every((f,i)=>f.frame===i&&f.optics?.radius===36&&f.optics.bevel===30&&f.optics.strength===12+((i+15)%20)/5))return false;
    return ['batchMs','intervalMs','completionAgeMs'].every(key=>frames.every(f=>finite(f[key])))&&p95(frames.map(f=>f.batchMs))<=limit.batchMs&&p95(frames.map(f=>f.intervalMs))<=limit.intervalMs&&p95(frames.map(f=>f.completionAgeMs))<=limit.ageMs;
  }
  if(run.count!==4||run.fullyOnScreen!==true||!frames.every((f,i)=>f.optics?.length===4&&f.optics.every((s,j)=>s.width===640&&s.height===360&&s.radius===72&&s.bevel===60&&s.strength===12+((i+15+j)%20)/5)))return false;
  return ['batchMs','intervalMs','completionAgeMs'].every(key=>frames.every(f=>finite(f[key])))&&p95(frames.map(f=>f.batchMs))<=limit.batchMs&&p95(frames.map(f=>f.intervalMs))<=limit.intervalMs&&p95(frames.map(f=>f.completionAgeMs))<=limit.ageMs;
}
export function deviceGates(receipt,environment,plan,artifacts) {
  const reasons=[];
  if(!environment.device)reasons.push('Required physical identity is not supplied');
  if(!receipt)return [...reasons,'No physical device receipt'];
  if(receipt.environment!==environment.id||receipt.diagnostic!==false||receipt.completed!==true)reasons.push('Incomplete, diagnostic or wrong environment');
  if(receipt.sourceBindingsValid===false)reasons.push('Device producer/source fingerprints changed');
  if(!sameArtifacts(receipt.artifacts,artifacts))reasons.push('Installed artifacts differ from candidate');
  if(environment.id.startsWith('mac-')&&(receipt.host?.model!=='Mac16,10'||receipt.host?.chip!=='Apple M4'))reasons.push('Named desktop hardware not verified');
  if(environment.id==='android-a04s'&&receipt.device?.model!=='SM-A047F')reasons.push('Physical Android identity not verified');
  if(environment.id==='iphone'&&receipt.capabilities?.platformName?.toLowerCase()!=='ios')reasons.push('Physical iOS session not verified');
  for(const adapter of plan.requiredAdapters)for(const backend of plan.requiredBackends) {
    const check=receipt.checks?.find(c=>c.adapter===adapter&&c.backend===backend);
    if(!check?.pass||check.lifecycleCycles<plan.lifecycleCycles||check.native?.visibility!=='visible'||check.diagnostics?.effectiveBackend!==(backend==='webgl'?'webgl':'cpu')||(backend==='worker'&&check.diagnostics?.cpu?.execution!=='worker'))reasons.push(adapter+'/'+backend+' physical lifecycle evidence missing');
    if(backend==='webgl'&&(!check?.gpuIdentity?.renderer||/swiftshader|llvmpipe|software/i.test(check.gpuIdentity.renderer)))reasons.push(adapter+' named hardware GPU is not verified');
  }
  const benchmarks=receipt.benchmarks??[];
  for(const execution of ['off','required'])for(const repeat of [1,2])if(!originalBenchmarkPass(benchmarks.find(b=>b.backend==='cpu'&&b.execution===execution&&b.repeat===repeat),'cpu',plan))reasons.push('Original CPU '+execution+'/'+repeat+' admission missing or failing');
  for(const repeat of [1,2])if(!originalBenchmarkPass(benchmarks.find(b=>b.backend==='webgl'&&b.repeat===repeat),'webgl',plan))reasons.push('Original GPU '+repeat+' admission missing or failing');
  if(!receipt.cpuConformance?.pass||!receipt.gpuConformance?.pass||receipt.pageErrors?.length)reasons.push('Conformance or page-error gate is incomplete');
  return [...new Set(reasons)];
}
export function soakGates(receipt,backend,plan,artifacts) {
  const reasons=[];
  if(!receipt)return ['No full-duration '+backend+' soak receipt'];
  if(receipt.backend!==backend||receipt.diagnostic!==false||receipt.completed!==true||!finite(receipt.elapsedMs)||!finite(receipt.hostElapsedMs)||receipt.elapsedMs<plan.soakMinimumMs||receipt.hostElapsedMs<plan.soakMinimumMs)reasons.push('Short, diagnostic, incomplete or wrong-backend soak');
  if(receipt.sourceBindingsValid===false)reasons.push('Soak producer/source fingerprints changed');
  if(!sameArtifacts(receipt.artifacts,artifacts))reasons.push('Soak artifacts differ from candidate');
  if(receipt.errors?.length||receipt.error)reasons.push('Soak has runtime errors');
  const limit=backend==='webgl'?plan.webgl:plan.cpu;
  for(const adapter of plan.requiredAdapters) {
    const summary=receipt.summary?.[adapter],cleanup=receipt.cleanup?.find(c=>c.adapter===adapter);
    if(!summary||summary.frames<90||!finite(summary.ageP95Ms)||summary.ageP95Ms>limit.ageMs||!finite(summary.intervalP95Ms)||summary.intervalP95Ms>limit.intervalMs||!finite(summary.knownImageBytesMax)||summary.knownImageBytesMax>limit.bytes)reasons.push(adapter+' soak budgets missing or failing');
    if(!receipt.cycles?.some(c=>c.backend===backend&&c.count>=plan.lifecycleCycles&&c.adapters?.includes(adapter)))reasons.push(adapter+' 100-cycle evidence missing');
    if(!cleanup||cleanup.active||cleanup.subscriptions||cleanup.workers||cleanup.leased)reasons.push(adapter+' cleanup not proven');
    if(!receipt.samples?.length||receipt.samples.some(s=>{const a=s.adapters?.find(a=>a.adapter===adapter);return !a||a.visibility!=='visible'||a.active!==1||a.subscriptions!==1||a.errors?.length||a.targets?.length!==limit.count||a.targets.some(t=>t.width!==limit.width||t.height!==limit.height);}))reasons.push(adapter+' soak visibility/workload geometry not proven');
  }
  return [...new Set(reasons)];
}
export function qualificationMatrix(plan,candidate,devices,soaks,visualRows=[]) {
  assertFrozenPlan(plan);
  const environments=plan.requiredEnvironments.map(environment=>{
    const device=devices.find(r=>r.environment===environment.id);
    const reasons=deviceGates(device,environment,plan,candidate.artifacts);
    const visualReasons=[];
    for(const adapter of plan.requiredAdapters)for(const backend of plan.requiredBackends) {
      const row=visualRows.find(r=>r.environment===environment.id&&r.adapter===adapter&&r.backend===backend);
      if(!row||row.status!=='reviewed-capture'||row.reasons?.length||!row.sha256)visualReasons.push(adapter+'/'+backend+' visual evidence missing or rejected');
    }
    const backends=plan.requiredBackends.map(backend=>({backend,reasons:soakGates(soaks.find(s=>s.environmentId===environment.id&&s.backend===backend),backend,plan,candidate.artifacts)}));
    return {...environment,status:reasons.length||visualReasons.length||backends.some(b=>b.reasons.length)?'held':'qualified',reasons,visualReasons,soaks:backends};
  });
  return {schemaVersion:1,status:environments.every(e=>e.status==='qualified')?'qualified-beta-candidate':'hold',betaFrozen:environments.every(e=>e.status==='qualified'),environments};
}
