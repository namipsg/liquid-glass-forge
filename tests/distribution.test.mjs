import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseBlockers,digest,integrity,inspectTarball,loadDistribution } from '../scripts/distribution-artifacts.mjs';
import { provenanceIdentity,verifiedRegistryIdentities } from '../scripts/registry-provenance.mjs';
import { publicationPlan } from '../scripts/publish-approved.mjs';
import { releasePreview } from '../scripts/release-npm-preview.mjs';
const names=['core','cpu','dom','webgl','react','vue','angular'];
function approved(){
  const policy={...JSON.parse(readFileSync('release/policy.json')),publicationEnabled:true,scopeOwnershipVerified:true,trustedPublishersVerified:true,environmentProtectionVerified:true,publicRepositoryVerified:true};
  const artifacts=names.map(name=>({name,sha256:name,private:false}));
  return {policy,bundle:{kind:'release-candidate',version:'0.1.0-rc.1',source:{clean:true,commit:'a'.repeat(40)},artifacts},support:{status:'qualified-beta-candidate',betaFrozen:true,candidate:{artifacts}}};
}
test('only an approved exact qualified candidate can clear the release blockers',()=>{
  const {bundle,policy,support}=approved();assert.deepEqual(releaseBlockers(bundle,policy,support),[]);
  for(const field of ['publicationEnabled','scopeOwnershipVerified','trustedPublishersVerified','environmentProtectionVerified','publicRepositoryVerified']){const p={...policy,[field]:false};assert.ok(releaseBlockers(bundle,p,support).length);}
  for(const [field,value]of [['registry','https://other.invalid'],['candidateTag','latest'],['scope','@other'],['packages',['core']]])assert.ok(releaseBlockers(bundle,{...policy,[field]:value},support).length);
});
test('private/dev, dirty, incomplete and changed qualification artifacts cannot be released',()=>{
  for(const mutate of [r=>r.bundle.version='0.0.0-dev',r=>r.bundle.kind='private-rehearsal',r=>r.bundle.source.clean=false,r=>r.bundle.artifacts[0].private=true,r=>r.support.betaFrozen=false,r=>r.support.status='hold',r=>r.bundle.artifacts=r.bundle.artifacts.slice(1),r=>r.support.candidate.artifacts=[]]){const r=structuredClone(approved());mutate(r);assert.ok(releaseBlockers(r.bundle,r.policy,r.support).length);}
});
const policy={repository:'namipsg/liquid-glass-forge',workflow:'publish-candidate.yml'},artifact={sha256:'b'.repeat(64)},commit='c'.repeat(40);
const statement=()=>({_type:'https://in-toto.io/Statement/v1',subject:[{digest:{sha256:artifact.sha256}}],predicateType:'https://slsa.dev/provenance/v1',predicate:{buildDefinition:{externalParameters:{workflow:{repository:'https://github.com/'+policy.repository,path:'.github/workflows/'+policy.workflow}},resolvedDependencies:[{uri:'git+https://github.com/'+policy.repository+'@refs/tags/v0.1.0-rc.1',digest:{gitCommit:commit}}]}}});
test('authenticated provenance must identify the exact tarball, repository, workflow and commit',()=>{
  assert.equal(provenanceIdentity(statement(),artifact,commit,policy).subjectVerified,true);
  for(const mutate of [s=>s.subject[0].digest.sha256='wrong',s=>s.predicate.buildDefinition.externalParameters.workflow.repository='https://github.com/fork/project',s=>s.predicate.buildDefinition.externalParameters.workflow.path='.github/workflows/other.yml',s=>s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit='wrong',s=>s.predicateType='unknown']){const s=statement();mutate(s);assert.throws(()=>provenanceIdentity(s,artifact,commit,policy));}
});
test('legacy SLSA config source still requires the same exact identity',()=>{
  const s={...statement(),predicateType:'https://slsa.dev/provenance/v0.2',predicate:{invocation:{configSource:{uri:'git+https://github.com/'+policy.repository+'@refs/tags/v0.1.0-rc.1',entryPoint:'.github/workflows/'+policy.workflow,digest:{sha1:commit}}}}};
  assert.equal(provenanceIdentity(s,artifact,commit,policy).commit,commit);assert.throws(()=>provenanceIdentity(s,artifact,'d'.repeat(40),policy));
});
test('provenance identity comes from the npm-verified bundles for every exact package',()=>{
  const bundle={version:'0.1.0-rc.1',source:{commit},artifacts:[{name:'core',...artifact}]};
  const verified={name:'@liquid-glass-forge/core',version:bundle.version,attestationBundles:[{predicateType:'https://slsa.dev/provenance/v1',bundle:{dsseEnvelope:{payload:Buffer.from(JSON.stringify(statement())).toString('base64')}}}]};
  const audit={invalid:[],missing:[],verified:[verified]};assert.equal(verifiedRegistryIdentities(audit,bundle,policy).length,1);
  for(const mutate of [a=>a.invalid.push({name:verified.name}),a=>a.missing.push({name:verified.name}),a=>a.verified=[],a=>a.verified[0].version='wrong',a=>a.verified[0].attestationBundles=[]]){const a=structuredClone(audit);mutate(a);assert.throws(()=>verifiedRegistryIdentities(a,bundle,policy));}
});
test('physical tarball audit rejects absent attribution and edited archive bytes',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'lgf-distribution-negative-'));
  try{
    const staging=path.join(dir,'package');mkdirSync(path.join(staging,'dist'),{recursive:true});
    const manifest={name:'@liquid-glass-forge/core',version:'0.0.0-dev',private:true,license:'MIT',exports:{'.':{types:'./dist/index.d.ts',import:'./dist/index.js'}},repository:{url:'git+https://github.com/namipsg/liquid-glass-forge.git',directory:'packages/core'}};
    writeFileSync(path.join(staging,'package.json'),JSON.stringify(manifest));writeFileSync(path.join(staging,'dist/index.js'),'export {};');writeFileSync(path.join(staging,'dist/index.d.ts'),'export {};');writeFileSync(path.join(staging,'README.md'),'Fixture');copyFileSync('LICENSE',path.join(staging,'LICENSE'));writeFileSync(path.join(staging,'NOTICE'),'No useful attribution');
    const file=path.join(dir,'core.tgz'),pack=()=>execFileSync('tar',['-czf',file,...['LICENSE','NOTICE','README.md','package.json','dist/index.js','dist/index.d.ts'].map(f=>'package/'+f)],{cwd:dir});pack();
    assert.throws(()=>inspectTarball(file,'core','0.0.0-dev'),/Missing attribution boundary/);
    copyFileSync('packages/core/NOTICE',path.join(staging,'NOTICE'));pack();assert.equal(inspectTarball(file,'core','0.0.0-dev').manifest.name,'@liquid-glass-forge/core');
    manifest.dependencies={'@liquid-glass-forge/motion':'0.0.0-dev'};writeFileSync(path.join(staging,'package.json'),JSON.stringify(manifest));pack();assert.throws(()=>inspectTarball(file,'core','0.0.0-dev'),/Future\/unreleased/);
    const bundle={schemaVersion:1,kind:'private-rehearsal',version:'0.0.0-dev',artifacts:names.map(name=>({name,tarball:'core.tgz',sha256:digest(readFileSync(file)),integrity:integrity(readFileSync(file)),private:true,fileSha256:{}}))};
    writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(bundle));writeFileSync(file,'changed');assert.throws(()=>loadDistribution(path.join(dir,'manifest.json')),/Artifact bytes changed/);
    bundle.artifacts[0].tarball='../escape.tgz';writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(bundle));assert.throws(()=>loadDistribution(path.join(dir,'manifest.json')),/Unsafe tarball path/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('partial publication can resume only for byte-identical already-published versions',async()=>{
  const artifacts=[{name:'core',integrity:'sha512-core'},{name:'cpu',integrity:'sha512-cpu'}];
  const plan=await publicationPlan(artifacts,'0.1.0-rc.1',async name=>name.endsWith('/core')?{version:'0.1.0-rc.1',dist:{integrity:'sha512-core'}}:null);
  assert.deepEqual(plan.map(a=>a.action),['already-present','publish']);
  await assert.rejects(publicationPlan(artifacts,'0.1.0-rc.1',async()=>({version:'0.1.0-rc.1',dist:{integrity:'different'}})),/collision/);
  await assert.rejects(publicationPlan(artifacts,'0.1.0-rc.1',async()=>{throw Error('HTTP 503');}),/HTTP 503/);
});

function previewRegistry() {
  const version = '0.1.0-rc.3';
  const packages = names.map(name => ({ fullName: '@liquid-glass-forge/' + name, sha256: name }));
  const versions = new Set();
  const tags = Object.fromEntries(packages.map(pkg => [pkg.fullName, { next: '0.1.0-rc.2', latest: '0.1.0-rc.2' }]));
  const writes = [];
  const registry = {
    tags: async pkg => ({ ...tags[pkg.fullName] }),
    hasApprovedVersion: async pkg => versions.has(pkg.fullName),
    async publish(pkg, tag) {
      writes.push(['publish', pkg.fullName, tag]);
      versions.add(pkg.fullName);
      tags[pkg.fullName][tag] = version;
    },
    async tag(pkg, target, tag) {
      assert.equal(versions.size, packages.length);
      writes.push([tag, pkg.fullName, target]);
      tags[pkg.fullName][tag] = target;
    },
    async removeTag(pkg, tag) {
      writes.push(['remove', pkg.fullName, tag]);
      delete tags[pkg.fullName][tag];
    },
  };
  return { version, packages, registry, tags, writes };
}

test('preview resume verifies existing versions and moves both tags after every package exists', async () => {
  const fixture = previewRegistry();
  const { registry, packages, version, tags, writes } = fixture;
  const publish = registry.publish;
  registry.publish = async (pkg, tag) => {
    if (pkg === packages[1]) throw Error('Interrupted publish');
    await publish(pkg, tag);
  };
  const events = [];
  const run = () => releasePreview(fixture, registry, event => events.push(event));
  await assert.rejects(run(), /Interrupted publish/);
  assert.deepEqual(writes, [['publish', packages[0].fullName, 'preview-' + version]]);
  registry.publish = publish;
  await run();
  assert.deepEqual(writes.map(([action]) => action),
    ['publish', 'next', 'latest', 'remove'].flatMap(action => packages.map(() => action)));
  assert.ok(events.some(event => event.package === packages[0].fullName && event.alreadyPublished));
  for (const pkg of packages) assert.deepEqual(tags[pkg.fullName], { next: version, latest: version });
  writes.length = 0;
  await run();
  assert.deepEqual(writes, []);
});

test('preview rejects a version collision or newer or stable tags before writing', async () => {
  for (const latest of ['0.1.0-rc.10', '0.1.0']) {
    const fixture = previewRegistry();
    fixture.tags[fixture.packages.at(-1).fullName].latest = latest;
    await assert.rejects(releasePreview(fixture, fixture.registry, () => {}), /Refusing to replace/);
    assert.deepEqual(fixture.writes, []);
  }
  const fixture = previewRegistry();
  fixture.registry.hasApprovedVersion = async pkg => {
    if (pkg === fixture.packages.at(-1)) throw Error('Registry version collision');
    return false;
  };
  await assert.rejects(releasePreview(fixture, fixture.registry, () => {}), /Registry version collision/);
  assert.deepEqual(fixture.writes, []);
});

test('the active rehearsal workflow cannot acquire publishing credentials or publish',()=>{
  const workflow=readFileSync('.github/workflows/release-rehearsal.yml','utf8');
  assert.match(workflow,/workflow_dispatch:/);assert.doesNotMatch(workflow,/\b(push|pull_request|schedule):|id-token:|npm publish|publish-approved|dist-tag/);
  const actions=[...workflow.matchAll(/uses: ([^\n]+)/g)].map(m=>m[1]);assert.ok(actions.length>=3);assert.ok(actions.every(a=>/@[a-f0-9]{40}(?: +# [^\n]+)?$/.test(a)));
  const draft=readFileSync('docs/release/publish-candidate.yml.example','utf8');assert.match(draft,/environment: npm-release/);assert.match(draft,/--release/);assert.match(draft,/--approved-manifest-sha256/);
});
