import { createHash } from 'node:crypto';
import { readFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageFiles } from './pack-smoke.mjs';
import { auditPackage } from './package-audit.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
export const integrity = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
export const peers = { react:'19.3.1', 'react-dom':'19.3.1', vue:'3.5.44', '@angular/core':'22.2.4', '@angular/common':'22.2.4', rxjs:'7.8.2' };
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const invariant = (condition, message) => { if (!condition) throw Error(message); };

export function inspectTarball(file, name, version) {
  invariant(Object.hasOwn(packageFiles, name), 'Unexpected package: ' + name);
  const listing = execFileSync('tar', ['-tzf', file], { encoding:'utf8', maxBuffer:2e6 }).trim().split('\n');
  const detailed = execFileSync('tar', ['-tvzf', file], { encoding:'utf8', maxBuffer:2e6 }).trim().split('\n');
  invariant(detailed.every(line => line.startsWith('-')), 'Only regular packed files are allowed');
  const files = listing.map(entry => { invariant(entry.startsWith('package/'), 'Entry outside package'); return entry.slice(8); }).sort();
  invariant(JSON.stringify(files) === JSON.stringify(packageFiles[name]), 'Packed inventory differs: ' + name);
  const contents = entry => execFileSync('tar', ['-xOf', file, 'package/' + entry], { maxBuffer:10e6 });
  const manifest = JSON.parse(contents('package.json'));
  invariant(manifest.name === '@liquid-glass-forge/' + name && manifest.version === version, 'Name/version mismatch: ' + name);
  auditPackage(manifest, files, { internalVersions:Object.fromEntries(Object.keys(packageFiles).map(n => ['@liquid-glass-forge/' + n, version])), installedPeers:peers });
  for(const field of ['dependencies','optionalDependencies','peerDependencies','devDependencies'])for(const dependency of Object.keys(manifest[field]??{}))if(dependency.startsWith('@liquid-glass-forge/')&&!Object.hasOwn(packageFiles,dependency.slice('@liquid-glass-forge/'.length)))throw Error('Future/unreleased runtime package dependency: '+dependency);
  invariant(manifest.license === 'MIT', 'Unexpected package license');
  invariant(contents('LICENSE').equals(readFileSync(path.join(root, 'LICENSE'))), 'Packed license differs from the declared project license');
  const notice = contents('NOTICE').toString();
  invariant(notice.includes('Nami Poursafargholi') && notice.includes('Not affiliated with, sponsored by or endorsed by Apple Inc.') && notice.includes('No Apple assets or upstream Liquid Glass/Sileo implementation is included.'), 'Missing attribution boundary');
  invariant(manifest.repository?.url === 'git+https://github.com/namipsg/liquid-glass-forge.git' && manifest.repository.directory === 'packages/' + name, 'Wrong repository identity');
  return { manifest, files, fileSha256:Object.fromEntries(files.map(entry => [entry, digest(contents(entry))])) };
}

export function loadDistribution(manifestFile) {
  const file = path.resolve(manifestFile), bundle = readJson(file);
  invariant(bundle.schemaVersion === 1 && ['private-rehearsal','release-candidate'].includes(bundle.kind), 'Unsupported distribution manifest');
  invariant(typeof bundle.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(bundle.version), 'Expected exact synchronized version');
  const names = Object.keys(packageFiles);
  invariant(bundle.artifacts?.length === names.length && new Set(bundle.artifacts.map(a=>a.name)).size === names.length && bundle.artifacts.every(a=>names.includes(a.name)), 'Exact seven-package set is required');
  for (const artifact of bundle.artifacts) {
    invariant(typeof artifact.tarball === 'string' && path.basename(artifact.tarball) === artifact.tarball && artifact.tarball.endsWith('.tgz'), 'Unsafe tarball path');
    const tarball = path.join(path.dirname(file), artifact.tarball), bytes = readFileSync(tarball);
    invariant(digest(bytes) === artifact.sha256 && integrity(bytes) === artifact.integrity, 'Artifact bytes changed: ' + artifact.name);
    const inspected = inspectTarball(tarball, artifact.name, bundle.version);
    invariant(artifact.private === (inspected.manifest.private === true), 'Private package status was misreported');
    invariant(JSON.stringify(inspected.fileSha256) === JSON.stringify(artifact.fileSha256), 'Packed file hashes changed: ' + artifact.name);
  }
  return { file, bundle };
}

export function distributionVersions() {
  const selected = process.env.LGF_DISTRIBUTION_MANIFEST;
  if (selected) {
    const { bundle } = loadDistribution(selected);
    return Object.fromEntries(bundle.artifacts.map(a => ['@liquid-glass-forge/' + a.name, bundle.version]));
  }
  return Object.fromEntries(Object.keys(packageFiles).map(name => { const m=readJson(path.join(root,'packages',name,'package.json')); return [m.name,m.version]; }));
}

/** Consumer suites explicitly select frozen artifacts; they never repack in this mode. */
export function consumerPackage(name, destination) {
  if (!process.env.LGF_DISTRIBUTION_MANIFEST) return JSON.parse(execFileSync('npm', ['pack','--json','--ignore-scripts','--pack-destination',destination], {
    cwd:path.join(root,'packages',name,name==='angular'?'dist':''), encoding:'utf8', timeout:30000
  }))[0];
  const { file, bundle } = loadDistribution(process.env.LGF_DISTRIBUTION_MANIFEST);
  const artifact = bundle.artifacts.find(a => a.name === name);
  invariant(artifact, 'Selected distribution lacks package ' + name);
  const target = path.join(destination, artifact.tarball);
  copyFileSync(path.join(path.dirname(file), artifact.tarball), target);
  return { filename:artifact.tarball, integrity:artifact.integrity, files:Object.keys(artifact.fileSha256).map(path=>({path})), origin:bundle.kind };
}

export function releaseBlockers(bundle, policy, support) {
  const reasons=[];
  if(policy.registry!=='https://registry.npmjs.org'||policy.scope!=='@liquid-glass-forge'||policy.repository!=='namipsg/liquid-glass-forge'||policy.candidateTag!=='next'||policy.recommendedTag!=='latest'||JSON.stringify(policy.packages)!==JSON.stringify(['core','cpu','dom','webgl','react','vue','angular']))reasons.push('Registry, identity, package order or tag policy differs');
  if (policy.publicationEnabled !== true) reasons.push('Publication is disabled');
  if (policy.scopeOwnershipVerified !== true) reasons.push('Scope ownership is not verified');
  if (policy.trustedPublishersVerified !== true) reasons.push('Per-package trusted publishers are not verified');
  if (policy.environmentProtectionVerified !== true) reasons.push('Protected release environment is not verified');
  if (policy.publicRepositoryVerified !== true) reasons.push('Public repository provenance eligibility is not verified');
  if (bundle.kind !== 'release-candidate' || !/^\d+\.\d+\.\d+-rc\.(0|[1-9]\d*)$/.test(bundle.version)) reasons.push('No exact release-candidate version');
  if (bundle.source?.clean !== true || !/^[0-9a-f]{40}$/.test(bundle.source?.commit ?? '')) reasons.push('Source is not a clean identified commit');
  if (bundle.artifacts?.some(a=>a.private!==false)) reasons.push('Packages remain private');
  if (support.status !== 'qualified-beta-candidate' || support.betaFrozen !== true) reasons.push('Phase 11 qualification is held');
  if (support.candidate?.artifacts?.length !== 7 || bundle.artifacts?.length !== 7 || bundle.artifacts.some(a=>!support.candidate.artifacts.some(b=>b.name===a.name&&b.sha256===a.sha256))) reasons.push('Qualified artifacts differ from the distribution');
  return reasons;
}
