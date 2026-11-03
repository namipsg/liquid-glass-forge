import { writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, readdir, cp, rm, lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from '@playwright/test';
import { packageFiles } from './pack-smoke.mjs';
import { auditPackage } from './package-audit.mjs';
import { consumerPackage, distributionVersions } from './distribution-artifacts.mjs';
if(process.argv[2]&&process.argv[2]!=='react')throw Error('Only the React adapter is implemented');
const root=process.cwd();await mkdir('private/phase-7/consumer',{recursive:true});const dir=await mkdtemp(path.resolve('private/phase-7/consumer/run-')),consumer=await mkdtemp(path.join(tmpdir(),'lgf-react-consumer-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const receipt={producerSha256:sha(await readFile(new URL('./test-react.mjs',import.meta.url))),runtime:{node:process.version,platform:process.platform,arch:process.arch},startedAt:new Date().toISOString(),versions:{react:'19.3.1','react-dom':'19.3.1',next:'16.4.4',vite:'8.3.5'},artifacts:[],checks:[],sourceSha256:{},pass:false};
receipt.temporaryConsumer=consumer;
receipt.distributionManifest=process.env.LGF_DISTRIBUTION_MANIFEST;
let next,server,browser,dev;
const command=async(exe,args,log,cwd=consumer,timeout=240000)=>{
  const chunks=[];let killed=false;const child=spawn(exe,args,{cwd,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'production',npm_config_ignore_scripts:'true'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));const timer=setTimeout(()=>{killed=true;child.kill('SIGTERM');},timeout);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timer);await writeFile(path.join(dir,log),Buffer.concat(chunks));if(code!==0||killed)throw new Error(log+' failed '+code+(killed?' timeout':''));
};
const check=(name,value)=>{receipt.checks.push({name,...value});writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
  for(const folder of ['packages/react/src','tests/fixtures/react'])for(const f of await readdir(folder)){const file=folder+'/'+f;receipt.sourceSha256[file]=sha(await readFile(file));}
  await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));const tarballs=[];
  for(const name of ['core','cpu','dom','webgl','react']){
    const meta=consumerPackage(name,dir);const tarball=path.join(dir,meta.filename),files=execFileSync('tar',['-tzf',tarball],{encoding:'utf8'}).trim().split('\n').map(f=>f.replace(/^package\//,'')).sort();assert.deepEqual(files,packageFiles[name]);const manifest=JSON.parse(execFileSync('tar',['-xOf',tarball,'package/package.json'],{encoding:'utf8'}));auditPackage(manifest,files,{internalVersions:distributionVersions(),installedPeers:receipt.versions});receipt.artifacts.push({name,sha256:sha(await readFile(tarball)),files});tarballs.push(tarball);
  }
  console.log('Installing physical packed React consumer');
  await command('npm',['install','--ignore-scripts','--prefer-online','--no-audit','--no-fund','--save-exact',...tarballs,'react@19.3.1','react-dom@19.3.1','@types/react@19.3.0','@types/react-dom@19.3.0','next@16.4.4','vite@8.3.5'],'install.txt');
  await cp(path.join(consumer,'package-lock.json'),path.join(dir,'consumer-package-lock.json'));
  for(const a of receipt.artifacts){const installed=path.join(consumer,'node_modules/@liquid-glass-forge',a.name);assert.equal((await lstat(installed)).isSymbolicLink(),false);assert.ok((await realpath(installed)).startsWith(await realpath(consumer)));for(const f of a.files){const tar=tarballs[receipt.artifacts.indexOf(a)];assert.deepEqual(await readFile(path.join(installed,f)),execFileSync('tar',['-xOf',tar,'package/'+f]));}}
  for(const [name,version] of Object.entries(receipt.versions))assert.equal(JSON.parse(await readFile(path.join(consumer,'node_modules',name,'package.json'))).version,version);
  check('physical installs and exact package audit',{pass:true});
  const jsx=await readFile('tests/fixtures/react/App.jsx','utf8');await writeFile(path.join(consumer,'App.jsx'),jsx);
  await writeFile(path.join(consumer,'client.jsx'),"import '@liquid-glass-forge/dom/styles.css';\n"+await readFile('tests/fixtures/react/client.jsx','utf8'));
  await writeFile(path.join(consumer,'server.jsx'),"import React,{StrictMode} from 'react';import{renderToString}from'react-dom/server';import App from './App.jsx';export function render(){return renderToString(<StrictMode><App/></StrictMode>);}");
  await writeFile(path.join(consumer,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><title>Packed React SSR consumer</title></head><body><div id="root"><!--app--></div><script type="module" src="/client.jsx"></script></body></html>');
  await writeFile(path.join(consumer,'types.tsx'),`import React,{createRef}from'react';import{GlassSurface,GlassSceneProvider,useGlassSurface,type GlassSurfaceBinding}from'@liquid-glass-forge/react';const r=createRef<HTMLDivElement>();const valid=<GlassSceneProvider><GlassSurface ref={r} material="opaque" onClick={e=>{const d:HTMLDivElement=e.currentTarget;}}><input/></GlassSurface></GlassSceneProvider>;
// @ts-expect-error unsupported material
const invalid=<GlassSurface material="water"/>;
// @ts-expect-error div ref must retain exact type
const badRef=<GlassSurface ref={createRef<HTMLButtonElement>()}/>;
function Hook(){const b:GlassSurfaceBinding=useGlassSurface();return <section ref={b.ref}><canvas ref={b.targetRef}/></section>;}
`);
  await command(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--jsx','react-jsx','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.tsx'],'types.txt');check('public JSX/ref/hook types',{pass:true});await cp(path.join(consumer,'types.tsx'),path.join(dir,'consumer-types.tsx'));await rm(path.join(consumer,'types.tsx'));
  // Preload the server renderer; trap adapter import and render separately.
  await writeFile(path.join(consumer,'ssr.mjs'),`import React from 'react';import{renderToString}from'react-dom/server';for(const name of ['window','document','navigator','Worker','OffscreenCanvas','ResizeObserver','IntersectionObserver','requestAnimationFrame','setTimeout','setInterval','fetch','XMLHttpRequest','WebSocket'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('SSR touched '+name)}});const{GlassSceneProvider,GlassSurface}=await import('@liquid-glass-forge/react');const html=renderToString(React.createElement(GlassSceneProvider,null,React.createElement(GlassSurface,{material:'opaque'},React.createElement('input'))));if(!html.includes('data-lgf-material="opaque"')||!html.includes('<input')||!html.includes('aria-hidden="true"'))throw Error('SSR fallback missing');console.log(html);`);
  await command(process.execPath,['ssr.mjs'],'ssr-traps.txt');check('SSR import/render browser/network/timer traps',{pass:true});
  console.log('Building production Vite client and SSR');
  await command(process.execPath,['node_modules/vite/bin/vite.js','build'],'vite-client.txt');await command(process.execPath,['node_modules/vite/bin/vite.js','build','--ssr','server.jsx','--outDir','ssr'],'vite-ssr.txt');
  const {render}=await import(pathToFileURL(path.join(consumer,'ssr/server.js')));const html=(await readFile(path.join(consumer,'dist/index.html'),'utf8')).replace('<!--app-->',render());await writeFile(path.join(consumer,'dist/index.html'),html);await writeFile(path.join(dir,'vite-server.html'),html);
  const sourceIndex=(await readFile(path.join(consumer,'index.html'),'utf8')).replace('<!--app-->',render());await writeFile(path.join(consumer,'index.html'),sourceIndex);const vite=await import(pathToFileURL(path.join(consumer,'node_modules/vite/dist/node/index.js')));dev=await vite.createServer({root:consumer,server:{host:'127.0.0.1',port:0},logLevel:'error'});await dev.listen();const strictOrigin='http://127.0.0.1:'+dev.httpServer.address().port;check('Vite production SSR/client build',{pass:true});
  server=createServer((req,res)=>{void(async()=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const f=url.pathname==='/'?'index.html':url.pathname.slice(1);if(f.includes('..')){res.writeHead(404).end();return;}const file=path.join(consumer,'dist',f);try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'}).end(bytes);}catch{res.writeHead(404).end();}})();});await new Promise(r=>server.listen(0,'127.0.0.1',r));const viteOrigin='http://127.0.0.1:'+server.address().port;
  await mkdir(path.join(consumer,'app'));await writeFile(path.join(consumer,'app/layout.jsx'),"import '@liquid-glass-forge/dom/styles.css';export default function Layout({children}){return <html lang='en'><body>{children}</body></html>}");await writeFile(path.join(consumer,'app/page.jsx'),"import Client from './Client';import Link from 'next/link';export default function Page(){return <><Client/><Link id='navigate-away' href='/away'>Away</Link></>}");await writeFile(path.join(consumer,'app/Client.jsx'),"'use client';export {default} from '../App';");await mkdir(path.join(consumer,'app/away'));await writeFile(path.join(consumer,'app/away/page.jsx'),"import Link from 'next/link';export default function Away(){return <main><h1 id='away'>Other route</h1><Link href='/' id='navigate-home'>Home</Link></main>}");await writeFile(path.join(consumer,'next.config.mjs'),"export default {reactStrictMode:true,experimental:{cpus:2},poweredByHeader:false};");
  console.log('Building production Next.js server/client boundary');await command(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],'next-build.txt');check('Next production server/client boundary build',{pass:true});
  // Bind a free local port, then start only our owned production server.
  const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const nextLog=[];next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{cwd:consumer,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'production',npm_config_ignore_scripts:'true'},stdio:['ignore','pipe','pipe']});next.stdout.on('data',b=>nextLog.push(b));next.stderr.on('data',b=>nextLog.push(b));const nextOrigin='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await fetch(nextOrigin)).ok)break;}catch{}if(i===99)throw Error('Next readiness failed');await new Promise(r=>setTimeout(r,100));}
  await writeFile(path.join(dir,'next-server.html'),await(await fetch(nextOrigin)).text());
  for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
    browser=await engine.launch();for(const [kind,origin] of [['strict',strictOrigin],['vite',viteOrigin],['next',nextOrigin]]){
      console.log('Browser lifecycle '+name+' / '+kind);const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.addInitScript(()=>{window.gpuCalls=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(/webgl/i.test(type))window.gpuCalls++;return get.call(this,type,...args);};const observer=new MutationObserver(()=>{const input=document.querySelector('#native-input'),canvas=document.querySelector('#surface canvas');if(input&&canvas&&!window.originalInput){window.originalInput=input;window.originalCanvas=canvas;observer.disconnect();}});observer.observe(document,{subtree:true,childList:true});});
      await page.goto(origin);await page.waitForFunction(()=>window.phase7?.stats.active===1&&document.querySelector('#surface canvas')?.width===160);
      await page.waitForFunction(()=>document.querySelector('#surface canvas').getContext('2d').getImageData(0,0,1,1).data[0]===255);
      await page.waitForFunction(()=>document.querySelector('#hook canvas').width===160&&document.querySelector('#hook canvas').getContext('2d').getImageData(0,0,1,1).data[0]===255);
      assert.equal(await page.evaluate(()=>window.originalInput===document.querySelector('#native-input')&&window.originalCanvas===document.querySelector('#surface canvas')),true);
      await page.fill('#native-input','native React input');await page.click('#native-button');assert.equal(await page.textContent('#clicks'),'1');
      const initial=await page.evaluate(()=>({initialized:window.phase7.stats.initialized,active:window.phase7.stats.active,subscriptions:window.phase7.stats.subscriptions}));assert.equal(initial.active,1);assert.equal(initial.subscriptions,1);if(kind==='strict')assert.ok(initial.initialized>=2,'Strict Mode replay missing');
      await page.click('#material');assert.equal(await page.getAttribute('#surface canvas','data-lgf-material'),'opaque');await page.click('#ref');await page.waitForFunction(()=>window.phase7.stats.refB>0);assert.ok(await page.evaluate(()=>window.phase7.stats.refCleanups)>0);
      await page.click('#swap');await page.waitForFunction(()=>document.querySelector('#hook').tagName==='SECTION'&&document.querySelector('#hook canvas').width===160);
      await page.click('#replace');await page.waitForFunction(()=>document.querySelector('#surface canvas').getContext('2d').getImageData(0,0,1,1).data[1]===255);
      await page.click('#switch');await page.waitForFunction(()=>window.phase7.stats.active===1&&document.querySelector('#surface canvas').getContext('2d').getImageData(0,0,1,1).data[1]===255);assert.equal(await page.inputValue('#native-input'),'native React input');
      await page.click('#pause');await page.waitForFunction(()=>window.phase7.stats.active===0);await page.click('#pause');await page.waitForFunction(()=>window.phase7.stats.active===1);
      await page.waitForFunction(()=>['#surface canvas','#hook canvas'].every(selector=>{const c=document.querySelector(selector);return c.width===160&&c.getContext('2d').getImageData(0,0,1,1).data[1]===255;}));
      await page.screenshot({path:path.join(dir,name+'-'+kind+'.png')});
      await page.click('#held');await page.waitForFunction(()=>window.phase7.stats.renderPending.length>0);await page.evaluate(()=>window.oldTarget=document.querySelector('#surface canvas'));await page.click('#toggle');await page.waitForFunction(()=>window.phase7.stats.active===0&&window.phase7.stats.subscriptions===0);assert.equal(await page.evaluate(()=>window.phase7.stats.lastRenderSignal.aborted),true);const before=await page.evaluate(()=>[...window.oldTarget.getContext('2d').getImageData(0,0,1,1).data]);await page.evaluate(()=>window.phase7.stats.renderPending.splice(0).forEach(f=>f()));await page.waitForFunction(()=>window.phase7.stats.released>0);assert.deepEqual(await page.evaluate(()=>[...window.oldTarget.getContext('2d').getImageData(0,0,1,1).data]),before);
      await page.click('#init');await page.click('#toggle');await page.waitForFunction(()=>window.phase7.stats.initPending.length>0);await page.click('#toggle');assert.equal(await page.evaluate(()=>window.phase7.stats.lastInitSignal.aborted),true);await page.evaluate(()=>window.phase7.stats.initPending.splice(0).forEach(f=>f()));await page.waitForFunction(()=>window.phase7.stats.active===0&&window.phase7.stats.subscriptions===0);
      if(kind==='next'){await page.click('#switch');await page.click('#toggle');await page.waitForFunction(()=>window.phase7.stats.active===1);await page.evaluate(()=>window.retiredStats=window.phase7.stats);await page.click('#navigate-away');await page.waitForSelector('#away');await page.waitForFunction(()=>window.retiredStats.active===0&&window.retiredStats.subscriptions===0);await page.click('#navigate-home');await page.waitForFunction(()=>window.phase7?.stats.active===1&&document.querySelector('#surface canvas').getContext('2d').getImageData(0,0,1,1).data[0]===255);}
      assert.equal(await page.evaluate(()=>window.gpuCalls),0);assert.equal(await page.textContent('#error'),'');assert.deepEqual(await page.evaluate(()=>window.hydrationErrors??[]),[]);assert.deepEqual(errors,[]);check(name+' '+kind+' hydration/native/refs/shared/late cleanup',{pass:true,version:browser.version(),initial});await page.close();
      const nojs=await browser.newContext({javaScriptEnabled:false}),fallback=await nojs.newPage();await fallback.goto(origin);assert.equal(await fallback.locator('#native-input').count(),1);assert.equal(await fallback.getAttribute('#surface canvas','aria-hidden'),'true');assert.equal(await fallback.getAttribute('#surface canvas','data-lgf-material'),'glass');await nojs.close();check(name+' '+kind+' no-JS fallback',{pass:true});
    }await browser.close();browser=undefined;
  }
  await writeFile(path.join(dir,'next-server.txt'),Buffer.concat(nextLog));receipt.pass=true;
}catch(error){receipt.error=error.stack;throw error;}
finally{await browser?.close();next?.kill('SIGTERM');await dev?.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await rm(consumer,{recursive:true,force:true});receipt.endedAt=new Date().toISOString();await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({dir,pass:receipt.pass,error:receipt.error}));}
