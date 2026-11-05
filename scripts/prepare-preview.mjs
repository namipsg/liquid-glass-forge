import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {digest,integrity,inspectTarball} from './distribution-artifacts.mjs';

const policy=JSON.parse(await readFile('release/preview-policy.json'));
if(policy.testsDeferred!==true||policy.qualifiedRelease!==false||policy.tag!=='next')throw Error('Explicit experimental preview policy required');
await mkdir('private/preview',{recursive:true});const dir=await mkdtemp(path.resolve('private/preview/release-'));
const command=(exe,args,options={})=>execFileSync(exe,args,{encoding:'utf8',timeout:240000,maxBuffer:10e6,env:{...process.env,npm_config_ignore_scripts:'true',NG_CLI_ANALYTICS:'false'},...options});
const sources={};for(const file of command('git',['ls-files','--cached','--others','--exclude-standard']).trim().split('\n').sort())sources[file]=digest(await readFile(file));
const bundle={schemaVersion:1,kind:'experimental-preview',version:policy.version,tag:policy.tag,qualified:false,testsDeferred:true,repositoryUpdateDeferred:true,provenance:'not claimed',
  preparedAt:new Date().toISOString(),policySha256:digest(await readFile('release/preview-policy.json')),baselineCommit:command('git',['rev-parse','HEAD']).trim(),workingTree:{files:sources,sha256:digest(Buffer.from(JSON.stringify(sources)))},artifacts:[]};
await writeFile(path.join(dir,'build.txt'),command(process.execPath,['scripts/build.mjs']));
for(const name of policy.packages){
  const cwd=path.resolve('packages',name,name==='angular'?'dist':'');
  const metadata=JSON.parse(command('npm',['pack','--json','--ignore-scripts','--pack-destination',dir],{cwd}))[0];
  const tarball=path.basename(metadata.filename),file=path.join(dir,tarball),bytes=await readFile(file),inspected=inspectTarball(file,name,policy.version);
  if(inspected.manifest.private!==false||inspected.manifest.gitHead)throw Error('Incorrect preview metadata');
  bundle.artifacts.push({name,tarball,sha256:digest(bytes),integrity:integrity(bytes),fileSha256:inspected.fileSha256});
}
await writeFile(path.join(dir,'policy.json'),await readFile('release/preview-policy.json'));
await writeFile(path.join(dir,'manifest.json'),JSON.stringify(bundle,null,2)+'\n');
console.log(JSON.stringify({manifest:path.join(dir,'manifest.json'),manifestSha256:digest(await readFile(path.join(dir,'manifest.json'))),version:bundle.version,qualified:false,testsRun:false}));
