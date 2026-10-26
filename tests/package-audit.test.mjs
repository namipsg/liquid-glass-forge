import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPackage } from '../scripts/package-audit.mjs';

const files = ['package.json', 'dist/index.js', 'dist/index.d.ts', 'dist/theme.css', 'dist/worker.js'];
const fixture = () => ({ name: '@fixture/core', version: '1.2.3', main: './dist/index.js', types: './dist/index.d.ts', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' }, './theme.css': './dist/theme.css', './worker': './dist/worker.js' } });

test('accepts a complete package and returns its physical file inventory', () => {
  const manifest = fixture();
  manifest.dependencies = { '@fixture/shared': '1.2.3' };
  manifest.peerDependencies = { host: '2.1.0' };
  assert.deepEqual(auditPackage(manifest, files.map((path) => ({ path })), { internalVersions: { '@fixture/shared': '1.2.3' }, installedPeers: { host: '2.1.0' } }).files, [...files].sort());
});

for (const missing of ['dist/index.d.ts', 'dist/theme.css', 'dist/worker.js']) {
  test(`rejects a tarball missing ${missing}`, () => {
    assert.throws(() => auditPackage(fixture(), files.filter((file) => file !== missing)), (error) => error.message.includes(missing) && /missing/.test(error.message));
  });
}

test('checks main, module, direct CSS and worker metadata independently of exports', () => {
  for (const field of ['main', 'module', 'types', 'typings', 'style', 'css', 'worker']) assert.throws(() => auditPackage({ [field]: './absent.js' }, files), new RegExp(`${field}: referenced file is missing`));
  assert.throws(() => auditPackage({ workers: { renderer: './absent.js' }, styles: ['./absent.css'] }, files), /absent.css/);
});

test('rejects path traversal, absolute paths and unsupported export patterns', () => {
  for (const target of ['./../secret', '/tmp/secret', './dist/../secret', './dist\\secret', './dist/*.js', 'file:secret', './dist//index.js', './dist/%2e%2e/secret', './node_modules/secret']) assert.throws(() => auditPackage({ exports: target }, files), /unsafe|unsupported|must start/);
  assert.throws(() => auditPackage({ exports: { './*': './dist/index.js' } }, files), /unsupported export key/);
  assert.throws(() => auditPackage({}, [...files, '../private.json']), /unsafe path traversal/);
});

test('rejects install lifecycle hooks even if their command is empty', () => {
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.throws(() => auditPackage({ scripts: { [hook]: '' } }, files), new RegExp(`scripts.${hook}`));
});

test('rejects internal version drift and workspace or range dependency aliases', () => {
  for (const version of ['1.2.2', '^1.2.3', 'workspace:*']) assert.throws(() => auditPackage({ dependencies: { '@fixture/shared': version } }, files, { internalVersions: { '@fixture/shared': '1.2.3' } }), /internal dependency must use exact 1.2.3/);
});

test('rejects missing or incompatible peers and explicitly declines semver ranges', () => {
  const manifest = { peerDependencies: { host: '2.1.0' } };
  assert.throws(() => auditPackage(manifest, files), /missing installed peer/);
  assert.throws(() => auditPackage(manifest, files, { installedPeers: { host: '2.0.0' } }), /incompatible installed peer/);
  assert.throws(() => auditPackage({ peerDependencies: { host: '^2.0.0' } }, files, { installedPeers: { host: '2.1.0' } }), /only exact versions are supported/);
});
