import { readFile,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest,loadDistribution } from './distribution-artifacts.mjs';

export async function publicationPlan(artifacts, version, metadata) {
  const actions=[];
  for(const artifact of artifacts) {
    const existing=await metadata('@liquid-glass-forge/'+artifact.name,version);
    if(existing!==null&&(existing.version!==version||existing.dist?.integrity!==artifact.integrity))throw Error('Registry version collision: '+artifact.name);
    actions.push({name:artifact.name,action:existing===null?'publish':'already-present',integrity:artifact.integrity});
  }
  return actions;
}
async function main() {
  const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
  if(!args.includes('--manifest')||!args.includes('--approved-manifest-sha256'))throw Error('Exact manifest and explicit approved manifest hash are required');
  const {file,bundle}=loadDistribution(value('--manifest')),hash=digest(await readFile(file));
  if(hash!==value('--approved-manifest-sha256'))throw Error('Artifact approval hash differs');
  const policy=JSON.parse(await readFile('release/policy.json'));
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==policy.repository||process.env.GITHUB_SHA!==bundle.source.commit||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_WORKFLOW_REF!==policy.repository+'/.github/workflows/'+policy.workflow+'@refs/heads/main'||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL)throw Error('Expected the exact protected manual OIDC workflow');
  if(process.env.NPM_TOKEN||process.env.NODE_AUTH_TOKEN)throw Error('Long-lived token fallback is forbidden for this publisher');
  execFileSync(process.execPath,['scripts/release-verify.mjs','--manifest',file,'--release'],{stdio:'inherit'});
  if(process.version!=='v'+policy.node||execFileSync('npm',['--version'],{encoding:'utf8'}).trim()!==policy.npm)throw Error('Unpinned publishing toolchain');
  const actions=await publicationPlan(bundle.artifacts,bundle.version,async(name,version)=>{
    const response=await fetch(policy.registry+'/'+encodeURIComponent(name)+'/'+encodeURIComponent(version),{signal:AbortSignal.timeout(30000)});
    if(response.status===404)return null;if(!response.ok)throw Error('Registry preflight HTTP '+response.status);return response.json();
  });
  const receipt={manifestSha256:hash,sourceCommit:bundle.source.commit,tag:policy.candidateTag,actions,published:[]};
  const output=path.join(path.dirname(file),'publication.json');await writeFile(output,JSON.stringify(receipt,null,2));
  for(const name of policy.packages) {
    const action=actions.find(a=>a.name===name);if(action.action==='already-present')continue;
    const artifact=bundle.artifacts.find(a=>a.name===name);
    // Recheck the immutable approved bytes immediately before each publication.
    if(digest(await readFile(path.join(path.dirname(file),artifact.tarball)))!==artifact.sha256)throw Error('Approved artifact changed');
    execFileSync('npm',['publish',path.join(path.dirname(file),artifact.tarball),'--registry',policy.registry,'--tag',policy.candidateTag,'--access','public','--provenance','--ignore-scripts'],{stdio:'inherit'});
    receipt.published.push(name);await writeFile(output,JSON.stringify(receipt,null,2));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
