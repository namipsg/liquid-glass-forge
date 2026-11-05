import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digest, loadDistribution } from './distribution-artifacts.mjs';

const policy = JSON.parse(await readFile('release/policy.json', 'utf8'));
const workflow = policy.repository + '/.github/workflows/npm-preview.yml@refs/heads/main';
const env = process.env;
if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== policy.repository ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_WORKFLOW_REF !== workflow ||
    !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
  throw Error('Expected the manual GitHub npm preview workflow');
}
if (env.NODE_AUTH_TOKEN || env.NPM_TOKEN) throw Error('Use npm trusted publishing without an npm token');
const npm = (...args) => execFileSync('npm', args, { encoding: 'utf8', timeout: 120000 });
if (process.version !== 'v' + policy.node || npm('--version').trim() !== policy.npm) {
  throw Error('Use the pinned release toolchain');
}

const { file, bundle } = loadDistribution(process.argv[2]);
const manifestSha256 = digest(await readFile(file));
if (manifestSha256 !== env.APPROVED_MANIFEST_SHA256 ||
    bundle.source.commit !== env.GITHUB_SHA || bundle.source.clean !== true ||
    bundle.preparationPassed !== true || bundle.reproducible !== true ||
    bundle.kind !== 'release-candidate' || !/^\d+\.\d+\.\d+-rc\.\d+$/.test(bundle.version) ||
    bundle.artifacts.some(artifact => artifact.private !== false)) {
  throw Error('Expected the reviewed, reproducible public prerelease for this commit');
}

for (const artifact of bundle.artifacts) {
  const name = encodeURIComponent(policy.scope + '/' + artifact.name);
  const response = await fetch(policy.registry + '/' + name + '/' + bundle.version, {
    signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 404) {
    throw Error('Expected an unused registry version for ' + artifact.name + ' (HTTP ' + response.status + ')');
  }
}

const receipt = { manifestSha256, commit: env.GITHUB_SHA, version: bundle.version, tag: 'next', staged: [] };
const output = path.join(path.dirname(file), 'staging-receipt.json');
const save = () => writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
await save();
for (const name of policy.packages) {
  const artifact = bundle.artifacts.find(item => item.name === name);
  const tarball = path.join(path.dirname(file), artifact.tarball);
  if (digest(await readFile(tarball)) !== artifact.sha256) throw Error('Reviewed tarball changed: ' + name);
  const response = npm('stage', 'publish', tarball, '--json', '--registry=' + policy.registry,
    '--tag=next', '--access=public', '--ignore-scripts');
  receipt.staged.push({ name, sha256: artifact.sha256, response: JSON.parse(response) });
  await save();
  console.log('Submitted for maintainer review: ' + policy.scope + '/' + name + '@' + bundle.version);
}
