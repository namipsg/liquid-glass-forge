import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditPackage } from './package-audit.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export const packageFiles = {
  core: ['LICENSE','NOTICE','README.md','dist/index.d.ts','dist/index.js','package.json'].sort(),
  dom: ['LICENSE','NOTICE','README.md','dist/index.d.ts','dist/index.js','dist/providers.d.ts','dist/providers.js','dist/mapping.d.ts','dist/mapping.js','package.json'].sort()
};
function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 2*1024*1024,
    env: { ...process.env, npm_config_update_notifier: 'false' } });
  if (r.error || r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${r.status}):\n${r.error?.message ?? ''}\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  return r.stdout;
}
const assert = (ok, text) => { if (!ok) throw new Error(text); };
export async function packSmoke() {
  const base = path.join(root, 'private/phase-3/pack'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'run-'));
  const receipt = { schemaVersion: 2, startedAt: new Date().toISOString(), artifacts: [], checks: {} };
  const versions = Object.fromEntries(await Promise.all(Object.keys(packageFiles).map(async name => {
    const m = JSON.parse(await readFile(path.join(root, `packages/${name}/package.json`))); return [m.name, m.version];
  })));
  let consumer;
  try {
    for (const [name, allowed] of Object.entries(packageFiles)) {
      for (const iteration of ['first','second']) {
        const destination = path.join(dir, `${name}-${iteration}`); await mkdir(destination);
        const output = run('npm', ['pack','--json','--ignore-scripts','--pack-destination',destination], path.join(root, `packages/${name}`));
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
        auditPackage(manifest, files, { internalVersions: versions });
        for (const notice of ['LICENSE','NOTICE','README.md']) assert(run('tar',['-xOf',tarball,`package/${notice}`],root).trim(), `Empty ${notice}`);
        receipt.artifacts.push({ package: name, iteration, tarball: path.relative(root,tarball),
          sha256: createHash('sha256').update(await readFile(tarball)).digest('hex'), npmIntegrity: metadata.integrity, files });
      }
      const pair = receipt.artifacts.filter(a => a.package === name); assert(pair[0].sha256 === pair[1].sha256, `${name} is not reproducible`);
    }
    receipt.checks.reproducible = true; receipt.checks.artifactAudit = true;
    consumer = await mkdtemp(path.join(tmpdir(), 'liquid-glass-forge-consumer-'));
    const consumerReal = await realpath(consumer), rootReal = await realpath(root);
    assert(consumerReal !== rootReal && !consumerReal.startsWith(rootReal + path.sep), 'Consumer must be outside repository');
    await writeFile(path.join(consumer,'package.json'), JSON.stringify({ name:'independent-package-smoke',private:true,type:'module' }));
    const tarballs = receipt.artifacts.filter(a => a.iteration === 'first').map(a => path.join(root,a.tarball));
    await writeFile(path.join(dir,'consumer-install.txt'), run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--save=false',...tarballs],consumer));
    for (const [name,files] of Object.entries(packageFiles)) {
      const installed = path.join(consumer, `node_modules/@liquid-glass-forge/${name}`), installedReal = await realpath(installed);
      assert(!(await lstat(installed)).isSymbolicLink() && installedReal.startsWith(consumerReal+path.sep), 'Expected physical installed package');
      for (const file of files) {
        const entry = path.join(installed,file);
        assert(!(await lstat(entry)).isSymbolicLink() && (await realpath(entry)).startsWith(installedReal+path.sep), `Unsafe installed entry: ${file}`);
      }
    }
    await writeFile(path.join(consumer,'smoke.mjs'), `import assert from 'node:assert/strict';
const descriptors = new Map();
for (const name of ['window','document','navigator','Worker','OffscreenCanvas','requestAnimationFrame','fetch','XMLHttpRequest','WebSocket','setTimeout','setInterval']) {
  descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,name,{ configurable:true,get(){throw new Error('Import touched '+name);} });
}
const core = await import('@liquid-glass-forge/core');
const { SourceProvider, mapSourceRegion } = await import('@liquid-glass-forge/dom');
for (const [name, descriptor] of descriptors) { if(descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name]; }
assert.equal(core.CONTRACT_VERSION,1);
for (const name of ['core','dom']) await assert.rejects(import('@liquid-glass-forge/'+name+'/dist/index.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
const bytes=new Uint8Array([10,20,30,255]), p=new SourceProvider({kind:'pixels',width:1,height:1,data:bytes});
const pending=p.read();bytes[0]=99;assert.deepEqual([...(await pending).source.data],[10,20,30,255]);p.destroy();
assert.equal(typeof mapSourceRegion,'function');
assert.equal(mapSourceRegion({source:{width:1,height:1},box:{x:0,y:0,width:1,height:1},target:{x:0,y:0,width:1,height:1}}).ok,true);
console.log('Both installed ESM/types surfaces, SSR import traps, deep exports and owned pixels passed');
`);
    await writeFile(path.join(consumer,'consumer.mts'), `import { CONTRACT_VERSION, type PixelSource, type FrameDescriptor } from '@liquid-glass-forge/core';
import { SourceProvider, mapSourceRegion, type SourceSpec, type MappingInput, type MappingResult } from '@liquid-glass-forge/dom';
const version: 1=CONTRACT_VERSION;
// @ts-expect-error literal type must remain precise
const invalidVersion: 2=CONTRACT_VERSION;
const spec: SourceSpec={kind:'pixels',width:1,height:1,data:new Uint8Array(4)};
const provider=new SourceProvider(spec);
// @ts-expect-error provider type must reject an unsupported source kind
new SourceProvider({kind:'dom-capture'});
const result: MappingResult=mapSourceRegion({source:{width:1,height:1},box:{x:0,y:0,width:1,height:1},target:{x:0,y:0,width:1,height:1}} satisfies MappingInput);
if(result.ok) { const x:number=result.crop.x; }
export function publicTypes(source:PixelSource,frame:FrameDescriptor):[PixelSource,FrameDescriptor,1] { return [source,frame,version]; }
provider.destroy();
`);
    await writeFile(path.join(dir,'consumer-import.txt'),run(process.execPath,['smoke.mjs'],consumer));
    await writeFile(path.join(dir,'consumer-types.txt'),run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','consumer.mts'],consumer));
    Object.assign(receipt.checks,{offlineInstall:true,physicalConsumer:true,esmImport:true,deepImportRejected:true,types:true,ssrImport:true});
    receipt.status='passed';
  } catch (error) { receipt.status='failed';receipt.error=error.stack;throw error; }
  finally { if(consumer) await rm(consumer,{recursive:true,force:true}); receipt.completedAt=new Date().toISOString();await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)); }
  console.log(`Both package smoke checks passed; receipt: ${path.relative(root,path.join(dir,'receipt.json'))}`); return receipt;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) packSmoke().catch(e=>{console.error(e);process.exitCode=1;});
