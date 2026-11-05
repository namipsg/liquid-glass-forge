import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {qualificationServer} from '../tests/qualification-server.mjs';
import {assertFrozenPlan,deviceGates,soakGates,originalBenchmarkPass} from './qualification-gates.mjs';

const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
for(const flag of ['--candidate','--address','--remote-address','--identity'])if(!args.includes(flag))throw Error(flag+' required');
const candidatePath=path.resolve(value('--candidate')),candidate=JSON.parse(await readFile(candidatePath));
if(candidate.prepared!==true)throw Error('Prepared physical tarballs required');
const planPath=args.includes('--plan')?value('--plan'):'docs/qualification-plan.json';
const planBytes=await readFile(planPath),plan=JSON.parse(planBytes);assertFrozenPlan(plan);
const identityPath=path.resolve(value('--identity')),identity=JSON.parse(await readFile(identityPath));
const diagnostic=args.includes('--smoke'),environment='additional-desktop-gpu';
if(identity.remoteHost!==value('--remote-address')||!identity.browser||!identity.os)throw Error('Exact observed remote identity required');
await mkdir('private/phase-11/devices',{recursive:true});await mkdir('private/phase-11/soak',{recursive:true});
const dir=await mkdtemp(path.resolve('private/phase-11/devices/windows-'));
const sha=b=>createHash('sha256').update(b).digest('hex'),sourceSha256={};
for(const file of ['scripts/qualify-remote.mjs','scripts/operate-windows-qualification.mjs','tests/qualification-server.mjs','tests/remote-qualification.mjs','tests/qualification-bench.mjs','tests/qualification-controller.mjs',planPath,...Object.keys(candidate.sourceSha256)])sourceSha256[file]=sha(await readFile(file));
const adjudicatorSha256=sha(await readFile('scripts/qualification-gates.mjs'));
const receipt={adjudicatorSha256,startedAt:new Date().toISOString(),environment,diagnostic,candidate:candidatePath,artifacts:candidate.artifacts,sourceSha256,planSha256:sha(planBytes),settingsChanged:false,identity:{...identity,sha256:sha(await readFile(identityPath))},checks:[],benchmarks:[],pageErrors:[],completed:false,pass:false};
const token=randomBytes(16).toString('hex'),base='/session/'+token;
const staticServer=await qualificationServer(path.resolve(candidate.reviewAssets));
let serial=0,checkpoint=0,soak,lastEvent,finished=false;
const save=()=>writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
async function event(kind,payload){
  lastEvent={kind,payload,at:new Date().toISOString()};
  if(['native','capture','soak-capture'].includes(kind)){
    checkpoint++;await writeFile(path.join(dir,'checkpoint.json'),JSON.stringify({checkpoint,...lastEvent},null,2));return {checkpoint};
  }
  if(kind==='identity')receipt.browser=payload;
  else if(kind==='page-error')receipt.pageErrors.push(payload.message);
  else if(kind==='device-check')receipt.checks.push(payload);
  else if(kind==='cpuConformance'||kind==='gpuConformance')receipt[kind]=payload;
  else if(kind==='benchmark'){
    payload.budgetPass=originalBenchmarkPass(payload,payload.backend,plan);receipt.benchmarks.push(payload);
    console.log(JSON.stringify({kind,backend:payload.backend,execution:payload.execution,repeat:payload.repeat,pass:payload.budgetPass}));
  }else if(kind==='device-complete'){
    receipt.completed=true;
    const env={id:environment,physical:true,device:identity.remoteHost+' / NVIDIA RTX 3050'};
    receipt.reasons=deviceGates(receipt,env,plan,candidate.artifacts);
    // A new collector must prove the native input itself, not only its result.
    if(receipt.checks.some(c=>!(c.native.trusted.input>0)||c.native.trusted.click!==1))receipt.reasons.push('Untrusted native input');
    receipt.pass=!diagnostic&&!receipt.reasons.length;receipt.endedAt=new Date().toISOString();
    // Independent valid CPU/worker campaigns can proceed while GPU cadence is
    // held. The complete device/release gate remains failed until all pass.
    const controls=receipt.checks.length===12&&receipt.checks.every(c=>c.pass&&c.lifecycleCycles>=plan.lifecycleCycles&&c.native.trusted.input>0&&c.native.trusted.click===1)&&receipt.cpuConformance?.pass&&receipt.gpuConformance?.pass&&!receipt.pageErrors.length;
    receipt.backendPass=Object.fromEntries(plan.requiredBackends.map(b=>[b,controls&&[1,2].every(repeat=>receipt.benchmarks.some(r=>r.repeat===repeat&&r.budgetPass&&(b==='webgl'?r.backend==='webgl':r.backend==='cpu'&&r.execution===(b==='worker'?'required':'off'))))]));
    await save();return {pass:receipt.pass,backendPass:receipt.backendPass};
  }else if(kind==='soak-begin'){
    if(soak)throw Error('Overlapping remote campaigns');
    const soakDir=await mkdtemp(path.resolve('private/phase-11/soak/windows-'+payload.backend+'-'));
    const gzip=createGzip(),output=createWriteStream(path.join(soakDir,'frames.ndjson.gz'));gzip.pipe(output);
    const r={adjudicatorSha256,startedAt:new Date().toISOString(),environment:'native Windows Chrome over authorized RDP',environmentId:environment,backend:payload.backend,diagnostic,candidate:candidatePath,artifacts:candidate.artifacts,sourceSha256,planSha256:sha(planBytes),identity:receipt.identity,requiredDurationMs:plan.soakMinimumMs,requestedDurationMs:diagnostic?12000:plan.soakMinimumMs,cycles:[payload.cycles],samples:[],summary:{},errors:[],completed:false,pass:false};
    soak={dir:soakDir,r,gzip,output,start:process.hrtime.bigint(),vectors:new Map(plan.requiredAdapters.map(a=>[a,{age:[],interval:[],frames:0,maxBytes:0}]))};
  }else if(kind==='soak-sample'){
    if(!soak||soak.r.backend!==payload.backend)throw Error('No matching campaign');
    const {sample}=payload,r=soak.r;
    r.elapsedMs=sample.elapsedMs;r.hostElapsedMs=Number(process.hrtime.bigint()-soak.start)/1e6;
    if(sample.visibility!=='visible'||sample.adapters.some(a=>a.visibility!=='visible'))r.errors.push('Hidden soak');
    r.errors.push(...sample.errors);
    for(const adapter of sample.adapters){
      if(adapter.active!==1||adapter.subscriptions!==1||adapter.errors.length)r.errors.push('Lifecycle imbalance '+adapter.adapter);
      const v=soak.vectors.get(adapter.adapter);if(!v)throw Error('Unexpected adapter');
      for(const frame of adapter.frames){
        if(frame.effectiveBackend!==(r.backend==='webgl'?'webgl':'cpu')||(r.backend==='worker'&&frame.execution!=='worker'))r.errors.push('Changed backend');
        v.frames++;if(frame.sequence>=plan.soakWarmupFrames){v.age.push(frame.ageMs);if(frame.intervalMs!==null)v.interval.push(frame.intervalMs);}
        const e=frame.executor,reported=frame.outputBytes+640*360*4*3+(e?e.mainCachedBytes+e.workerCachedBytes+e.fixedKernelReservationBytes+e.pooledBytes+e.leasedBytes+e.reservedBytes:0);
        const canonical=640*360*4*8+320*180*4*3+(r.backend==='worker'?24592:12296)+270000;
        const known=r.backend==='webgl'?frame.gpuOwnedBytes+frame.outputBytes+640*360*4*3:Math.max(reported,canonical);
        v.maxBytes=Math.max(v.maxBytes,known);
        if(!soak.gzip.write(JSON.stringify({adapter:adapter.adapter,...frame,knownImageBytes:known})+'\n'))await once(soak.gzip,'drain');
      }
    }
    r.samples.push({...sample,adapters:sample.adapters.map(({frames,...a})=>a)});
    await writeFile(path.join(soak.dir,'receipt.json'),JSON.stringify(r,null,2)+'\n');
    if(r.samples.length%15===0)console.log(JSON.stringify({backend:r.backend,elapsedMs:Math.round(r.elapsedMs),frames:Object.fromEntries([...soak.vectors].map(([a,v])=>[a,v.frames]))}));
  }else if(kind==='soak-complete'){
    if(!soak||soak.r.backend!==payload.backend)throw Error('No matching campaign');
    const r=soak.r,p95=a=>a.sort((a,b)=>a-b)[Math.ceil(a.length*.95)-1];r.cleanup=payload.cleanup;
    for(const [a,v]of soak.vectors)r.summary[a]={frames:v.frames,ageP95Ms:p95(v.age),intervalP95Ms:p95(v.interval),knownImageBytesMax:v.maxBytes};
    r.completed=true;r.reasons=soakGates(r,r.backend,plan,candidate.artifacts);r.pass=!diagnostic&&!r.reasons.length;r.endedAt=new Date().toISOString();
    soak.gzip.end();await once(soak.output,'close');await writeFile(path.join(soak.dir,'receipt.json'),JSON.stringify(r,null,2)+'\n');
    console.log(JSON.stringify({dir:soak.dir,backend:r.backend,pass:r.pass,reasons:r.reasons}));soak=undefined;
  }else if(kind==='backend-held'){
    (receipt.heldCampaigns??=[]).push(payload);
  }else if(kind==='failure'){
    receipt.error=payload.error;receipt.failure=payload;receipt.pass=false;receipt.endedAt=new Date().toISOString();finished=true;
    if(soak){soak.r.error=payload.error;soak.gzip.end();await once(soak.output,'close');await writeFile(path.join(soak.dir,'receipt.json'),JSON.stringify(soak.r,null,2)+'\n');soak=undefined;}
  }else if(kind==='complete'){finished=true;receipt.campaignsCompleted=true;}
  else throw Error('Unknown protocol event');
  await save();await writeFile(path.join(dir,'status.json'),JSON.stringify({finished,...lastEvent},null,2)+'\n');return {ok:true};
}
const server=createServer((req,res)=>{void(async()=>{
  if(req.socket.remoteAddress!==value('--remote-address')&&!(diagnostic&&req.socket.remoteAddress==='127.0.0.1')){res.writeHead(403).end();return;}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname===base+'/config'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({plan,diagnostic}));return;}
  if(url.pathname.startsWith(base+'/ack/')){
    const n=url.pathname.slice((base+'/ack/').length);if(!/^[1-9]\d*$/.test(n)){res.writeHead(400).end();return;}
    let acknowledged=false;try{await access(path.join(dir,n+'.ack'));acknowledged=true;}catch{}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({acknowledged}));return;
  }
  if(url.pathname===base+'/event'&&req.method==='POST'){
    let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>16*1024*1024)throw Error('Oversized receipt');chunks.push(c);}
    const e=JSON.parse(Buffer.concat(chunks));if(e.serial!==serial+1)throw Error('Replayed/out-of-order receipt');serial=e.serial;
    const result=await event(e.kind,e.payload);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));return;
  }
  if(url.pathname.startsWith('/session/')){res.writeHead(404).end();return;}
  const upstream=await fetch(staticServer.origin+req.url);res.writeHead(upstream.status,Object.fromEntries(upstream.headers));res.end(Buffer.from(await upstream.arrayBuffer()));
})().catch(async error=>{console.error(error);if(!res.headersSent)res.writeHead(500);res.end('Receipt protocol failed');receipt.error=error.stack;receipt.pass=false;await save();});});
await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
const url='http://'+value('--address')+':'+server.address().port+'/remote.html?session='+token;
await writeFile(path.join(dir,'connection.json'),JSON.stringify({url,dir,token,diagnostic},null,2)+'\n');await save();console.log(JSON.stringify({dir,url,diagnostic}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void(async()=>{receipt.interrupted=!finished;await save();if(soak){soak.r.error='Collector interrupted';soak.gzip.end();await once(soak.output,'close');await writeFile(path.join(soak.dir,'receipt.json'),JSON.stringify(soak.r,null,2));}server.closeAllConnections();server.close();await staticServer.close();process.exit(0);})();});
