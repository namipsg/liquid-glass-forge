import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium,firefox,webkit } from '@playwright/test';
import { mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import { webglServer } from './webgl-server.mjs';
import { browserLaunchOptions } from './browser-launch.mjs';
for(const [name,engine] of Object.entries({chromium,firefox,webkit}))test(name+': installed WebGL conformance, atlas, faults, recovery and resource bounds',{timeout:180000},async()=>{
  const options=browserLaunchOptions(name);
  await mkdir('private/phase-6/browser',{recursive:true});const dir=await mkdtemp('private/phase-6/browser/'+name+'-'),server=await webglServer(dir);let browser;const receipt={engine:name,environmentKind:options.headless===false?'Xvfb with software OpenGL; no hardware qualification':'headless browser; no hardware/Safari qualification',artifacts:server.artifacts,sourceSha256:server.sourceSha256};
  const warnings=[];
  try{browser=await engine.launch(options);receipt.version=browser.version();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text());});await page.goto(server.origin);
    for(const check of ['conformance','atlasCases','faults','restoration','resources','integration']){receipt[check]=await page.evaluate(async check=>(await import('/fixtures.js'))[check](),check);await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));assert.equal(receipt[check].pass,true,check+' failed '+JSON.stringify(receipt[check]));}
    console.log(name,receipt.version,receipt.environmentKind,receipt.conformance.environment);
    for(let i=0;i<2;i++){await page.fill('#gpu-input-'+i,'native GPU input');assert.equal(await page.inputValue('#gpu-input-'+i),'native GPU input');await page.click('#gpu-button-'+i);}
    await page.screenshot({path:dir+'/native.png'});
    receipt.nativeCleanup=await page.evaluate(async()=>(await import('/fixtures.js')).finishIntegration());assert.deepEqual(receipt.nativeCleanup.values,['native GPU input','native GPU input']);
    assert.deepEqual(errors,[]);receipt.pass=true;
  }catch(e){receipt.pass=false;receipt.error=e.stack;receipt.browserWarnings=warnings;for(const warning of new Set(warnings))console.error(name,warning);throw e;}finally{await browser?.close();await server.close();await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,2));}
});
