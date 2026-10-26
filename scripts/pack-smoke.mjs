import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditPackage } from './package-audit.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageDir = path.join(root, 'packages/core');
const allowed = ['LICENSE', 'NOTICE', 'README.md', 'dist/index.d.ts', 'dist/index.js', 'package.json'].sort();

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, npm_config_update_notifier: 'false' } });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? 'spawn'}):\n${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return result.stdout;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function packSmoke() {
  const receiptBase = path.join(root, 'private/phase-2/pack');
  await mkdir(receiptBase, { recursive: true });
  const runDir = await mkdtemp(path.join(receiptBase, 'run-'));
  const receipt = { schemaVersion: 1, package: '@liquid-glass-forge/core', startedAt: new Date().toISOString(), artifacts: [], checks: {} };
  let consumer;
  try {
    for (const iteration of ['first', 'second']) {
      const destination = path.join(runDir, iteration);
      await mkdir(destination);
      const output = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], packageDir);
      await writeFile(path.join(runDir, `${iteration}-npm-pack.json`), output);
      const packed = JSON.parse(output);
      assert(Array.isArray(packed) && packed.length === 1, 'npm pack must report exactly one artifact');
      const metadata = packed[0];
      assert(typeof metadata.filename === 'string' && path.basename(metadata.filename) === metadata.filename, 'npm pack returned an unsafe tarball filename');
      const tarball = path.join(destination, metadata.filename);
      const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
      const tarEntries = run('tar', ['-tzf', tarball], root).trim().split('\n');
      assert(tarEntries.every((entry) => entry.startsWith('package/')), 'Tarball has entries outside package/');
      const actualFiles = tarEntries.map((entry) => entry.slice('package/'.length)).sort();
      assert(JSON.stringify(actualFiles) === JSON.stringify(allowed), `Tarball file allowlist differs: ${JSON.stringify(actualFiles)}`);
      const listedFiles = metadata.files.map((file) => file.path).sort();
      assert(JSON.stringify(listedFiles) === JSON.stringify(actualFiles), 'npm pack inventory differs from physical tarball entries');
      const manifest = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json'], root));
      assert(manifest.name === receipt.package, `Unexpected package name: ${manifest.name}`);
      auditPackage(manifest, actualFiles);
      for (const notice of ['LICENSE', 'NOTICE', 'README.md']) assert(run('tar', ['-xOf', tarball, `package/${notice}`], root).trim().length > 0, `Shipped ${notice} is empty`);
      receipt.artifacts.push({ iteration, tarball: path.relative(root, tarball), sha256, npmIntegrity: metadata.integrity, files: actualFiles });
    }
    assert(receipt.artifacts[0].sha256 === receipt.artifacts[1].sha256, 'Repeated npm pack artifacts have different SHA-256 hashes');
    receipt.checks.reproducible = true;
    receipt.checks.artifactAudit = true;

    consumer = await mkdtemp(path.join(tmpdir(), 'liquid-glass-forge-consumer-'));
    const consumerReal = await realpath(consumer);
    const rootReal = await realpath(root);
    assert(consumerReal !== rootReal && !consumerReal.startsWith(`${rootReal}${path.sep}`), 'Consumer must be outside the repository');
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'independent-package-smoke', private: true, type: 'module' }, null, 2));
    const tarball = path.join(root, receipt.artifacts[0].tarball);
    const installOutput = run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--save=false', tarball], consumer);
    await writeFile(path.join(runDir, 'consumer-install.txt'), installOutput);
    const installed = path.join(consumer, 'node_modules/@liquid-glass-forge/core');
    const installedReal = await realpath(installed);
    assert(!(await lstat(installed)).isSymbolicLink() && installedReal.startsWith(`${consumerReal}${path.sep}`), 'Installed package must contain physical files inside the independent consumer');
    for (const file of allowed) {
      const entry = path.join(installed, file);
      assert(!(await lstat(entry)).isSymbolicLink(), `Installed package entry is a symlink: ${file}`);
      assert((await realpath(entry)).startsWith(`${installedReal}${path.sep}`), `Installed package entry escapes its package directory: ${file}`);
    }
    await writeFile(path.join(consumer, 'smoke.mjs'), `import assert from 'node:assert/strict';
import { CONTRACT_VERSION } from '@liquid-glass-forge/core';
assert.equal(CONTRACT_VERSION, 1);
await assert.rejects(import('@liquid-glass-forge/core/dist/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
console.log('ESM import and export encapsulation passed');
`);
    await writeFile(path.join(consumer, 'consumer.mts'), `import { CONTRACT_VERSION, type PixelSource, type FrameDescriptor } from '@liquid-glass-forge/core';
const version: 1 = CONTRACT_VERSION;
// @ts-expect-error public version must retain its literal type, never any.
const invalidVersion: 2 = CONTRACT_VERSION;
export function publicTypes(source: PixelSource, frame: FrameDescriptor): [PixelSource, FrameDescriptor, 1] {
  return [source, frame, version];
}
`);
    const importOutput = run(process.execPath, ['smoke.mjs'], consumer);
    await writeFile(path.join(runDir, 'consumer-import.txt'), importOutput);
    const typeOutput = run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], consumer);
    await writeFile(path.join(runDir, 'consumer-types.txt'), typeOutput);
    receipt.checks.offlineInstall = true;
    receipt.checks.physicalConsumer = true;
    receipt.checks.esmImport = true;
    receipt.checks.deepImportRejected = true;
    receipt.checks.types = true;
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    if (consumer) await rm(consumer, { recursive: true, force: true });
    receipt.completedAt = new Date().toISOString();
    await writeFile(path.join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  console.log(`Package smoke passed; receipt: ${path.relative(root, path.join(runDir, 'receipt.json'))}`);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  packSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
