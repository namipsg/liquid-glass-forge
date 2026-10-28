import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { auditPackage } from '../scripts/package-audit.mjs';
import { packageFiles } from '../scripts/pack-smoke.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL('../private/phase-3/browser-import/', import.meta.url); await mkdir(base, { recursive: true });
const artifacts = await mkdtemp(new URL('run-', base));
const modules = new Map(), receipts = { tarballs: [], engines: [] };
const consumer = await mkdtemp(path.join(tmpdir(),'lgf-vanilla-installed-'));
after(async()=>rm(consumer,{recursive:true,force:true}));
await writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'vanilla-packed-browser',private:true,type:'module'}));
const tarballs=[];
for (const name of ['core','dom']) {
  const packed = JSON.parse(execFileSync('npm',['pack','--json','--ignore-scripts','--pack-destination',artifacts],
    { cwd: fileURLToPath(new URL(`../packages/${name}/`,import.meta.url)),encoding:'utf8',timeout:30000 }))[0];
  assert.equal(packed.filename, `liquid-glass-forge-${name}-0.0.0-dev.tgz`);
  const tarball = `${artifacts}/${packed.filename}`;tarballs.push(tarball);
  const files = execFileSync('tar',['-tzf',tarball],{encoding:'utf8'}).trim().split('\n').map(f=>{assert.ok(f.startsWith('package/'));return f.slice(8);}).sort();
  assert.deepEqual(files,packageFiles[name]);
  const manifest = JSON.parse(execFileSync('tar',['-xOf',tarball,'package/package.json'],{encoding:'utf8'}));
  auditPackage(manifest,files,{internalVersions:{'@liquid-glass-forge/core':'0.0.0-dev','@liquid-glass-forge/dom':'0.0.0-dev'}});
  for(const file of files.filter(f=>f.endsWith('.js')||f.endsWith('.css'))) {
    const bytes=execFileSync('tar',['-xOf',tarball,`package/${file}`],{timeout:15000});
    assert.deepEqual(bytes,await readFile(new URL(`../packages/${name}/${file}`,import.meta.url)));
    modules.set(`/${name}/${file.slice(5)}`,bytes);
  }
  receipts.tarballs.push({name,sha256:createHash('sha256').update(await readFile(tarball)).digest('hex')});
}
await writeFile(`${artifacts}/installed-consumer.txt`,execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--save=false',...tarballs],{cwd:consumer,encoding:'utf8',timeout:30000}));
for(const [url,bytes] of modules){const [name,...parts]=url.slice(1).split('/');const file=path.join(consumer,`node_modules/@liquid-glass-forge/${name}/dist`,...parts);assert.ok(!(await lstat(file)).isSymbolicLink());const physical=await readFile(file);assert.deepEqual(physical,bytes);modules.set(url,physical);}
assert.ok(!(await realpath(consumer)).startsWith(await realpath(root)));
for(const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  test(`${name}: installed vanilla packages/CSS preserve native input and complete source/host lifecycle without a bundler`,async()=>{
    const server=createServer((req,res)=>{
      if(req.url==='/' || req.url==='/nojs') res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><link rel="stylesheet" href="/dom/styles.css"><script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core/index.js"}}</script><div class="lgf-host" style="width:220px;height:80px"><canvas class="lgf-surface" data-lgf-material="opaque" aria-hidden="true" role="presentation" tabindex="-1"></canvas><input id="nojs-input"></div><div id="vanilla" style="width:220px;height:80px"><input id="vanilla-input"><button id="vanilla-button">Native</button></div>');
      else if(modules.has(req.url)) res.writeHead(200,{'Content-Type':req.url.endsWith('.css')?'text/css':'text/javascript'}).end(modules.get(req.url));
      else res.writeHead(404).end();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
    try {
      browser=await engine.launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result=await page.evaluate(async()=>{
        const core=await import('/core/index.js'),{SourceProvider,mapSourceRegion,createGlassScene}=await import('/dom/index.js');
        const provider=new SourceProvider({kind:'pixels',width:1,height:1,data:new Uint8Array([10,20,30,255])});
        const {source}=await provider.read();
        const frame=core.createFrame({contractVersion:1,generation:0,revision:0,sourceRevision:0,surfaces:[{id:'one',width:1,height:1}]},source);
        const mapping=mapSourceRegion({source:{width:1,height:1},box:{x:0,y:0,width:1,height:1},target:{x:0,y:0,width:1,height:1}});
        const scene=createGlassScene({source:provider,renderer:{render(req){const data=new Uint8ClampedArray(req.width*req.height*4);for(let i=0;i<data.length;i+=4)data.set([10,20,30,255],i);return {width:req.width,height:req.height,data};}}});
        const attachment=scene.attach(document.querySelector('#vanilla'));await scene.ready;
        const end=performance.now()+3000;while(!attachment.host.target.width){if(performance.now()>end)throw new Error('installed vanilla first frame timeout');await new Promise(r=>setTimeout(r,5));}
        const first=[...attachment.host.target.getContext('2d').getImageData(0,0,1,1).data];
        window.vanillaFixture={scene,attachment,provider};window.packedClicks=0;document.querySelector('#vanilla-button').addEventListener('click',()=>window.packedClicks++);
        return {first,version:core.CONTRACT_VERSION,model:frame.opticalModel,frozen:Object.isFrozen(frame.surfaces[0]),pixels:[...source.data],mapped:mapping.ok};
      });
      assert.deepEqual(result,{first:[10,20,30,255],version:1,model:'rounded-refraction-v1',frozen:true,pixels:[10,20,30,255],mapped:true});assert.deepEqual(errors,[]);
      await page.fill('#vanilla-input','installed native input');assert.equal(await page.inputValue('#vanilla-input'),'installed native input');await page.click('#vanilla-button');assert.equal(await page.evaluate(()=>window.packedClicks),1);
      const lifecycle=await page.evaluate(async()=>{const {scene,attachment,provider}=window.vanillaFixture;scene.update({material:'opaque'});scene.pause();const paused=scene.state;scene.resume();await scene.ready;scene.dispose();scene.dispose();const borrowed=provider.state;provider.destroy();return {paused,state:scene.state,borrowed,remaining:document.querySelector('#vanilla canvas')!==null};});assert.deepEqual(lifecycle,{paused:'paused',state:'destroyed',borrowed:'ready',remaining:false});
      const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(`http://127.0.0.1:${server.address().port}/nojs`);await nojs.fill('#nojs-input','no script');assert.equal(await nojs.inputValue('#nojs-input'),'no script');assert.equal(await nojs.$eval('canvas',e=>getComputedStyle(e).pointerEvents),'none');await nojs.close();assert.deepEqual(errors,[]);
      receipts.engines.push({name,version:browser.version(),pass:true,physicalInstalledConsumer:true,vanillaLifecycle:true,noJavaScriptBaseline:true});
    } catch(error) { receipts.engines.push({name,pass:false,error:error.stack});throw error; }
    finally { await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(`${artifacts}/receipt.json`,JSON.stringify(receipts,null,2)); }
  });
}
