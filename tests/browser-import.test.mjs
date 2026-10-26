import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../private/phase-2/browser/', import.meta.url), { recursive: true });
const artifacts = await mkdtemp(fileURLToPath(new URL('../private/phase-2/browser/run-', import.meta.url)));
const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts],
  { cwd: fileURLToPath(new URL('../packages/core/', import.meta.url)), encoding: 'utf8', timeout: 30000 }))[0];
assert.equal(packed.filename, 'liquid-glass-forge-core-0.0.0-dev.tgz');
const tarball = `${artifacts}/${packed.filename}`;
const moduleBytes = execFileSync('tar', ['-xOf', tarball, 'package/dist/index.js'], { timeout: 15000 });
assert.deepEqual(moduleBytes, await readFile(new URL('../packages/core/dist/index.js', import.meta.url)));
const receipts = { tarballSha256: createHash('sha256').update(await readFile(tarball)).digest('hex'), engines: [] };
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: packed ESM imports and validates source/frame without a bundler`, async () => {
    const server = createServer((req, res) => {
      if (req.url === '/') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>LGF core package smoke</title>');
      else if (req.url === '/core.js') res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(moduleBytes);
      else res.writeHead(404).end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await engine.launch({ headless: true });
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async () => {
        const core = await import('/core.js');
        const source = core.createSource({ contractVersion: 1, width: 1, height: 1, revision: 0,
          ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight', data: new Uint8Array([10, 20, 30, 255]) });
        const frame = core.createFrame({ contractVersion: 1, generation: 0, revision: 0, sourceRevision: 0,
          surfaces: [{ id: 'one', width: 1, height: 1 }] }, source);
        return { version: core.CONTRACT_VERSION, model: frame.opticalModel, frozen: Object.isFrozen(frame.surfaces[0]), byteLength: source.data.byteLength };
      });
      assert.deepEqual(result, { version: 1, model: 'rounded-refraction-v1', frozen: true, byteLength: 4 });
      assert.deepEqual(errors, []);
      receipts.engines.push({ name, version: browser.version(), pass: true });
      await writeFile(`${artifacts}/receipt.json`, JSON.stringify(receipts, null, 2));
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  });
}
