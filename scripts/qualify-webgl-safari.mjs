import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir,mkdtemp,writeFile,open } from 'node:fs/promises';
import { webglServer } from '../tests/webgl-server.mjs';
import { ADMISSION } from '../spikes/phase-1/admission.mjs';
await mkdir('private/phase-6/safari',{recursive:true});const dir=await mkdtemp('private/phase-6/safari/run-'),server=await webglServer(dir);
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const output=await open(dir+'/driver.txt','w'),driver=spawn('/usr/bin/safaridriver',['-p',String(port)],{stdio:['ignore',output.fd,output.fd]});
const receipt={environmentKind:'actual Safari on local Mac; distinct from Playwright WebKit',startedAt:new Date().toISOString(),sourceSha256:server.sourceSha256,artifacts:server.artifacts,checks:{},runs:[],completed:false,settingsChanged:false,existingCadenceWaiver:true};let session;
const wd=async(path,method='GET',body)=>{const response=await fetch('http://127.0.0.1:'+port+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(65000)});const value=(await response.json()).value;if(!response.ok||value?.error)throw new Error(value?.error+': '+value?.message);return value;};
const run=async script=>{const out=await wd('/session/'+session+'/execute/async','POST',{script:'const done=arguments[arguments.length-1];Promise.resolve().then(async()=>{'+script+'}).then(value=>done({value}),error=>done({error:String(error.stack||error)}));',args:[]});if(out.error)throw new Error(out.error);return out.value;};
try{
  let ready=false;for(let i=0;i<30;i++){try{await wd('/status');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}if(!ready)throw new Error('Owned Safari driver unavailable');
  const created=await wd('/session','POST',{capabilities:{alwaysMatch:{browserName:'safari'}}});session=created.sessionId;receipt.capabilities=created.capabilities;
  await wd('/session/'+session+'/timeouts','POST',{script:60000,pageLoad:30000});await wd('/session/'+session+'/url','POST',{url:server.origin});
  for(const check of ['conformance','atlasCases','faults','restoration','resources','integration']){receipt.checks[check]=await run('return (await import("/fixtures.js"))['+JSON.stringify(check)+']();');await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));if(!receipt.checks[check].pass)throw new Error('Safari '+check+' failed');}
  for(let i=0;i<2;i++){const key='element-6066-11e4-a52e-4f735466cecf',el=await wd('/session/'+session+'/element','POST',{using:'css selector',value:'#gpu-input-'+i});await wd('/session/'+session+'/element/'+el[key]+'/value','POST',{text:'Safari GPU input'});const button=await wd('/session/'+session+'/element','POST',{using:'css selector',value:'#gpu-button-'+i});await wd('/session/'+session+'/element/'+button[key]+'/click','POST',{});}
  await writeFile(dir+'/native.png',Buffer.from(await wd('/session/'+session+'/screenshot'),'base64'));receipt.native=await run('return (await import("/fixtures.js")).finishIntegration();');if(receipt.native.values.some(v=>v!=='Safari GPU input'))throw new Error('Safari native input failed');
  await wd('/session/'+session+'/url','POST',{url:server.origin+'/benchmark'});
  for(let repeat=1;repeat<=2;repeat++){const r=await run('return (await import("/fixtures.js")).benchmark('+repeat+');');r.budgetPass=r.batchMs.p95<=ADMISSION.webgl.batchMs&&r.frameIntervalMs.p95<=ADMISSION.webgl.intervalMs&&r.completionAgeMs.p95<=ADMISSION.webgl.ageMs&&r.accountedImageBytes<=ADMISSION.webgl.bytes;receipt.runs.push(r);await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));}
  receipt.completed=true;receipt.correctnessPass=true;receipt.timingPass=receipt.runs.every(r=>r.budgetPass);receipt.pass=receipt.correctnessPass&&receipt.timingPass;
}catch(e){receipt.pass=false;receipt.error=e.stack;}
finally{if(session){try{await wd('/session/'+session,'DELETE');receipt.ownedSessionClosed=true;}catch(e){receipt.cleanupError=String(e);}}driver.kill('SIGTERM');await output.close();await server.close();receipt.endedAt=new Date().toISOString();await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({dir,completed:receipt.completed,pass:receipt.pass,error:receipt.error}));process.exit(receipt.pass?0:1);
