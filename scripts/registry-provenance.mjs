/** Signature verification is performed separately by npm audit signatures.
 * This validates the identity and subject of that authenticated statement.
 */
export function provenanceIdentity(statement, artifact, sourceCommit, policy) {
  const fail=message=>{throw Error('Provenance '+message);};
  if(statement?._type!=='https://in-toto.io/Statement/v1'&&statement?._type!=='https://in-toto.io/Statement/v0.1')fail('statement format is unsupported');
  if(!statement.subject?.some(s=>(typeof artifact.sha256==='string'&&s.digest?.sha256===artifact.sha256)||(typeof artifact.sha512==='string'&&s.digest?.sha512===artifact.sha512)))fail('subject does not match exact tarball');
  let repository,workflow,commits;
  if(statement.predicateType==='https://slsa.dev/provenance/v1') {
    const definition=statement.predicate?.buildDefinition;
    repository=definition?.externalParameters?.workflow?.repository;
    workflow=definition?.externalParameters?.workflow?.path;
    commits=definition?.resolvedDependencies?.filter(d=>d.uri?.startsWith('git+https://github.com/'+policy.repository+'@')).map(d=>d.digest?.gitCommit)??[];
  }else if(statement.predicateType==='https://slsa.dev/provenance/v0.2') {
    const config=statement.predicate?.invocation?.configSource;
    repository=config?.uri?.split('@refs/')[0]?.replace(/^git\+/, '');
    workflow=config?.entryPoint;commits=[config?.digest?.sha1];
  }else fail('predicate type is unsupported');
  if(repository!=='https://github.com/'+policy.repository||workflow!=='.github/workflows/'+policy.workflow||!commits.includes(sourceCommit))fail('repository, workflow or source commit differs');
  return {repository,workflow,commit:sourceCommit,subjectVerified:true};
}

export function verifiedRegistryIdentities(audit, bundle, policy) {
  if(!Array.isArray(audit.invalid)||!Array.isArray(audit.missing)||audit.invalid.length||audit.missing.length||!Array.isArray(audit.verified))throw Error('Incomplete npm signature/attestation verification');
  return bundle.artifacts.map(artifact=>{
    const name='@liquid-glass-forge/'+artifact.name;
    const verified=audit.verified.find(v=>v.name===name&&v.version===bundle.version);
    const provenance=verified?.attestationBundles?.find(a=>a.predicateType?.startsWith('https://slsa.dev/provenance/'));
    if(!provenance?.bundle?.dsseEnvelope?.payload)throw Error('No cryptographically verified provenance for '+name);
    const statement=JSON.parse(Buffer.from(provenance.bundle.dsseEnvelope.payload,'base64').toString());
    return {name,version:bundle.version,sha256:artifact.sha256,identity:provenanceIdentity(statement,artifact,bundle.source.commit,policy)};
  });
}
