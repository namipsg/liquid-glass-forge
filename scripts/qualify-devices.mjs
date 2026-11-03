import { chromium } from '@playwright/test';
import { readFile,writeFile,mkdir,mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { safariSession } from '../tests/safari-session.mjs';
import { qualificationServer } from '../tests/qualification-server.mjs';
import { openDeviceTransport } from '../tests/device-connection.mjs';
import { awaitCdpEndpoint } from './qualify-cpu-device.mjs';

const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--candidate')||!args.includes('--environment'))throw Error('Exact --candidate and --environment are required');
const environment=value('--environment'),allowed=['mac-chrome-m4','mac-safari-m4','android-a04s','iphone'];
if(!allowed.includes(environment))throw Error('Unsupported or unavailable physical environment');
const candidatePath=path.resolve(value('--candidate')),candidate=JSON.parse(await readFile(candidatePath)),plan=JSON.parse(await readFile('docs/qualification-plan.json'));
if(!candidate.prepared)throw Error('Physical tarball candidate must be prepared first');
const smoke=args.includes('--smoke'),serial=args.includes('--serial')?value('--serial'):undefined;
await mkdir('private/phase-11/devices',{recursive:true});const dir=await mkdtemp(path.resolve('private/phase-11/devices/'+environment+'-'));
const receipt={startedAt:new Date().toISOString(),environment,diagnostic:smoke,candidate:candidatePath,artifacts:candidate.artifacts,sourceSha256:{},settingsChanged:false,checks:[],benchmarks:[],completed:false,pass:false};
for(const file of ['scripts/qualify-devices.mjs','tests/qualification-server.mjs','tests/safari-session.mjs','docs/qualification-plan.json'])receipt.sourceSha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
let browser,page,webdriver,transport,forward,reverse,client;
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8',timeout:30000}).trim();
const server=await qualificationServer(path.resolve(candidate.reviewAssets),{host:environment==='iphone'?'0.0.0.0':'127.0.0.1'});
let origin=server.origin;
const save=()=>writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));
const p95=values=>values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
try {
  if(environment==='iphone'||environment==='mac-safari-m4') {
    if(environment==='iphone') {
      if(!args.includes('--udid'))throw Error('One explicitly authorized iPhone UDID is required');
      const address=args.includes('--public-host')?value('--public-host'):networkInterfaces().en0?.find(a=>a.family==='IPv4'&&!a.internal)?.address;
      if(!address)throw Error('No reachable host address; supply --public-host');origin='http://'+address+':'+server.port;
    }
    webdriver=await safariSession(environment==='iphone'?{platformName:'iOS','safari:useSimulator':false,'safari:deviceUDID':value('--udid')}:{platformName:'macOS'},path.join(dir,'driver.txt'));
    receipt.capabilities=webdriver.capabilities;
    client={navigate:url=>webdriver.navigate(url),evaluate:script=>webdriver.evaluate(script),screenshot:async file=>writeFile(file,Buffer.from(await webdriver.screenshot(),'base64')),
      async fill(selector,text){const key='element-6066-11e4-a52e-4f735466cecf';await webdriver.evaluate('const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView();e.focus();e.value="";');
        // Native WebDriver element input is provided through the session helper.
        await webdriver.fill(selector,text);},click:selector=>webdriver.click(selector)};
  } else {
    if(environment==='android-a04s') {
      if(!serial)throw Error('One observed authorized --serial is required');
      receipt.connection={originalForward:adb('forward','--list'),originalReverse:adb('reverse','--list')};
      receipt.device={model:adb('shell','getprop','ro.product.model'),os:adb('shell','getprop','ro.build.version.release')};
      if(receipt.device.model!=='SM-A047F')throw Error('Wrong authorized Android reference device');
      reverse='tcp:'+server.port;if(receipt.connection.originalReverse.split('\n').some(l=>l.split(/\s+/)[1]===reverse))throw Error('Existing reverse mapping');adb('reverse',reverse,reverse);
      const activity=adb('shell','cmd','package','resolve-activity','--brief','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','com.android.chrome').split('\n').find(l=>l.includes('/')&&!l.includes(' '));
      adb('shell','am','start','-n',activity);forward='tcp:'+adb('forward','tcp:0','localabstract:chrome_devtools_remote');
      const endpoint='http://127.0.0.1:'+forward.slice(4);await awaitCdpEndpoint(endpoint);transport=await openDeviceTransport(endpoint);browser=await chromium.connectOverCDP(transport,{noDefaults:true,timeout:15000});page=await browser.contexts()[0].newPage();
    } else {browser=await chromium.launch({channel:'chrome',headless:false});page=await browser.newPage({viewport:null});}
    receipt.browserVersion=browser.version();page.on('pageerror',e=>{(receipt.pageErrors??=[]).push(e.message);});
    client={navigate:url=>page.goto(url),evaluate:script=>page.evaluate('(async()=>{'+script+'})()'),screenshot:file=>page.screenshot({path:file}),fill:(s,t)=>page.fill(s,t),click:s=>page.click(s)};
  }
  if(environment.startsWith('mac-')) {
    const hardware=JSON.parse(execFileSync('system_profiler',['SPHardwareDataType','-json'],{encoding:'utf8'})).SPHardwareDataType[0];
    receipt.host={model:hardware.machine_model,chip:hardware.chip_type,os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim()};
    if(receipt.host.model!=='Mac16,10'||receipt.host.chip!=='Apple M4'||receipt.host.os!=='26.6.2')throw Error('Host differs from frozen M4 environment');
  }
  const evaluate=client.evaluate;
  for(const adapter of plan.requiredAdapters)for(const backend of plan.requiredBackends) {
    await client.navigate(origin+'/'+adapter+'/?qualification=1');
    await evaluate('const end=Date.now()+15000;while(!window.phase10){if(Date.now()>end)throw Error("bootstrap timeout");await new Promise(r=>setTimeout(r,10))}await window.phase10.qualify('+JSON.stringify(backend)+');const run=window.phase10.state.run;while(!run.completed){if(Date.now()>end)throw Error("first frame timeout");await new Promise(r=>setTimeout(r,10))}');
    await client.fill('#name-0','Physical '+adapter);await client.click('#count-0');
    const native=await evaluate('return {value:document.querySelector("#name-0").value,clicks:window.phase10.clicks,visibility:document.visibilityState,dpr:devicePixelRatio,userAgent:navigator.userAgent};');
    if(native.value!=='Physical '+adapter||native.clicks<1||native.visibility!=='visible')throw Error('Native physical control failed');
    await evaluate('document.activeElement?.blur();');
    const count=smoke?2:plan.lifecycleCycles;
    for(let start=0;start<count;start+=10)await evaluate('const api=window.phase10,run=api.state.run;for(let i=0;i<'+Math.min(10,count-start)+';i++){await api.unmount();const d=run.diagnostics();if(run.active||run.subscriptions||run.workerCreated!==run.workerTerminated||d.pool.leased)throw Error("retained lifecycle resource");const before=run.completed;await api.mount();const end=Date.now()+10000;while(run.completed<=before){if(Date.now()>end)throw Error("lifecycle frame timeout");await new Promise(r=>setTimeout(r,5))}}');
    const diagnostics=await evaluate('return window.phase10.state.run.diagnostics();');
    if(diagnostics.effectiveBackend!==(backend==='webgl'?'webgl':'cpu')||(backend==='worker'&&diagnostics.cpu.execution!=='worker'))throw Error('Forced backend mismatch');
    let gpuIdentity;
    if(backend==='webgl')gpuIdentity=await evaluate('const gl=window.phase10.state.run.optical.atlas.context,e=gl.getExtension("WEBGL_debug_renderer_info");return {version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(e?e.UNMASKED_VENDOR_WEBGL:gl.VENDOR)};');
    await client.screenshot(path.join(dir,adapter+'-'+backend+'.png'));
    await evaluate('await window.phase10.destroy();');receipt.checks.push({adapter,backend,lifecycleCycles:count,native,diagnostics,gpuIdentity,pass:true});await save();console.log(adapter,backend,'physical checks passed');
  }
  if(!smoke) {
    await client.navigate(origin+'/bench.html');receipt.cpuConformance=await evaluate('return await (await import("/cpu-device-fixtures.js")).conformance();');
    if(!receipt.cpuConformance.pass)throw Error('Physical CPU conformance failed');
    for(const execution of ['off','required'])for(let repeat=1;repeat<=2;repeat++) {
      await client.navigate(origin+'/bench.html');const r=await evaluate('return await (await import("/cpu-device-fixtures.js")).workload('+JSON.stringify(execution)+','+repeat+');');
      if(r.frames!==90||r.warmup!==15||r.rawFrames.length!==90||r.width!==320||r.height!==180||r.source.width!==640||r.source.height!==360||!r.rawFrames.every((f,i)=>f.frame===i&&f.optics.radius===36&&f.optics.bevel===30&&f.optics.strength===12+((i+15)%20)/5))throw Error('Incomplete or changed original CPU workload');
      r.p95=Object.fromEntries(['batchMs','intervalMs','completionAgeMs'].map(k=>[k,p95(r.rawFrames.map(f=>f[k]))]));
      r.budgetPass=r.environment.visibility==='visible'&&r.p95.batchMs<=plan.cpu.batchMs&&r.p95.intervalMs<=plan.cpu.intervalMs&&r.p95.completionAgeMs<=plan.cpu.ageMs&&r.accountedImageBytes<=plan.cpu.bytes;receipt.benchmarks.push({backend:'cpu',...r});await save();
    }
    await client.navigate(origin+'/bench.html');receipt.gpuConformance=await evaluate('return await (await import("/webgl-fixtures.js")).conformance();');if(!receipt.gpuConformance.pass)throw Error('Physical GPU conformance failed');
    for(let repeat=1;repeat<=2;repeat++) {
      await client.navigate(origin+'/bench.html');const r=await evaluate('return await (await import("/webgl-fixtures.js")).benchmark('+repeat+');');
      if(r.count!==4||r.width!==640||r.height!==360||r.source.width!==640||r.source.height!==360||r.rawFrames.length!==90||r.warmup!==15||!r.rawFrames.every((f,i)=>f.optics.length===4&&f.optics.every((s,j)=>s.width===640&&s.height===360&&s.radius===72&&s.bevel===60&&s.strength===12+((i+15+j)%20)/5)))throw Error('Changed original GPU workload');
      r.fullyOnScreen=r.environment.targetCss.every(t=>t.rect.top>=0&&t.rect.left>=0&&t.rect.right<=r.environment.viewport.width&&t.rect.bottom<=r.environment.viewport.height);
      r.budgetPass=r.environment.visibility==='visible'&&r.fullyOnScreen&&r.batchMs.p95<=plan.webgl.batchMs&&r.frameIntervalMs.p95<=plan.webgl.intervalMs&&r.completionAgeMs.p95<=plan.webgl.ageMs&&r.accountedImageBytes<=plan.webgl.bytes;receipt.benchmarks.push(r);await save();
    }
  }
  receipt.completed=true;receipt.pass=!smoke&&receipt.checks.length===12&&receipt.benchmarks.length===6&&receipt.benchmarks.every(b=>b.budgetPass)&&!(receipt.pageErrors?.length);
}catch(error){receipt.error=error.stack;await client?.screenshot(path.join(dir,'failure.png')).catch(()=>{});}
finally {
  await webdriver?.close();await page?.close().catch(()=>{});if(environment==='mac-chrome-m4')await browser?.close();transport?.close();
  if(forward)adb('forward','--remove',forward);if(reverse)adb('reverse','--remove',reverse);
  if(receipt.connection){receipt.connection.finalForward=adb('forward','--list');receipt.connection.finalReverse=adb('reverse','--list');receipt.connection.restored=receipt.connection.originalForward===receipt.connection.finalForward&&receipt.connection.originalReverse===receipt.connection.finalReverse;if(!receipt.connection.restored)receipt.pass=false;}
  await server.close();receipt.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({dir,completed:receipt.completed,pass:receipt.pass,error:receipt.error}));
}
if(!receipt.completed||(!smoke&&!receipt.pass))process.exitCode=1;
