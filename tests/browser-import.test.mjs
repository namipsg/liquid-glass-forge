import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { auditPackage } from '../scripts/package-audit.mjs';
import { packageFiles } from '../scripts/pack-smoke.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL('../private/phase-3/browser-import/', import.meta.url); await mkdir(base, { recursive: true });
const artifacts = await mkdtemp(new URL('run-', base));
const modules = new Map(), receipts = { tarballs: [], engines: [] };
for (const name of ['core','dom']) {
  const packed = JSON.parse(execFileSync('npm',['pack','--json','--ignore-scripts','--pack-destination',artifacts],
    { cwd: fileURLToPath(new URL(`../packages/${name}/`,import.meta.url)),encoding:'utf8',timeout:30000 }))[0];
  assert.equal(packed.filename, `liquid-glass-forge-${name}-0.0.0-dev.tgz`);
  const tarball = `${artifacts}/${packed.filename}`;
  const files = execFileSync('tar',['-tzf',tarball],{encoding:'utf8'}).trim().split('\n').map(f=>{assert.ok(f.startsWith('package/'));return f.slice(8);}).sort();
  assert.deepEqual(files,packageFiles[name]);
  const manifest = JSON.parse(execFileSync('tar',['-xOf',tarball,'package/package.json'],{encoding:'utf8'}));
  auditPackage(manifest,files,{internalVersions:{'@liquid-glass-forge/core':'0.0.0-dev','@liquid-glass-forge/dom':'0.0.0-dev'}});
  for(const file of files.filter(f=>f.endsWith('.js'))) {
    const bytes=execFileSync('tar',['-xOf',tarball,`package/${file}`],{timeout:15000});
    assert.deepEqual(bytes,await readFile(new URL(`../packages/${name}/${file}`,import.meta.url)));
    modules.set(`/${name}/${file.slice(5)}`,bytes);
  }
  receipts.tarballs.push({name,sha256:createHash('sha256').update(await readFile(tarball)).digest('hex')});
}
for(const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  test(`${name}: both packed packages import, acquire pixels and map without a bundler`,async()=>{
    const server=createServer((req,res)=>{
      if(req.url==='/') res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core/index.js"}}</script>');
      else if(modules.has(req.url)) res.writeHead(200,{'Content-Type':'text/javascript'}).end(modules.get(req.url));
      else res.writeHead(404).end();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
    try {
      browser=await engine.launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result=await page.evaluate(async()=>{
        const core=await import('/core/index.js'),{SourceProvider,mapSourceRegion}=await import('/dom/index.js');
        const provider=new SourceProvider({kind:'pixels',width:1,height:1,data:new Uint8Array([10,20,30,255])});
        const {source}=await provider.read();provider.destroy();
        const frame=core.createFrame({contractVersion:1,generation:0,revision:0,sourceRevision:0,surfaces:[{id:'one',width:1,height:1}]},source);
        const mapping=mapSourceRegion({source:{width:1,height:1},box:{x:0,y:0,width:1,height:1},target:{x:0,y:0,width:1,height:1}});
        return {version:core.CONTRACT_VERSION,model:frame.opticalModel,frozen:Object.isFrozen(frame.surfaces[0]),pixels:[...source.data],mapped:mapping.ok};
      });
      assert.deepEqual(result,{version:1,model:'rounded-refraction-v1',frozen:true,pixels:[10,20,30,255],mapped:true});assert.deepEqual(errors,[]);
      receipts.engines.push({name,version:browser.version(),pass:true});
    } catch(error) { receipts.engines.push({name,pass:false,error:error.stack});throw error; }
    finally { await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(`${artifacts}/receipt.json`,JSON.stringify(receipts,null,2)); }
  });
}
