import { readFileSync } from 'node:fs';
import { digest, loadDistribution, releaseBlockers } from './distribution-artifacts.mjs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--manifest'))throw Error('An exact --manifest is required');
const {file,bundle}=loadDistribution(value('--manifest'));
const policyBytes=readFileSync(path.join(path.dirname(file),'policy.json')),supportBytes=readFileSync(path.join(path.dirname(file),'support.json'));
if(digest(policyBytes)!==bundle.policySha256||digest(supportBytes)!==bundle.supportSha256)throw Error('Policy/support snapshot changed');
const policy=JSON.parse(policyBytes),support=JSON.parse(supportBytes);
const blockers=releaseBlockers(bundle,policy,support);
if(bundle.preparationPassed!==true||bundle.reproducible!==true)throw Error('Independent build/pack rehearsal is incomplete');
if(args.includes('--release')) {
  const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
  if(git('rev-parse','HEAD')!==bundle.source.commit||git('status','--porcelain')!=='')blockers.push('Current checkout is not the clean release commit');
  if(JSON.stringify(git('ls-files').split('\n').sort())!==JSON.stringify(Object.keys(bundle.source.files??{}).sort()))blockers.push('Source inventory differs from the release commit');
  if(digest(Buffer.from(JSON.stringify(bundle.source.files)))!==bundle.source.sha256)blockers.push('Source fingerprint changed');
  if(!readFileSync('release/policy.json').equals(policyBytes)||!readFileSync('docs/SUPPORT.json').equals(supportBytes))blockers.push('Current policy/support differs from the approved snapshot');
  for(const [source,hash]of Object.entries(bundle.source?.files??{}))if(digest(readFileSync(source))!==hash)blockers.push('Source changed: '+source);
  if(blockers.length){console.log(JSON.stringify({artifactIntegrity:'passed',releaseReady:false,blockers}));process.exitCode=1;}
}
console.log(JSON.stringify({manifest:file,kind:bundle.kind,artifactIntegrity:'passed',releaseReady:blockers.length===0,blockers}));
