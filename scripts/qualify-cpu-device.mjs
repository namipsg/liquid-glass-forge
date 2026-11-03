import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageFiles } from './pack-smoke.mjs';
import { ADMISSION } from '../spikes/phase-1/admission.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePaths = ['packages/core/src/index.ts', 'packages/cpu/src/kernel.ts', 'packages/cpu/src/executor.ts', 'packages/cpu/src/protocol.ts',
  'packages/cpu/src/worker.ts', 'packages/dom/src/cpu.ts', 'packages/dom/src/scene.ts', 'packages/dom/src/host.ts', 'packages/dom/src/providers.ts'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });

export async function awaitCdpEndpoint(endpoint, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs; let attempts = 0, lastError;
  while (Date.now() < deadline) {
    attempts++;
    try {
      const response = await fetch(new URL('/json/version', endpoint), { signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))) });
      const info = await response.json();
      if (!response.ok || typeof info.webSocketDebuggerUrl !== 'string' || !/^wss?:/.test(info.webSocketDebuggerUrl)) throw new Error('CDP browser endpoint not ready');
      return { attempts, browser: info.Browser, protocol: info['Protocol-Version'] };
    } catch (error) { lastError = error; }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(200, deadline - Date.now())));
  }
  throw new Error('CDP endpoint did not become ready within bounded deadline', { cause: lastError });
}

export async function prepareDeviceArtifacts(dir) {
  await mkdir(dir, { recursive: true });
  const consumer = await mkdtemp(path.join(tmpdir(), 'lgf-physical-cpu-'));
  const artifacts = [], tarballs = [];
  try {
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    for (const name of ['core', 'cpu', 'dom']) {
      const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir],
        { cwd: path.join(root, 'packages', name), encoding: 'utf8', timeout: 30000 }))[0];
      const tarball = path.join(dir, packed.filename), files = run('tar', ['-tzf', tarball]).trim().split('\n').map(f => f.replace(/^package\//, '')).sort();
      if (JSON.stringify(files) !== JSON.stringify(packageFiles[name])) throw new Error('Physical package inventory mismatch: ' + name);
      tarballs.push(tarball); artifacts.push({ name, sha256: hash(await readFile(tarball)), files });
    }
    await writeFile(path.join(dir, 'install.txt'), execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--save=false', ...tarballs],
      { cwd: consumer, encoding: 'utf8', timeout: 30000 }));
    for (const a of artifacts) {
      const packageRoot = path.join(consumer, 'node_modules/@liquid-glass-forge', a.name);
      if ((await lstat(packageRoot)).isSymbolicLink() || !(await realpath(packageRoot)).startsWith((await realpath(consumer)) + path.sep)) throw new Error('Expected physical installed artifact');
      for (const f of a.files) {
        const installed = await readFile(path.join(packageRoot, f)), expected = run('tar', ['-xOf', tarballs[artifacts.indexOf(a)], 'package/' + f]);
        if (!installed.equals(Buffer.from(expected))) throw new Error('Installed file mismatch: ' + a.name + '/' + f);
      }
    }
    const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async f => [f, hash(await readFile(path.join(root, f)))])));
    const producerSha256 = Object.fromEntries(await Promise.all(['tests/cpu-device-fixtures.mjs', 'scripts/qualify-cpu-device.mjs', 'spikes/phase-1/admission.mjs'].map(async f => [f, hash(await readFile(path.join(root, f)))])));
    return { consumer, artifacts, sourceSha256, producerSha256, async close() { await rm(consumer, { recursive: true, force: true }); } };
  } catch (error) { await rm(consumer, { recursive: true, force: true }); throw error; }
}

export async function deviceServer(artifacts) {
  const packageRoot = path.join(artifacts.consumer, 'node_modules/@liquid-glass-forge');
  const server = createServer((req, res) => { void (async () => {
    const url = new URL(req.url, 'http://localhost'); let file;
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Liquid Glass Forge CPU device fixture</title><link rel="stylesheet" href="/dom/styles.css"><script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core/index.js","@liquid-glass-forge/cpu":"/cpu/index.js","@liquid-glass-forge/dom":"/dom/index.js"}}</script><h1>CPU device fixture</h1>'); return; }
    if (url.pathname === '/fixtures.js') file = path.join(root, 'tests/cpu-device-fixtures.mjs');
    if (url.pathname === '/oracle.js') file = path.join(root, 'tests/cpu-oracle.mjs');
    if (url.pathname === '/worker-spy.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`import '/cpu/worker.js';let gpu=0;if(typeof OffscreenCanvas!=='undefined'){const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(type,...args){if(/webgl/i.test(type)){gpu++;throw new Error('CPU requested WebGL');}return get.call(this,type,...args);};}const post=globalThis.postMessage.bind(globalThis);globalThis.postMessage=(m,t)=>post({...m,webglRequests:gpu},t);`); return; }
    const match = /^\/(core|cpu|dom)\/([a-z-]+\.(?:js|css))$/.exec(url.pathname);
    if (match) file = path.join(packageRoot, match[1], 'dist', match[2]);
    if (!file) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
  })().catch(() => res.destroy()); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, port: server.address().port,
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } };
}

export async function collectDeviceCpu({ cdp, origin, deviceModel, androidVersion, dir, artifacts, smoke = false, idleProbe = false, conformanceOnly = false, forceCpuBacking = false }) {
  const receipt = { schema: 1, renderer: '@liquid-glass-forge/cpu', startedAt: new Date().toISOString(), environment: { kind: smoke ? 'headless-harness-smoke' : 'physical-android', transport: smoke ? 'Playwright launch' : 'CDP', deviceModel, androidVersion },
    artifacts: artifacts.artifacts, sourceSha256: artifacts.sourceSha256, producerSha256: artifacts.producerSha256, limits: ADMISSION.cpu, runs: [], pageErrors: [], completed: false };
  let browser, page;
  try {
    browser = smoke ? await chromium.launch() : await chromium.connectOverCDP(cdp, { timeout: 10000, noDefaults: true });
    receipt.environment.browserVersion = browser.version();
    page = smoke ? await browser.newPage() : await browser.contexts()[0].newPage();
    page.on('pageerror', error => receipt.pageErrors.push(error.message));
    await page.addInitScript(() => {
      window.physicalWebglRequests = 0;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (/webgl/i.test(type)) window.physicalWebglRequests++; return get.call(this, type, ...args); };
    });
    await page.goto(origin); await page.bringToFront();
    if(idleProbe){receipt.diagnostic=await page.evaluate(async()=>(await import('/fixtures.js')).idleProbe());receipt.completed=true;receipt.pass=true;return receipt;}
    receipt.conformance = await page.evaluate(async hint => (await import('/fixtures.js')).conformance(hint), forceCpuBacking);
    await page.fill('#physical-input', 'physical CPU input'); await page.click('#physical-button');
    receipt.native = await page.evaluate(() => window.finishPhysicalNative());
    receipt.native.pass = receipt.native.value === 'physical CPU input' && receipt.native.clicks === 1 && receipt.native.state === 'ready' && receipt.native.canvasGone;
    await page.screenshot({ path: path.join(dir, 'device-conformance.png') });
    if (!smoke && !conformanceOnly) for (const execution of ['off', 'required']) for (let repeat = 1; repeat <= 2; repeat++) {
      const result = await page.evaluate(async ({ execution, repeat }) => (await import('/fixtures.js')).workload(execution, repeat), { execution, repeat });
      if (result.diagnostic || result.warmup !== 15 || result.frames !== 90 || result.rawFrames.length !== 90 ||
          !result.rawFrames.every((f, i) => f.frame === i && f.optics?.radius === 36 && f.optics?.bevel === 30 && f.optics?.strength === 12 + ((i + 15) % 20) / 5)) {
        throw new Error('Physical qualification requires the complete original changing-optics workload');
      }
      const p95 = key => result.rawFrames.map(f => f[key]).sort((a, b) => a - b)[Math.ceil(result.frames * .95) - 1];
      result.p95 = Object.fromEntries(['acquisitionMs', 'captureMs', 'rateWaitMs', 'snapshotMs', 'transferCopyMs', 'prepareMs', 'kernelMs', 'transferSubmitMs', 'roundTripMs', 'presentationWaitMs', 'presentationMs', 'batchMs', 'intervalMs', 'completionAgeMs'].map(k => [k, p95(k)]));
      result.budgetPass = result.environment.visibility === 'visible' && result.p95.batchMs <= ADMISSION.cpu.batchMs && result.p95.intervalMs <= ADMISSION.cpu.intervalMs && result.p95.completionAgeMs <= ADMISSION.cpu.ageMs && result.accountedImageBytes <= ADMISSION.cpu.bytes;
      receipt.runs.push(result);
      await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
      console.log(JSON.stringify({ execution, repeat, p95: result.p95, bytes: result.accountedImageBytes, budgetPass: result.budgetPass }));
    }
    receipt.webglRequests = await page.evaluate(() => window.physicalWebglRequests) + receipt.conformance.workerWebglRequests;
    receipt.completed = true;
    receipt.pass = receipt.conformance.pass && receipt.native.pass && receipt.pageErrors.length === 0 && receipt.webglRequests === 0 && (smoke || conformanceOnly || (receipt.runs.length === 4 && receipt.runs.every(r => r.budgetPass)));
    if (!smoke && !conformanceOnly && receipt.pass) await writeFile(path.join(root, 'private/phase-5/qualification.json'), JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) { receipt.error = error.stack; receipt.pass = false; return receipt; }
  finally {
    await page?.close().catch(error => { receipt.closeError = String(error); });
    if (smoke) await browser?.close();
    // Physical CLI disconnects by process exit after its own page/mappings close;
    // never call Browser.close on the user's connected Chrome session.
    receipt.endedAt = new Date().toISOString(); await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  }
}

async function main() {
  const args = process.argv.slice(2), value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const smoke = args.includes('--smoke'), serial = value('--serial'), adb = (...a) => run('adb', [...(serial ? ['-s', serial] : []), ...a]).trim();
  const base = path.join(root, 'private/phase-5/devices'); await mkdir(base, { recursive: true });
  const dir = value('--out-dir') ?? await mkdtemp(path.join(base, smoke ? 'smoke-' : 'android-'));
  let artifacts, server, ownedForward, ownedReverse, receipt;
  const connection = { originalForward: smoke ? '' : adb('forward', '--list'), originalReverse: smoke || !serial ? '' : adb('reverse', '--list') };
  try {
    if (!smoke && !value('--cdp') && !serial) throw new Error('Use one observed authorized --serial or an explicit --cdp endpoint');
    artifacts = await prepareDeviceArtifacts(dir); server = await deviceServer(artifacts);
    let cdp = value('--cdp');
    if (!smoke && !cdp) {
      if (connection.originalReverse.split('\n').some(l => l.split(/\s+/)[1] === 'tcp:' + server.port)) throw new Error('Refusing to replace an existing reverse mapping');
      adb('reverse', 'tcp:' + server.port, 'tcp:' + server.port); ownedReverse = 'tcp:' + server.port;
      const activity = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', 'com.android.chrome').split('\n').find(l => l.includes('/') && !l.includes(' '));
      if (!activity) throw new Error('Chrome launcher not found');
      adb('shell', 'am', 'start', '-n', activity);
      const port = adb('forward', 'tcp:0', 'localabstract:chrome_devtools_remote');
      if (!/^\d+$/.test(port)) throw new Error('Unknown owned CDP port'); ownedForward = 'tcp:' + port; cdp = 'http://127.0.0.1:' + port;
    }
    if (!smoke) connection.cdpReadiness = await awaitCdpEndpoint(cdp);
    const deviceModel = smoke ? 'headless' : value('--device-model') ?? adb('shell', 'getprop', 'ro.product.model');
    const androidVersion = smoke ? undefined : value('--android-version') ?? adb('shell', 'getprop', 'ro.build.version.release');
    receipt = await collectDeviceCpu({ cdp, origin: value('--base-url') ?? server.origin, deviceModel, androidVersion, dir, artifacts, smoke, idleProbe:args.includes('--idle-probe'),conformanceOnly:args.includes('--conformance-only'),forceCpuBacking:args.includes('--force-cpu-backing') });
  } finally {
    if (ownedForward) adb('forward', '--remove', ownedForward);
    if (ownedReverse) adb('reverse', '--remove', ownedReverse);
    await server?.close(); await artifacts?.close();
    connection.finalForward = smoke ? '' : adb('forward', '--list'); connection.finalReverse = smoke || !serial ? '' : adb('reverse', '--list');
    await writeFile(path.join(dir, 'connection-cleanup.json'), JSON.stringify(connection, null, 2));
  }
  console.log(JSON.stringify({ receipt: path.join(dir, 'receipt.json'), completed: receipt?.completed, pass: receipt?.pass, error: receipt?.error ?? null,
    conformance: receipt?.conformance && { pass: receipt.conformance.pass, max: receipt.conformance.maxByteError, mean: receipt.conformance.meanByteError, idleExact: receipt.conformance.idleExact } }));
  process.exit(receipt?.pass ? 0 : 1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack); process.exit(1); });
