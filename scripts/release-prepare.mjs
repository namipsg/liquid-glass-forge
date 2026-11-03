import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { packageFiles } from './pack-smoke.mjs';
import { digest, integrity, inspectTarball, releaseBlockers } from './distribution-artifacts.mjs';

const args=process.argv.slice(2), value=flag=>args[args.indexOf(flag)+1];
const policy=JSON.parse(await readFile('release/policy.json'));
const command=(exe,params)=>execFileSync(exe,params,{encoding:'utf8',timeout:240000,maxBuffer:10e6,env:{...process.env,npm_config_ignore_scripts:'true',NG_CLI_ANALYTICS:'false'}});
if(process.version!=='v'+policy.node||command('npm',['--version']).trim()!==policy.npm||command('pnpm',['--version']).trim()!==policy.pnpm)throw Error('Use the exact release Node/npm/pnpm toolchain');
const parent='private/phase-12/bundles';await mkdir(parent,{recursive:true});
const dir=args.includes('--output')?path.resolve(value('--output')):await mkdtemp(path.resolve(parent,'run-'));
await mkdir(dir,{recursive:true});
if((await readdir(dir)).length)throw Error('Refusing to overwrite an existing artifact bundle');
const git=(...a)=>command('git',a).trim();
const sources={};for(const file of git('ls-files','--cached','--others','--exclude-standard').split('\n').sort())sources[file]=digest(await readFile(file));
const versions=await Promise.all(Object.keys(packageFiles).map(async name=>JSON.parse(await readFile('packages/'+name+'/package.json')).version));
if(new Set(versions).size!==1)throw Error('All seven package versions must be synchronized');
const version=versions[0], privateFlags=await Promise.all(Object.keys(packageFiles).map(async name=>JSON.parse(await readFile('packages/'+name+'/package.json')).private));
const bundle={schemaVersion:1,kind:privateFlags.every(p=>p===false)?'release-candidate':'private-rehearsal',version,
  source:{commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),clean:git('status','--porcelain')==='',files:sources,sha256:digest(Buffer.from(JSON.stringify(sources)))},
  tooling:{node:process.version,npm:policy.npm,pnpm:policy.pnpm},artifacts:[],reproducible:false,preparationPassed:false,releaseReady:false};
await writeFile(path.join(dir,'policy.json'),await readFile('release/policy.json'));
await writeFile(path.join(dir,'support.json'),await readFile('docs/SUPPORT.json'));
bundle.policySha256=digest(await readFile('release/policy.json'));bundle.supportSha256=digest(await readFile('docs/SUPPORT.json'));
try {
  for(const iteration of ['first','rebuilt']) {
    console.log('Independent build and pack:',iteration);
    await writeFile(path.join(dir,iteration+'-build.txt'),command(process.execPath,['scripts/build.mjs']));
    const output=iteration==='first'?dir:path.join(dir,'rebuilt');await mkdir(output,{recursive:true});
    for(const name of Object.keys(packageFiles)) {
      const cwd=path.resolve('packages',name,name==='angular'?'dist':'');
      const metadata=JSON.parse(execFileSync('npm',['pack','--json','--ignore-scripts','--pack-destination',output],{cwd,encoding:'utf8',timeout:30000}))[0];
      if(path.basename(metadata.filename)!==metadata.filename)throw Error('Unsafe pack filename');
      const tarball=path.join(output,metadata.filename), bytes=await readFile(tarball), inspected=inspectTarball(tarball,name,version);
      if(metadata.integrity!==integrity(bytes))throw Error('npm integrity mismatch');
      if(iteration==='first')bundle.artifacts.push({name,tarball:metadata.filename,sha256:digest(bytes),integrity:integrity(bytes),private:inspected.manifest.private===true,fileSha256:inspected.fileSha256});
      else if(bundle.artifacts.find(a=>a.name===name).sha256!==digest(bytes))throw Error('Independent rebuild differs: '+name);
    }
  }
  bundle.reproducible=true;bundle.preparationPassed=true;
  bundle.releaseBlockers=releaseBlockers(bundle,policy,JSON.parse(await readFile('docs/SUPPORT.json')));
  bundle.releaseReady=bundle.releaseBlockers.length===0;
}catch(error){bundle.error=error.stack;process.exitCode=1;}
await writeFile(path.join(dir,'manifest.json'),JSON.stringify(bundle,null,2)+'\n');
console.log(JSON.stringify({manifest:path.relative(process.cwd(),path.join(dir,'manifest.json')),preparationPassed:bundle.preparationPassed,releaseReady:bundle.releaseReady,blockers:bundle.releaseBlockers,error:bundle.error}));
