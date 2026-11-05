import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp} from 'node:fs/promises';
import {loadPreview} from './preview-artifacts.mjs';
import {digest,integrity} from './distribution-artifacts.mjs';

const args=process.argv.slice(2),value=f=>args[args.indexOf(f)+1],verifyOnly=args.includes('--verify-only');
for(const f of ['--manifest','--manifest-sha256',...verifyOnly?[]:['--userconfig']])if(!args.includes(f))throw Error(f+' required');
const {file,bundle}=loadPreview(value('--manifest'));
if(digest(await readFile(file))!==value('--manifest-sha256'))throw Error('Exact sealed preview manifest required');
const policy=JSON.parse(await readFile('release/preview-policy.json'));
if(bundle.policySha256!==digest(await readFile('release/preview-policy.json'))||policy.tag!=='next'||policy.qualifiedRelease!==false||policy.owner!=='namipsg')throw Error('Preview authorization changed');
const userconfig=verifyOnly?undefined:path.resolve(value('--userconfig'));
if(!verifyOnly&&!userconfig.startsWith(path.resolve('private/preview')+path.sep))throw Error('Task-specific npm userconfig required');
if(process.env.NPM_TOKEN||process.env.NODE_AUTH_TOKEN)throw Error('Use only the task-specific interactive login');
const cwd=verifyOnly?undefined:await mkdtemp(path.join(tmpdir(),'lgf-preview-publish-'));
const npm=(a,stdio='pipe')=>execFileSync('npm',[...a,'--registry=https://registry.npmjs.org','--userconfig='+userconfig,'--ignore-scripts','--browser=false'],{cwd,encoding:'utf8',stdio,timeout:600000,maxBuffer:2e6});
if(!verifyOnly&&npm(['whoami']).trim()!==policy.owner)throw Error('Wrong publishing account');
const output=path.join(path.dirname(file),'publication.json');
let receipt;
try {
  const previous=await readFile(output);receipt=JSON.parse(previous);
  if(receipt.manifestSha256!==value('--manifest-sha256'))throw Error('Previous publication belongs to different bytes');
  await writeFile(path.join(path.dirname(file),'publication-attempt-'+Date.now()+'.json'),previous);
}catch(error){if(error.code!=='ENOENT')throw error;}
receipt??={kind:'experimental-preview',manifestSha256:value('--manifest-sha256'),version:bundle.version,tag:'next',qualified:false,testsDeferred:true,provenance:'not claimed',published:[],registry:[]};
(receipt.attempts??=[]).push({at:new Date().toISOString(),verifyOnly,publisherSha256:digest(await readFile(new URL(import.meta.url)))});
if(verifyOnly&&bundle.artifacts.some(a=>!receipt.published.includes(a.name)))throw Error('Read-only verification requires all publication acknowledgements');
const metadataOptions={headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)};
// Preflight all seven immutable versions before making the first registry write.
for(const a of bundle.artifacts){
  const response=await fetch('https://registry.npmjs.org/@liquid-glass-forge%2f'+a.name+'/'+bundle.version);
  if(response.status===404)continue;
  if(!response.ok)throw Error('Registry preflight failed: '+response.status);
  const record=await response.json();if(record.dist?.integrity!==a.integrity)throw Error('Version collision: '+a.name);
}
await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
// Submit the complete set before waiting for npm's publish-time scans. A prior
// successful CLI acknowledgement is retained across retries; never resubmit a
// version merely because its pending scan still returns 404.
for(const a of bundle.artifacts){
  const endpoint='https://registry.npmjs.org/@liquid-glass-forge%2f'+a.name+'/'+bundle.version;
  const response=await fetch(endpoint,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  if(!verifyOnly&&response.status===404&&!receipt.published.includes(a.name)){
    npm(['publish',path.join(path.dirname(file),a.tarball),'--tag=next','--access=public'],'inherit');
    receipt.published.push(a.name);await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
  }else if(!response.ok&&response.status!==404)throw Error('Registry read failed: '+response.status);
}
if(verifyOnly)receipt.registry=[];
const pending=new Map(bundle.artifacts.filter(a=>!receipt.registry.some(r=>r.name===a.name)).map(a=>[a.name,a]));
const deadline=Date.now()+10*60*1000;
while(pending.size&&Date.now()<deadline){
  for(const [name,a]of pending){
    const endpoint='https://registry.npmjs.org/@liquid-glass-forge%2f'+name+'/'+bundle.version;
    const response=await fetch(endpoint,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
    if(response.status===404||response.status===429||response.status>=500)continue;
    if(!response.ok)throw Error('Registry read failed: '+response.status);
    const record=await response.json();if(!record.dist?.integrity)continue;
    if(record.dist.integrity!==a.integrity)throw Error('Published version integrity mismatch: '+name);
    const download=await fetch(record.dist.tarball,{signal:AbortSignal.timeout(30000)});if(!download.ok)continue;
    const bytes=Buffer.from(await download.arrayBuffer());
    if(digest(bytes)!==a.sha256||integrity(bytes)!==a.integrity)throw Error('Published tarball bytes differ: '+name);
    const tagsResponse=await fetch('https://registry.npmjs.org/@liquid-glass-forge%2f'+name,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
    if(!tagsResponse.ok)continue;
    const packument=await tagsResponse.json();
    if(packument['dist-tags']?.next!==bundle.version)continue;
    receipt.registry.push({name,url:'https://www.npmjs.com/package/@liquid-glass-forge/'+name+'/v/'+bundle.version,sha256:digest(bytes),integrity:integrity(bytes),tag:'next',distTags:packument['dist-tags']});
    pending.delete(name);await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
  }
  receipt.pendingScan=[...pending.keys()];await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({accepted:receipt.published,registryConfirmed:receipt.registry.map(a=>a.name),pendingScan:receipt.pendingScan}));
  if(pending.size)await new Promise(r=>setTimeout(r,5000));
}
if(pending.size)throw Error('npm accepted the releases; availability still pending its scan: '+[...pending.keys()].join(', '));
receipt.completedAt=new Date().toISOString();receipt.complete=true;await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({output,complete:true,packages:receipt.registry.length,qualified:false}));
