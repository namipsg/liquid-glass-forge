import { chromium, firefox, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import { webglServer } from '../tests/webgl-server.mjs';
import { ADMISSION } from '../spikes/phase-1/admission.mjs';
import { openDeviceTransport } from '../tests/device-connection.mjs';
const physical=process.argv.includes('--device'),serial='RZ8T914M92R';
await mkdir('private/phase-6/benchmark',{recursive:true});const dir=await mkdtemp('private/phase-6/benchmark/'+(physical?'a04s':'desktop')+'-'),server=await webglServer(dir);
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8',timeout:30000}).trim();
const receipt={startedAt:new Date().toISOString(),environmentKind:physical?'physical Android device':'headless browser; no physical/Safari qualification',limits:ADMISSION.webgl,sourceSha256:server.sourceSha256,artifacts:server.artifacts,environments:[],completed:false};
let forward,reverse,transport,page,browser;
try{
  if(physical){receipt.connection={serial,originalForward:adb('forward','--list'),originalReverse:adb('reverse','--list')};receipt.device={model:adb('shell','getprop','ro.product.model'),android:adb('shell','getprop','ro.build.version.release')};if(receipt.device.model!=='SM-A047F')throw new Error('Wrong authorized device');reverse='tcp:'+server.port;if(receipt.connection.originalReverse.split('\n').some(l=>l.split(/\s+/)[1]===reverse))throw new Error('Existing reverse mapping');adb('reverse',reverse,reverse);forward='tcp:'+adb('forward','tcp:0','localabstract:chrome_devtools_remote');transport=await openDeviceTransport('http://127.0.0.1:'+forward.slice(4));}
  for(const [name,engine] of physical?[['android-chrome',chromium]]:Object.entries({chromium,firefox,webkit})){
    browser=physical?await chromium.connectOverCDP(transport,{timeout:15000,noDefaults:true}):await engine.launch();page=physical?await browser.contexts()[0].newPage():await browser.newPage();
    const result={name,version:browser.version(),pageErrors:[],runs:[]};receipt.environments.push(result);page.on('pageerror',e=>result.pageErrors.push(e.message));await page.goto(server.origin);await page.bringToFront();
    // Device conformance is collected from installed artifacts, separately from timing.
    if(physical){for(const check of ['conformance','atlasCases','faults','restoration','resources','integration']){result[check]=await page.evaluate(async k=>(await import('/fixtures.js'))[k](),check);await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));if(!result[check].pass)throw new Error('Device '+check+' failed');}for(let i=0;i<2;i++){await page.fill('#gpu-input-'+i,'physical GPU input');await page.click('#gpu-button-'+i);}await page.screenshot({path:dir+'/device-integration.png'});result.native=await page.evaluate(async()=>(await import('/fixtures.js')).finishIntegration());if(result.native.values.some(v=>v!=='physical GPU input'))throw new Error('Physical native control failed');}
    await page.goto(server.origin+'/benchmark');await page.bringToFront();
    for(let repeat=1;repeat<=2;repeat++){const run=await page.evaluate(async repeat=>(await import('/fixtures.js')).benchmark(repeat),repeat);run.budgetPass=run.environment.visibility==='visible'&&run.batchMs.p95<=ADMISSION.webgl.batchMs&&run.frameIntervalMs.p95<=ADMISSION.webgl.intervalMs&&run.completionAgeMs.p95<=ADMISSION.webgl.ageMs&&run.accountedImageBytes<=ADMISSION.webgl.bytes&&run.gpu.resources.contexts===1&&run.gpu.renderCount===420&&run.gpu.batchCount===105&&run.gpu.lastBatch.targets===4&&run.rawFrames.length===90;result.runs.push(run);await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({name,repeat,batch:run.batchMs.p95,interval:run.frameIntervalMs.p95,age:run.completionAgeMs.p95,bytes:run.accountedImageBytes,pass:run.budgetPass}));}
    result.pass=result.pageErrors.length===0&&result.runs.every(r=>r.budgetPass);await page.close();page=undefined;if(!physical)await browser.close();browser=undefined;
  }
  receipt.completed=true;receipt.pass=receipt.environments.every(e=>e.pass);
}catch(e){receipt.pass=false;receipt.error=e.stack;}
finally{await page?.close().catch(()=>{});if(!physical)await browser?.close();transport?.close();if(forward)adb('forward','--remove',forward);if(reverse)adb('reverse','--remove',reverse);if(receipt.connection){receipt.connection.finalForward=adb('forward','--list');receipt.connection.finalReverse=adb('reverse','--list');receipt.connection.restored=receipt.connection.originalForward===receipt.connection.finalForward&&receipt.connection.originalReverse===receipt.connection.finalReverse;receipt.connection.filter=transport?.metadata;if(!receipt.connection.restored)receipt.pass=false;}await server.close();receipt.endedAt=new Date().toISOString();await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({dir,completed:receipt.completed,pass:receipt.pass,error:receipt.error}));process.exit(receipt.pass?0:1);
