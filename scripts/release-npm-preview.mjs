import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { digest, integrity, loadDistribution } from './distribution-artifacts.mjs';

const prerelease = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/;
const npmVersion = '11.21.0';

function newerThan(left, right) {
  const a = left.match(prerelease).slice(1).map(BigInt);
  const b = right.match(prerelease).slice(1).map(BigInt);
  const index = a.findIndex((part, i) => part !== b[i]);
  return index >= 0 && a[index] > b[index];
}

function checkTags(name, tags, version, temporaryTag) {
  for (const tag of ['next', 'latest']) {
    const current = tags[tag];
    if (current && (!prerelease.test(current) || newerThan(current, version))) {
      throw Error(`Refusing to replace ${name}@${tag} (${current}) with ${version}`);
    }
  }
  if (tags[temporaryTag] && tags[temporaryTag] !== version) {
    throw Error(`Unexpected version on ${name}@${temporaryTag}`);
  }
}

async function waitForRegistry(read, accept, message) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await read();
    if (accept(result)) return result;
    if (attempt < 5) await delay(1000 * (attempt + 1));
  }
  throw Error(message);
}

export async function releasePreview({ version, packages }, registry, record) {
  if (!prerelease.test(version)) throw Error('Expected an exact release candidate');
  const temporaryTag = 'preview-' + version;
  const published = new Set();

  // Resolve all collisions and newer tags before the first registry write.
  for (const pkg of packages) {
    const tags = await registry.tags(pkg);
    checkTags(pkg.fullName, tags, version, temporaryTag);
    const exists = await registry.hasApprovedVersion(pkg, version);
    if (exists) published.add(pkg.fullName);
    record({ package: pkg.fullName, priorTags: tags, alreadyPublished: exists });
  }

  for (const pkg of packages) {
    if (published.has(pkg.fullName)) continue;
    await registry.publish(pkg, temporaryTag);
    record({ package: pkg.fullName, published: version, tag: temporaryTag });
  }

  for (const pkg of packages) {
    await waitForRegistry(() => registry.hasApprovedVersion(pkg, version), Boolean,
      `Registry version did not become visible for ${pkg.fullName}`);
    record({ package: pkg.fullName, verifiedSha256: pkg.sha256 });
  }

  for (const tag of ['next', 'latest']) {
    for (const pkg of packages) {
      const tags = await registry.tags(pkg);
      checkTags(pkg.fullName, tags, version, temporaryTag);
      if (tags[tag] === version) continue;
      await registry.tag(pkg, version, tag);
      record({ package: pkg.fullName, tag, version });
    }
  }

  for (const pkg of packages) {
    const bothMatch = tags => tags.next === version && tags.latest === version;
    const tags = await waitForRegistry(() => registry.tags(pkg), bothMatch,
      `Expected next and latest at ${version} for ${pkg.fullName}`);
    checkTags(pkg.fullName, tags, version, temporaryTag);
    if (tags[temporaryTag] === version) {
      await registry.removeTag(pkg, temporaryTag);
      record({ package: pkg.fullName, removedTag: temporaryTag });
    }
    const final = await waitForRegistry(() => registry.tags(pkg),
      tags => bothMatch(tags) && !Object.hasOwn(tags, temporaryTag),
      `Expected only the public preview tags after cleanup for ${pkg.fullName}`);
    record({ package: pkg.fullName, verifiedTags: { next: final.next, latest: final.latest } });
  }
}

function reviewedPreview(manifestPath, policy, env) {
  const { file, bundle } = loadDistribution(manifestPath);
  const manifestSha256 = digest(readFileSync(file));
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{64}$/.test(env.APPROVED_MANIFEST_SHA256 ?? '') ||
      manifestSha256 !== env.APPROVED_MANIFEST_SHA256 ||
      bundle.source?.commit !== env.GITHUB_SHA || bundle.source?.commit !== git('rev-parse', 'HEAD') ||
      bundle.source?.tree !== git('rev-parse', 'HEAD^{tree}') || bundle.source?.clean !== true ||
      bundle.policySha256 !== digest(readFileSync('release/policy.json')) ||
      bundle.supportSha256 !== digest(readFileSync('docs/SUPPORT.json')) ||
      bundle.kind !== 'release-candidate' || !prerelease.test(bundle.version) ||
      bundle.preparationPassed !== true || bundle.reproducible !== true ||
      bundle.artifacts.some(artifact => artifact.private !== false) ||
      policy.scope !== '@liquid-glass-forge' ||
      policy.packages.length !== bundle.artifacts.length ||
      new Set(policy.packages).size !== bundle.artifacts.length) {
    throw Error('Expected the reviewed, reproducible public preview from this exact commit');
  }
  const packages = policy.packages.map(name => {
    const artifact = bundle.artifacts.find(item => item.name === name);
    return { ...artifact, fullName: policy.scope + '/' + name,
      tarball: path.join(path.dirname(file), artifact.tarball) };
  });
  return { file, version: bundle.version, commit: bundle.source.commit, manifestSha256, packages };
}

function npmRegistry(policy) {
  const request = (url, accept) => fetch(url, {
    headers: { 'cache-control': 'no-cache', ...(accept && { accept }) },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const packageUrl = pkg => policy.registry + '/' + encodeURIComponent(pkg.fullName);
  const npm = (...args) => execFileSync('npm', [...args, '--registry=' + policy.registry],
    { stdio: 'inherit', timeout: 120000 });

  return {
    async hasApprovedVersion(pkg, version) {
      const result = await request(packageUrl(pkg) + '/' + version, 'application/json');
      if (result.status === 404) return false;
      if (!result.ok) throw Error(`Registry metadata HTTP ${result.status} for ${pkg.fullName}`);
      const metadata = await result.json();
      const expectedTarball = policy.registry + '/' + pkg.fullName + '/-/' + pkg.name + '-' + version + '.tgz';
      if (metadata.name !== pkg.fullName || metadata.version !== version ||
          metadata.dist?.integrity !== pkg.integrity || metadata.dist?.tarball !== expectedTarball) {
        throw Error(`Registry version collision for ${pkg.fullName}@${version}`);
      }
      const tarball = await request(expectedTarball);
      if (!tarball.ok) throw Error(`Registry tarball HTTP ${tarball.status} for ${pkg.fullName}`);
      const bytes = Buffer.from(await tarball.arrayBuffer());
      if (digest(bytes) !== pkg.sha256 || integrity(bytes) !== pkg.integrity) {
        throw Error(`Published tarball differs from the reviewed bytes for ${pkg.fullName}`);
      }
      return true;
    },
    async tags(pkg) {
      const result = await request(policy.registry + '/-/package/' + encodeURIComponent(pkg.fullName) + '/dist-tags');
      if (!result.ok) throw Error(`Registry tags HTTP ${result.status} for ${pkg.fullName}`);
      return result.json();
    },
    publish: (pkg, tag) => npm('publish', pkg.tarball, '--tag=' + tag, '--provenance', '--access=public', '--ignore-scripts'),
    tag: (pkg, version, tag) => npm('dist-tag', 'add', pkg.fullName + '@' + version, tag),
    removeTag: (pkg, tag) => npm('dist-tag', 'rm', pkg.fullName, tag),
  };
}

async function main() {
  const [mode, manifestPath] = process.argv.slice(2);
  const policy = JSON.parse(readFileSync('release/policy.json', 'utf8'));
  const env = process.env;
  const workflow = policy.repository + '/.github/workflows/npm-preview-release.yml@refs/heads/main';
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== policy.repository ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_WORKFLOW_REF !== workflow ||
      !['review', 'release'].includes(mode)) {
    throw Error('Expected the manual npm preview release workflow on main');
  }
  const preview = reviewedPreview(manifestPath, policy, env);
  if (mode === 'review') {
    console.log(`## Review npm preview ${preview.version}\n\nCommit \`${preview.commit}\`\n\nManifest SHA-256 \`${preview.manifestSha256}\`\n`);
    console.log('[Prepared artifact](https://github.com/' + policy.repository + '/actions/runs/' + env.PREPARATION_RUN + ')\n');
    for (const pkg of preview.packages) console.log(`- \`${pkg.fullName}\` · \`${pkg.sha256}\``);
    return;
  }
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
      env.NODE_AUTH_TOKEN || env.NPM_TOKEN || !env.NPM_CONFIG_USERCONFIG ||
      policy.registry !== 'https://registry.npmjs.org') {
    throw Error('Expected the protected npm OIDC job with no npm token');
  }
  if (process.version !== 'v' + policy.node ||
      execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== npmVersion) {
    throw Error('Use the pinned preview publication toolchain');
  }
  writeFileSync(env.NPM_CONFIG_USERCONFIG, '', { flag: 'wx', mode: 0o600 });
  const receipt = { version: preview.version, commit: preview.commit, manifestSha256: preview.manifestSha256, events: [] };
  const output = path.join(path.dirname(preview.file), 'release-receipt.json');
  const record = event => {
    receipt.events.push(event);
    writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  };
  await releasePreview(preview, npmRegistry(policy), record);
  record({ complete: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
