import{execFileSync}from'node:child_process';import{mkdtemp,mkdir,writeFile,readFile,cp,rm,lstat,readdir}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{createHash}from'node:crypto';import{consumerPackage,loadDistribution,inspectTarball}from'./distribution-artifacts.mjs';
import{loadPreview}from'./preview-artifacts.mjs';
import{writeShowcaseSupport}from'./showcase-support-data.mjs';
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1],root=process.cwd(),parent='private/showcase';await mkdir(parent,{recursive:true});const dir=await mkdtemp(path.resolve(parent,'build-')),consumer=await mkdtemp(path.join(tmpdir(),'lgf-showcase-'));
let preview;const publicShowcase=args.includes('--pages'),localCandidate=!args.includes('--preview')&&!args.includes('--manifest');
if((args.includes('--working-tree')||publicShowcase)&&!localCandidate)throw Error('Working-tree candidate cannot use a sealed manifest');
const receipt={pass:false,localCandidate,publicShowcase,startedAt:new Date().toISOString(),artifacts:[],sources:{},temporaryConsumer:consumer};const sha=b=>createHash('sha256').update(b).digest('hex');const previous=process.env.LGF_DISTRIBUTION_MANIFEST;
try{
 if(args.includes('--preview')){preview=loadPreview(value('--preview'));receipt.previewManifestSha256=sha(await readFile(preview.file));}
 if(args.includes('--manifest')){const selected=loadDistribution(value('--manifest'));process.env.LGF_DISTRIBUTION_MANIFEST=selected.file;receipt.manifestSha256=sha(await readFile(selected.file));}
 if(localCandidate){receipt.engineSources={};for(const file of ['packages/cpu/src/kernel.ts','packages/dom/src/cpu.ts','packages/webgl/src/effects.ts','packages/webgl/src/shaders.ts','packages/webgl/src/atlas.ts'])receipt.engineSources[file]=sha(await readFile(file));}
 const tarballs=[];for(const name of ['core','cpu','dom','webgl']){let file;if(preview){const a=preview.bundle.artifacts.find(a=>a.name===name);file=path.join(dir,a.tarball);await cp(path.join(path.dirname(preview.file),a.tarball),file);}else{const meta=consumerPackage(name,dir);file=path.join(dir,meta.filename);}tarballs.push(file);receipt.artifacts.push({name,file:path.relative(root,file),sha256:sha(await readFile(file))});}
 const version=JSON.parse(execFileSync('tar',['-xOf',tarballs[0],'package/package.json'],{encoding:'utf8'})).version;
 const names=['core','cpu','dom','webgl','react','vue','angular'];
 async function published(candidate){
  try{
   const responses=await Promise.all(names.map(name=>fetch('https://registry.npmjs.org/@liquid-glass-forge%2f'+name+'/'+encodeURIComponent(candidate),{signal:AbortSignal.timeout(10000)})));
   if(responses.some(r=>!r.ok))return false;
   const records=await Promise.all(responses.map(r=>r.json()));
   return records.every((record,i)=>record.name==='@liquid-glass-forge/'+names[i]&&record.version===candidate&&(!preview||record.dist?.integrity===preview.bundle.artifacts.find(a=>a.name===names[i]).integrity));
  }catch{return false;}
 }
 let installVersion;
 if(publicShowcase||!localCandidate){
  if(await published(version))installVersion=version;
  else if(publicShowcase){
   const initial=JSON.parse(await readFile('release/preview-policy.json')).version;
   if(initial!==version&&await published(initial))installVersion=initial;
  }
 }
 await writeShowcaseSupport({version,installVersion,localCandidate,publicShowcase});
 async function fingerprint(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['dist','node_modules'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await fingerprint(file);else if(entry.isFile())receipt.sources[file]=sha(await readFile(file));}}await fingerprint('showcase');
 await cp('showcase',consumer,{recursive:true,filter:source=>!source.split(path.sep).includes('dist')});await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 const command=(exe,params,log)=>{const result=execFileSync(exe,params,{cwd:consumer,encoding:'utf8',timeout:480000,maxBuffer:10e6,env:{...process.env,npm_config_ignore_scripts:'true'}});return writeFile(path.join(dir,log),result);};
 await command('npm',['install','--ignore-scripts','--prefer-offline','--no-audit','--no-fund','--save-exact',...tarballs,'vite@8.3.5'],'install.txt');
 for(const a of receipt.artifacts){const folder=path.join(consumer,'node_modules/@liquid-glass-forge',a.name);if((await lstat(folder)).isSymbolicLink())throw Error('Expected physical package');const manifest=JSON.parse(await readFile(path.join(folder,'package.json')));a.version=manifest.version;if(a.version!==version)throw Error('Showcase package versions differ: '+a.name);const inspected=inspectTarball(path.join(root,a.file),a.name,a.version);for(const [file,expected]of Object.entries(inspected.fileSha256))if(sha(await readFile(path.join(folder,file)))!==expected)throw Error('Installed showcase bytes differ: '+a.name+'/'+file);}
 await cp(path.join(consumer,'package-lock.json'),path.join(dir,'package-lock.json'));
 await command(process.execPath,['node_modules/vite/bin/vite.js','build','--base','./'],'build.txt');
 const installable=!!installVersion;
 await writeFile(path.join(consumer,'dist/release.json'),JSON.stringify({version,installable,installVersion,localCandidate,publicShowcase}));await cp(path.join(consumer,'dist'),path.join(dir,'www'),{recursive:true});await rm('showcase/dist',{recursive:true,force:true});await cp(path.join(dir,'www'),'showcase/dist',{recursive:true});receipt.pass=true;receipt.assets=path.relative(root,path.join(dir,'www'));receipt.version=version;receipt.installable=installable;receipt.installVersion=installVersion;
}catch(error){receipt.error=error.stack;process.exitCode=1;}finally{if(previous===undefined)delete process.env.LGF_DISTRIBUTION_MANIFEST;else process.env.LGF_DISTRIBUTION_MANIFEST=previous;await rm(consumer,{recursive:true,force:true});receipt.endedAt=new Date().toISOString();await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({dir,pass:receipt.pass,error:receipt.error}));}
