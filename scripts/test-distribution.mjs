import { spawn,execFileSync } from 'node:child_process';
import { readFile,writeFile,mkdir,mkdtemp,cp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest,loadDistribution,integrity,peers } from './distribution-artifacts.mjs';
import { verifiedRegistryIdentities } from './registry-provenance.mjs';

const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--manifest'))throw Error('An exact --manifest is required');
const selected=loadDistribution(value('--manifest')),policy=JSON.parse(await readFile('release/policy.json'));
const local=args.includes('--tarballs');await mkdir('private/phase-12/consumers',{recursive:true});const dir=await mkdtemp(path.resolve('private/phase-12/consumers/run-'));
const receipt={schemaVersion:1,startedAt:new Date().toISOString(),mode:local?'frozen-tarballs':'exact-registry',version:selected.bundle.version,manifestSha256:digest(await readFile(selected.file)),sourceCommit:selected.bundle.source.commit,producerSha256:digest(await readFile('scripts/test-distribution.mjs')),checks:[],registry:[],pass:false,published:false};
let manifestFile=selected.file,consumer;
async function command(exe,params,log,options={}) {
  const child=spawn(exe,params,{cwd:options.cwd??process.cwd(),env:{...process.env,npm_config_ignore_scripts:'true',...(options.env??{})},stdio:['ignore','pipe','pipe']}),chunks=[],stdout=[];
  child.stdout.on('data',b=>{chunks.push(b);stdout.push(b);});child.stderr.on('data',b=>chunks.push(b));let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},1200000);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timer);
  const output=Buffer.concat(chunks).toString();await writeFile(path.join(dir,log),output);
  if(code!==0||timedOut)throw Error(log+' failed: '+code+(timedOut?' timeout':''));return options.stdoutOnly?Buffer.concat(stdout).toString():output;
}
try {
  if(!local) {
    if(process.version!=='v'+policy.node||execFileSync('npm',['--version'],{encoding:'utf8'}).trim()!==policy.npm)throw Error('Use the exact registry-verification Node/npm toolchain');
    const fetched=path.join(dir,'registry-artifacts');await mkdir(fetched);
    for(const name of ['policy.json','support.json'])await cp(path.join(path.dirname(selected.file),name),path.join(fetched,name));
    for(const artifact of selected.bundle.artifacts) {
      const packageName='@liquid-glass-forge/'+artifact.name;
      const response=await fetch(policy.registry+'/'+encodeURIComponent(packageName)+'/'+encodeURIComponent(selected.bundle.version),{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('Exact registry package unavailable: '+packageName+'@'+selected.bundle.version+' HTTP '+response.status);
      const metadata=await response.json();await writeFile(path.join(dir,artifact.name+'-registry.json'),JSON.stringify(metadata,null,2));
      const url=new URL(metadata.dist?.tarball);
      if(metadata.name!==packageName||metadata.version!==selected.bundle.version||metadata.dist.integrity!==artifact.integrity||url.origin!==policy.registry)throw Error('Registry identity/integrity mismatch: '+packageName);
      const download=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!download.ok)throw Error('Tarball download failed');const bytes=Buffer.from(await download.arrayBuffer());
      if(digest(bytes)!==artifact.sha256||integrity(bytes)!==artifact.integrity)throw Error('Registry changed approved tarball bytes');
      await writeFile(path.join(fetched,artifact.tarball),bytes);
      if(!metadata.dist.signatures?.length||!metadata.dist.attestations?.url)throw Error('Registry signature/provenance metadata missing');
      const attestUrl=new URL(metadata.dist.attestations.url);if(attestUrl.origin!==policy.registry)throw Error('Unexpected attestation host');
    }
    manifestFile=path.join(fetched,'manifest.json');await writeFile(manifestFile,JSON.stringify(selected.bundle,null,2));loadDistribution(manifestFile);
    consumer=await mkdtemp(path.join(tmpdir(),'lgf-registry-signatures-'));await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true}));
    await writeFile(path.join(consumer,'.npmrc'),'registry='+policy.registry+'\n@liquid-glass-forge:registry='+policy.registry+'\nignore-scripts=true\n');
    await command('npm',['install','--ignore-scripts','--no-audit','--no-fund','--save-exact',...selected.bundle.artifacts.map(a=>'@liquid-glass-forge/'+a.name+'@'+selected.bundle.version),...Object.entries({...peers,'@angular/compiler':'22.2.4',tslib:'2.9.1'}).map(([n,v])=>n+'@'+v)],'registry-install.txt',{cwd:consumer});
    for(const a of selected.bundle.artifacts)for(const [file,hash]of Object.entries(a.fileSha256))if(digest(await readFile(path.join(consumer,'node_modules/@liquid-glass-forge',a.name,file)))!==hash)throw Error('Registry install differs from approved artifact');
    const audit=JSON.parse(await command('npm',['audit','signatures','--json','--include-attestations'],'registry-signatures.txt',{cwd:consumer,stdoutOnly:true}));
    await writeFile(path.join(dir,'registry-signatures.json'),JSON.stringify(audit,null,2));
    const authenticatedBundle=structuredClone(selected.bundle);
    for(const a of authenticatedBundle.artifacts)a.sha512=digest(await readFile(path.join(fetched,a.tarball)),'sha512');
    receipt.registry=verifiedRegistryIdentities(audit,authenticatedBundle,policy);
    await cp(path.join(consumer,'package-lock.json'),path.join(dir,'registry-package-lock.json'));
    receipt.signaturesVerified=true;
  }
  for(const script of ['test-react.mjs','test-vue.mjs','test-angular.mjs','test-resilience.mjs']) {
    console.log(receipt.mode,script);
    const output=await command(process.execPath,['scripts/'+script],script+'.txt',{env:{LGF_DISTRIBUTION_MANIFEST:manifestFile}});
    const final=[...output.matchAll(/\{"dir":"([^"\n]+)","pass":true\}/g)].at(-1);
    if(!final)throw Error('Missing positive consumer receipt: '+script);
    const file=path.join(final[1],'receipt.json'),result=JSON.parse(await readFile(file));
    if(result.pass!==true||result.artifacts.some(a=>!selected.bundle.artifacts.some(b=>a.name===b.name&&a.sha256===b.sha256)))throw Error('Consumer did not use the exact distribution');
    receipt.checks.push({script,receipt:path.relative(process.cwd(),file),sha256:digest(await readFile(file)),groups:result.checks.length,pass:true});
  }
  receipt.pass=true;
}catch(error){receipt.error=error.stack;process.exitCode=1;}
finally{if(consumer)await rm(consumer,{recursive:true,force:true});receipt.endedAt=new Date().toISOString();await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({dir,mode:receipt.mode,pass:receipt.pass,error:receipt.error}));}
