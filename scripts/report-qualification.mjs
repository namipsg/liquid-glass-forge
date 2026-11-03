import { readFile,readdir,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { qualificationMatrix } from './qualification-gates.mjs';
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--candidate'))throw Error('An exact --candidate receipt is required');
const candidatePath=path.resolve(value('--candidate')),candidate=JSON.parse(await readFile(candidatePath));
const plan=JSON.parse(await readFile('docs/qualification-plan.json')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function records(folder) {
  const results=[];for(const entry of await readdir(folder,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory()) {
    const file=path.join(folder,entry.name,'receipt.json');try {const receipt=JSON.parse(await readFile(file));receipt.receiptPath=file;
      receipt.sourceBindingsValid=Object.keys(receipt.sourceSha256??{}).length>0;
      for(const [source,hash]of Object.entries(receipt.sourceSha256??{}))if(sha(await readFile(source))!==hash)receipt.sourceBindingsValid=false;
      results.push(receipt);}catch(error){if(error.code!=='ENOENT')throw error;}
  }return results;
}
const devices=await records('private/phase-11/devices'),soaks=await records('private/phase-11/soak');
// This runner currently executes only local, headed Google Chrome. Bind that
// identity to the independently observed host; never infer a mobile/GPU host.
const inventoryBytes=await readFile('private/phase-11/inventory-raw.json'),inventory=JSON.parse(inventoryBytes);
const system=JSON.parse(inventory.system.stdout),hardware=system.SPHardwareDataType[0];
for(const soak of soaks) {
  if(hardware.machine_model==='Mac16,10'&&hardware.chip_type==='Apple M4'&&soak.environment?.startsWith('installed headed Google Chrome on local Mac')) {
    soak.environmentId='mac-chrome-m4';soak.hostBinding={model:hardware.machine_model,chip:hardware.chip_type,inventorySha256:sha(inventoryBytes)};
  }
}
const latest=records=>Object.values(records.reduce((acc,r)=>{const key=(r.environment??r.environmentId)+'/'+(r.backend??'device');if(!acc[key]||(r.endedAt??'')>(acc[key].endedAt??''))acc[key]=r;return acc;},{}));
const visualArgs=['scripts/visual-qualification.mjs','--candidate',candidatePath,'--allow-held'];
if(args.includes('--visual-review'))visualArgs.push('--review',value('--visual-review'));
execFileSync(process.execPath,visualArgs);
const visuals=JSON.parse(await readFile('private/phase-11/visual-status.json'));
const result=qualificationMatrix(plan,candidate,latest(devices),latest(soaks),visuals.rows);
result.candidate={receipt:path.relative(process.cwd(),candidatePath),artifacts:candidate.artifacts,planSha256:sha(await readFile('docs/qualification-plan.json'))};
result.evidence={visuals:{receipt:'private/phase-11/visual-status.json',status:visuals.status},devices:latest(devices).map(r=>({environment:r.environment,receipt:r.receiptPath,completed:r.completed,diagnostic:r.diagnostic,sourceBindingsValid:r.sourceBindingsValid})),soaks:latest(soaks).map(r=>({environment:r.environmentId,backend:r.backend,receipt:r.receiptPath,completed:r.completed,diagnostic:r.diagnostic,elapsedMs:r.elapsedMs,sourceBindingsValid:r.sourceBindingsValid}))};
result.claimPolicy='Functional, original admission and sustained-soak evidence are separate. Missing hardware, failures and short diagnostics keep beta held; no physical support inferred from software engines.';
result.apiCandidate={status:result.betaFrozen?'frozen-beta-candidate':'candidate; freeze withheld',contractVersion:1,packages:[],futureRuntimePackages:'absent; motion, component catalogs, React Native and Flutter remain planned'};
for(const artifact of candidate.artifacts) {
  const tarball=path.join(path.dirname(candidatePath),'liquid-glass-forge-'+artifact.name+'-0.0.0-dev.tgz');
  if(sha(await readFile(tarball))!==artifact.sha256)throw Error('Candidate tarball changed');
  const manifest=JSON.parse(execFileSync('tar',['-xOf',tarball,'package/package.json'],{encoding:'utf8'}));
  if(!manifest.private||manifest.version!=='0.0.0-dev'||!['core','cpu','dom','webgl','react','vue','angular'].includes(artifact.name))throw Error('Unexpected release/package boundary');
  result.apiCandidate.packages.push({name:manifest.name,version:manifest.version,exports:manifest.exports,declarations:Object.fromEntries(artifact.files.filter(f=>f.endsWith('.d.ts')).map(file=>[file,sha(execFileSync('tar',['-xOf',tarball,'package/'+file]))]))});
}
const output=args.includes('--output')?value('--output'):'docs/SUPPORT.json';await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,status:result.status,betaFrozen:result.betaFrozen,environments:result.environments.map(e=>({id:e.id,status:e.status,missingOrFailed:e.reasons.length+e.visualReasons.length+e.soaks.reduce((n,s)=>n+s.reasons.length,0)}))}));
if(result.status!=='qualified-beta-candidate'&&!args.includes('--allow-held'))process.exitCode=1;
