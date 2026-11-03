import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditPackage } from './package-audit.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export const packageFiles = {
  angular: ['LICENSE','NOTICE','README.md','package.json','types/liquid-glass-forge-angular.d.ts','fesm2022/liquid-glass-forge-angular.mjs','fesm2022/liquid-glass-forge-angular.mjs.map'].sort(),
  vue: ['LICENSE','NOTICE','README.md','dist/index.d.ts','dist/index.js','package.json'].sort(),
  react: ['LICENSE','NOTICE','README.md','dist/index.d.ts','dist/index.js','package.json'].sort(),
  core: ['LICENSE','NOTICE','README.md','dist/index.d.ts','dist/index.js','package.json'].sort(),
  cpu: ['LICENSE','NOTICE','README.md','package.json',...['index','kernel','executor','protocol','worker'].flatMap(n=>['dist/'+n+'.js','dist/'+n+'.d.ts']),...['core','kernel','protocol'].map(n=>'dist/worker-'+n+'.js')].sort(),
  webgl: ['LICENSE','NOTICE','README.md','package.json',...['index','atlas','shaders','effects','dom'].flatMap(n=>['dist/'+n+'.js','dist/'+n+'.d.ts'])].sort(),
  dom: ['LICENSE','NOTICE','README.md','dist/index.d.ts','dist/index.js','dist/cpu.d.ts','dist/cpu.js','dist/providers.d.ts','dist/providers.js','dist/mapping.d.ts','dist/mapping.js','dist/host.d.ts','dist/host.js','dist/scene.d.ts','dist/scene.js','dist/styles.css','package.json'].sort()
};
function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 2*1024*1024,
    env: { ...process.env, npm_config_update_notifier: 'false' } });
  if (r.error || r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${r.status}):\n${r.error?.message ?? ''}\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  return r.stdout;
}
const assert = (ok, text) => { if (!ok) throw new Error(text); };
export async function packSmoke() {
  const names=Object.keys(packageFiles).filter(n=>n!=='angular'||!process.argv.includes('--base'));
  const angular=names.includes('angular');
  const base = path.join(root, 'private/phase-3/pack'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'run-'));
  const receipt = { schemaVersion: 2, startedAt: new Date().toISOString(), artifacts: [], checks: {} };
  const versions = Object.fromEntries(await Promise.all(names.map(async name => {
    const m = JSON.parse(await readFile(path.join(root, `packages/${name}/package.json`))); return [m.name, m.version];
  })));
  let consumer, peerCache;
  try {
    for (const name of names) {
      const allowed=packageFiles[name];
      for (const iteration of ['first','second']) {
        const destination = path.join(dir, `${name}-${iteration}`); await mkdir(destination);
        const output = run('npm', ['pack','--json','--ignore-scripts','--pack-destination',destination], path.join(root, `packages/${name}${name==='angular'?'/dist':''}`));
        await writeFile(path.join(dir, `${name}-${iteration}-npm-pack.json`), output);
        const packed = JSON.parse(output); assert(packed.length === 1, 'Expected one tarball'); const metadata = packed[0];
        assert(typeof metadata.filename === 'string' && path.basename(metadata.filename) === metadata.filename, 'Unsafe tarball filename');
        const tarball = path.join(destination, metadata.filename);
        const entries = run('tar', ['-tzf',tarball], root).trim().split('\n');
        assert(entries.every(e => e.startsWith('package/')), 'Entry outside package/');
        const files = entries.map(e => e.slice(8)).sort();
        assert(JSON.stringify(files) === JSON.stringify(allowed), `Unexpected ${name} files: ${JSON.stringify(files)}`);
        assert(JSON.stringify(metadata.files.map(f => f.path).sort()) === JSON.stringify(files), 'Physical inventory differs');
        const manifest = JSON.parse(run('tar', ['-xOf',tarball,'package/package.json'], root));
        assert(manifest.name === `@liquid-glass-forge/${name}`, 'Unexpected manifest name');
        auditPackage(manifest, files, { internalVersions: versions, installedPeers: {react:'19.3.1','react-dom':'19.3.1',vue:'3.5.44','@angular/core':'22.2.4','@angular/common':'22.2.4',rxjs:'7.8.2'} });
        for (const notice of ['LICENSE','NOTICE','README.md']) assert(run('tar',['-xOf',tarball,`package/${notice}`],root).trim(), `Empty ${notice}`);
        receipt.artifacts.push({ package: name, iteration, tarball: path.relative(root,tarball),
          sha256: createHash('sha256').update(await readFile(tarball)).digest('hex'), npmIntegrity: metadata.integrity, files });
      }
      const pair = receipt.artifacts.filter(a => a.package === name); assert(pair[0].sha256 === pair[1].sha256, `${name} is not reproducible`);
    }
    receipt.checks.reproducible = true; receipt.checks.artifactAudit = true;
    // Stage external peer dependencies, then prove our actual package install offline.
    peerCache=await mkdtemp(path.join(tmpdir(),'lgf-peer-cache-'));
    await writeFile(path.join(peerCache,'package.json'),JSON.stringify({private:true}));
    await writeFile(path.join(dir,'peer-cache-install.txt'),run('npm',['install','--ignore-scripts','--prefer-online','--no-audit','--no-fund','--save-exact','react@19.3.1','react-dom@19.3.1','vue@3.5.44',...(angular?['@angular/core@22.2.4','@angular/common@22.2.4','@angular/compiler@22.2.4','rxjs@7.8.2','tslib@2.9.1']:[])],peerCache));
    await writeFile(path.join(dir,'peer-cache-lock.json'),await readFile(path.join(peerCache,'package-lock.json')));
    consumer = await mkdtemp(path.join(tmpdir(), 'liquid-glass-forge-consumer-'));
    const consumerReal = await realpath(consumer), rootReal = await realpath(root);
    assert(consumerReal !== rootReal && !consumerReal.startsWith(rootReal + path.sep), 'Consumer must be outside repository');
    await writeFile(path.join(consumer,'package.json'), JSON.stringify({ name:'independent-package-smoke',private:true,type:'module' }));
    const tarballs = receipt.artifacts.filter(a => a.iteration === 'first').map(a => path.join(root,a.tarball));
    await writeFile(path.join(dir,'consumer-install.txt'), run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--save=false',...tarballs,...(angular?['@angular/compiler@22.2.4']:[])],consumer));
    for(const [name,version] of Object.entries({react:'19.3.1','react-dom':'19.3.1',vue:'3.5.44'}))assert(JSON.parse(await readFile(path.join(consumer,'node_modules',name,'package.json'))).version===version,'Installed peer version differs');
    for (const name of names) {const files=packageFiles[name];
      const installed = path.join(consumer, `node_modules/@liquid-glass-forge/${name}`), installedReal = await realpath(installed);
      assert(!(await lstat(installed)).isSymbolicLink() && installedReal.startsWith(consumerReal+path.sep), 'Expected physical installed package');
      for (const file of files) {
        const entry = path.join(installed,file);
        assert(!(await lstat(entry)).isSymbolicLink() && (await realpath(entry)).startsWith(installedReal+path.sep), `Unsafe installed entry: ${file}`);
      }
    }
    await writeFile(path.join(consumer,'smoke.mjs'), `import assert from 'node:assert/strict';
await import('react');await import('vue');${angular?"await import('@angular/compiler');await import('@angular/core');await import('@angular/common');await import('@angular/core/rxjs-interop');":''}
const descriptors = new Map();
for (const name of ['window','document','navigator','Worker','OffscreenCanvas','requestAnimationFrame','queueMicrotask','ResizeObserver','IntersectionObserver','matchMedia','fetch','XMLHttpRequest','WebSocket','setTimeout','setInterval']) {
  descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,name,{ configurable:true,get(){throw new Error('Import touched '+name);} });
}
${angular?"const angularAdapter=await import('@liquid-glass-forge/angular');assert.equal(typeof angularAdapter.GlassSurfaceComponent,'function');":''}
const vueAdapter=await import('@liquid-glass-forge/vue');assert.equal(typeof vueAdapter.useGlassSurface,'function');
const adapter=await import('@liquid-glass-forge/react');assert.equal(typeof adapter.GlassSceneProvider,'function');assert.equal(typeof adapter.useGlassSurface,'function');
const core = await import('@liquid-glass-forge/core');
const gpu=await import('@liquid-glass-forge/webgl');
const optical=await import('@liquid-glass-forge/webgl/dom');
new gpu.WebGLAtlas().dispose();optical.createWebGLRenderer().dispose();optical.createOpticalRenderer({backend:'auto',fallback:'material'}).dispose();
const {CpuExecutor,prepareCpuSource,renderCpu,disposeCpuSource}=await import('@liquid-glass-forge/cpu');
assert.equal(typeof CpuExecutor,'function');
const { SourceProvider, mapSourceRegion, createGlassScene, mountGlassHost, createCpuRenderer } = await import('@liquid-glass-forge/dom');
assert.equal(typeof createGlassScene,'function');assert.equal(typeof createCpuRenderer,'function');assert.equal(typeof mountGlassHost,'function');
for (const [name, descriptor] of descriptors) { if(descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name]; }
assert.equal(core.CONTRACT_VERSION,1);
for (const name of ${JSON.stringify(names)}) await assert.rejects(import('@liquid-glass-forge/'+name+'/dist/index.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
const pixel=core.createSource({contractVersion:1,width:1,height:1,revision:0,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight',data:new Uint8Array([20,40,60,255])});const prepared=prepareCpuSource(pixel);assert.deepEqual([...renderCpu(prepared,{id:'one',width:1,height:1,radius:0,strength:0})],[20,40,60,255]);disposeCpuSource(prepared);
const bytes=new Uint8Array([10,20,30,255]), p=new SourceProvider({kind:'pixels',width:1,height:1,data:bytes});
const pending=p.read();bytes[0]=99;assert.deepEqual([...(await pending).source.data],[10,20,30,255]);p.destroy();
assert.equal(typeof mapSourceRegion,'function');
assert.equal(mapSourceRegion({source:{width:1,height:1},box:{x:0,y:0,width:1,height:1},target:{x:0,y:0,width:1,height:1}}).ok,true);
console.log('${names.length} installed ESM/types surfaces, SSR import traps, deep exports and owned pixels passed');
`);
    await writeFile(path.join(consumer,'consumer.mts'), `import { CpuExecutor, type CpuEffects } from '@liquid-glass-forge/cpu';
import { CONTRACT_VERSION, type PixelSource, type FrameDescriptor } from '@liquid-glass-forge/core';
import { SourceProvider, mapSourceRegion, createGlassScene, mountGlassHost, type GlassRenderer, type SourceSpec, type MappingInput, type MappingResult } from '@liquid-glass-forge/dom';
import { WebGLAtlas, type WebGLEffects } from '@liquid-glass-forge/webgl';
import { createWebGLRenderer, createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
const gpuAdapter:GlassRenderer=createWebGLRenderer({effects:{model:'rounded-material-v1',blurRadius:2}});
new WebGLAtlas({maxRestores:2}).dispose();
// @ts-expect-error exact backend policy
createOpticalRenderer({backend:'vulkan'});
// @ts-expect-error versioned effect model
const invalidGPU:WebGLEffects={model:'future-model'};
const version: 1=CONTRACT_VERSION;
const executor=new CpuExecutor({worker:'off'});executor.dispose();
// @ts-expect-error exact worker policy must not become any
new CpuExecutor({worker:'webgl'});
const effects:CpuEffects={model:'rounded-material-v1',blurRadius:1};
// @ts-expect-error literal type must remain precise
const invalidVersion: 2=CONTRACT_VERSION;
const spec: SourceSpec={kind:'pixels',width:1,height:1,data:new Uint8Array(4)};
const provider=new SourceProvider(spec);
// @ts-expect-error provider type must reject an unsupported source kind
new SourceProvider({kind:'dom-capture'});
const result: MappingResult=mapSourceRegion({source:{width:1,height:1},box:{x:0,y:0,width:1,height:1},target:{x:0,y:0,width:1,height:1}} satisfies MappingInput);
if(result.ok) { const x:number=result.crop.x; }
export function publicTypes(source:PixelSource,frame:FrameDescriptor):[PixelSource,FrameDescriptor,1] { return [source,frame,version]; }
const materialScene=createGlassScene();materialScene.dispose();
const adapter:GlassRenderer={render(request,signal){return {width:request.width,height:request.height,data:new Uint8Array(request.width*request.height*4)};}};
// @ts-expect-error public lifecycle/material input is not any
createGlassScene({renderer:adapter,timeoutMs:'forever'});
// @ts-expect-error mount material input must retain its literal union
mountGlassHost(document.createElement('div'),{material:'invisible'});
provider.destroy();
`);
    await writeFile(path.join(dir,'consumer-import.txt'),run(process.execPath,['smoke.mjs'],consumer));
    await writeFile(path.join(dir,'consumer-types.txt'),run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','consumer.mts'],consumer));
    Object.assign(receipt.checks,{offlineInstall:true,physicalConsumer:true,esmImport:true,deepImportRejected:true,types:true,ssrImport:true});
    receipt.status='passed';
  } catch (error) { receipt.status='failed';receipt.error=error.stack;throw error; }
  finally { if(peerCache)await rm(peerCache,{recursive:true,force:true});if(consumer) await rm(consumer,{recursive:true,force:true}); receipt.completedAt=new Date().toISOString();await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)); }
  console.log(`${names.length} package smoke checks passed; receipt: ${path.relative(root,path.join(dir,'receipt.json'))}`); return receipt;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) packSmoke().catch(e=>{console.error(e);process.exitCode=1;});
