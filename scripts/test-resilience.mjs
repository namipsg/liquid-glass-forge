import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, cp, rm, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from '@playwright/test';
import { packageFiles } from './pack-smoke.mjs';
import { auditPackage } from './package-audit.mjs';
import { consumerPackage, distributionVersions } from './distribution-artifacts.mjs';
import { integrationServers } from '../tests/integration-server.mjs';
import { configure, frame, opaqueCheck, staleCheck, lifecycleChecks, accessChecks } from '../tests/integration-checks.mjs';
import { regressionMutations } from '../tests/integration-mutations.mjs';
import { browserLaunchOptions } from '../tests/browser-launch.mjs';

const root = process.cwd(), sha = b => createHash('sha256').update(b).digest('hex');
const prepareOnly = process.argv.includes('--prepare-only');
const outputRoot = prepareOnly ? 'private/phase-11/candidates' : 'private/phase-10/integration';
await mkdir(outputRoot, { recursive: true });
const dir = await mkdtemp(path.resolve(outputRoot, 'run-'));
const consumer = await mkdtemp(path.join(tmpdir(), 'lgf-resilience-consumer-')), www = path.join(consumer, 'www');
const versions = { react: '19.3.1', 'react-dom': '19.3.1', vue: '3.5.44', vite: '8.3.5',
  '@angular/core': '22.2.4', '@angular/common': '22.2.4', '@angular/compiler': '22.2.4', '@angular/compiler-cli': '22.2.4',
  '@angular/platform-browser': '22.2.4', '@angular/build': '22.2.5', '@angular/cli': '22.2.5', typescript: '6.0.3', rxjs: '7.8.2', tslib: '2.9.1' };
const receipt = { startedAt: new Date().toISOString(), baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch }, versions, sourceSha256: {}, artifacts: [], checks: [], pass: false, temporaryConsumer: consumer };
receipt.distributionManifest=process.env.LGF_DISTRIBUTION_MANIFEST;
let server, browser;
async function command(exe, args, log) {
  const child = spawn(exe, args, { cwd: consumer, env: { ...process.env, NODE_ENV: 'production', NG_CLI_ANALYTICS: 'false', CI: '1', npm_config_ignore_scripts: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] }), chunks = [];
  child.stdout.on('data', b => chunks.push(b)); child.stderr.on('data', b => chunks.push(b));
  let timed = false; const timer = setTimeout(() => { timed = true; child.kill('SIGTERM'); }, 480000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); clearTimeout(timer);
  await writeFile(path.join(dir, log), Buffer.concat(chunks)); if (code !== 0 || timed) throw Error(log + ' failed: ' + code);
}
async function check(name, details = {}) { receipt.checks.push({ name, pass: true, ...details }); await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2)); }
async function attachPage(browser, adapter, engineName, deny = false, review = false) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const events = []; let scenario = review ? 'review-glass' : 'bootstrap';
  receipt.activeEvents = events;
  page.on('pageerror', error => events.push({ kind: 'pageerror', scenario, message: error.message }));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) events.push({ kind: message.type(), scenario, message: message.text(), location: message.location() }); });
  page.on('requestfailed', request => events.push({ kind: 'requestfailed', scenario, message: request.url(), failure: request.failure() }));
  page.on('response', response => { if (response.status() >= 400) events.push({ kind: 'http', scenario, message: response.url(), status: response.status() }); });
  await page.addInitScript(() => {
    window.gpuRequests = 0; window.rafRequests = 0; window.policyViolations = []; window.unhandled = [];
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { window.rafRequests++; return raf.call(window, callback); };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (/webgl/i.test(type)) window.gpuRequests++;
      // Only fixture readback targets opt into CPU-friendly readback storage.
      if (type === '2d' && this.classList.contains('lgf-surface')) args[0] = { ...args[0], willReadFrequently: true };
      return get.call(this, type, ...args);
    };
    window.addEventListener('securitypolicyviolation', event => window.policyViolations.push({ directive: event.effectiveDirective, uri: event.blockedURI }));
    window.addEventListener('unhandledrejection', event => window.unhandled.push(String(event.reason)));
  });
  const response = await page.goto(server.origin + '/' + adapter + '/?other=' + encodeURIComponent(server.other) + (deny ? '&deny-worker=1' : '') + (review ? '&review=1' : ''));
  const csp = response.headers()['content-security-policy'];
  assert.match(csp, /script-src 'self';/); assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  await page.waitForFunction(() => !!window.phase10);
  return { page, events, csp, setScenario(value) { scenario = value; }, async audit() {
    const violations = await page.evaluate(() => window.policyViolations), unhandled = await page.evaluate(() => window.unhandled);
    assert.deepEqual(unhandled, []);
    if (deny) { assert.ok(violations.length > 0); assert.ok(violations.every(v => v.directive === 'worker-src' && v.uri === server.origin + '/worker/worker.js')); }
    else assert.deepEqual(violations, []);
    const expected = event => {
      // Chromium reports the atlas's bounded startup encoding calibration readback.
      if (engineName === 'chromium' && event.kind === 'warning' && ['webgl', 'access', 'shader-cpu', 'auto-live', 'review-glass'].includes(event.scenario) && /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/.test(event.message)) return true;
      // The full-screen gl_VertexID triangle has no vertex arrays; Firefox/macOS
      // documents its OpenGL emulation cost. Preserve that exact diagnostic.
      if (engineName === 'firefox' && event.kind === 'warning' && ['webgl', 'review-glass'].includes(event.scenario) && event.message === '[JavaScript Warning: "WebGL warning: drawArraysInstanced: Drawing without vertex attrib 0 array enabled forces the browser to do expensive emulation work when running on desktop OpenGL platforms, for example on Mac. It is preferable to always draw with vertex attrib 0 array enabled, by using bindAttribLocation to bind some always-used attribute to location 0."]') return true;
      if (engineName === 'firefox' && event.kind === 'warning' && ['shader-cpu', 'auto-live'].includes(event.scenario) && /^\[JavaScript Warning: "WebGL context was lost\." \{file: ".+" line: \d+\}\]$/.test(event.message)) return true;
      if (event.scenario === 'cors-request' && (event.message.includes(server.other + '/fixture.png') || event.location?.url === server.other + '/fixture.png') && (event.kind === 'requestfailed' || /cors|cross.origin|access.control|load.*resource/i.test(event.message))) return true;
      if (engineName === 'webkit' && event.kind === 'error' && event.scenario === 'cors' && event.message === 'Unable to get image data from canvas because the canvas has been tainted by cross-origin data.' && event.location?.url.startsWith(server.origin + '/' + adapter + '/')) return true;
      if (engineName === 'webkit' && event.kind === 'error' && event.scenario === 'cors-request' && event.message === 'Origin ' + server.origin + ' is not allowed by Access-Control-Allow-Origin. Status code: 200' && events.some(e => e.scenario === 'cors-request' && e.kind === 'requestfailed' && e.message === server.other + '/fixture.png')) return true;
      if (event.scenario === 'source-timeout' && event.kind === 'requestfailed' && event.message.endsWith('/hang.png')) return true;
      if (deny && ['worker', 'worker-auto'].includes(event.scenario) && /worker|content.security.policy/i.test(event.message)) return true;
      return false;
    };
    const unexpected = events.filter(event => !expected(event));
    await writeFile(path.join(dir, `${engineName}-${adapter}${deny ? '-denied' : review ? '-review' : ''}-events.json`), JSON.stringify({ events, expectedDiagnostics: events.map(event => ({ ...event, expected: expected(event) })), violations, unhandled, csp }, null, 2));
    assert.deepEqual(unexpected, [], 'unexpected console/network/page error');
  } };
}

try {
  for (const file of ['scripts/test-resilience.mjs', 'tests/integration-server.mjs', 'tests/integration-checks.mjs', 'tests/integration-mutations.mjs', 'tests/opaque-browser.test.mjs', ... (await readdir('tests/fixtures/integration')).map(f => 'tests/fixtures/integration/' + f)]) receipt.sourceSha256[file] = sha(await readFile(file));
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const tarballs = [];
  for (const [name, inventory] of Object.entries(packageFiles)) {
    const packed = consumerPackage(name,dir);
    const file = path.join(dir, packed.filename), files = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).trim().split('\n').map(f => f.replace(/^package\//, '')).sort();
    assert.deepEqual(files, inventory);
    auditPackage(JSON.parse(execFileSync('tar', ['-xOf', file, 'package/package.json'], { encoding: 'utf8' })), files,
      { internalVersions: distributionVersions(), installedPeers: versions });
    tarballs.push(file); receipt.artifacts.push({ name, files, sha256: sha(await readFile(file)) });
  }
  console.log('Install seven physical packages and pinned production build dependencies');
  await command('npm', ['install', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', '--save-exact', ...tarballs, ...Object.entries(versions).map(([n, v]) => n + '@' + v)], 'install.txt');
  await cp(path.join(consumer, 'package-lock.json'), path.join(dir, 'consumer-package-lock.json'));
  for (let i = 0; i < receipt.artifacts.length; i++) {
    const a = receipt.artifacts[i], installed = path.join(consumer, 'node_modules/@liquid-glass-forge', a.name);
    assert.equal((await lstat(installed)).isSymbolicLink(), false);
    for (const f of a.files) assert.deepEqual(await readFile(path.join(installed, f)), execFileSync('tar', ['-xOf', tarballs[i], 'package/' + f]));
  }
  for (const [name, version] of Object.entries(versions)) assert.equal(JSON.parse(await readFile(path.join(consumer, 'node_modules', name, 'package.json'))).version, version);
  await check('physical seven-package byte inventories and exact peers/tool versions');
  await cp('tests/fixtures/integration', path.join(consumer, 'src'), { recursive: true });
  for (const name of ['vanilla', 'react', 'vue']) {
    await mkdir(path.join(consumer, 'entry', name), { recursive: true });
    await writeFile(path.join(consumer, 'entry', name, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 10 ${name}</title></head><body><script type="module" src="../../src/${name === 'react' ? 'react.jsx' : name + '.mjs'}"></script></body></html>`);
  }
  await writeFile(path.join(consumer, 'build-vite.mjs'), `import {build} from 'vite';import path from 'node:path';for(const name of ['vanilla','react','vue'])await build({root:path.resolve('entry',name),base:'/'+name+'/',build:{outDir:path.resolve('www',name),emptyOutDir:true}});`);
  await command(process.execPath, ['build-vite.mjs'], 'vite-builds.txt');
  await writeFile(path.join(consumer, 'src/index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 10 Angular</title><base href="/angular/"></head><body></body></html>');
  await writeFile(path.join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'preserve', moduleResolution: 'bundler', lib: ['ES2022', 'DOM'], types: [], strict: true, allowJs: true, experimentalDecorators: true, skipLibCheck: false, outDir: 'out-tsc' }, angularCompilerOptions: { strictTemplates: true }, files: ['src/angular.ts'] }));
  await writeFile(path.join(consumer, 'angular.json'), JSON.stringify({ version: 1, cli: { analytics: false }, projects: { integration: { projectType: 'application', root: '', sourceRoot: 'src', architect: { build: { builder: '@angular/build:application', options: { browser: 'src/angular.ts', index: 'src/index.html', outputPath: 'www/angular', tsConfig: 'tsconfig.json', polyfills: [], aot: true, optimization: { scripts: true, styles: { minify: true, inlineCritical: false }, fonts: false }, styles: ['src/styles.css'], outputHashing: 'all' } } } } } }));
  await command(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', 'integration'], 'angular-build.txt');
  // Keep every consumer under one app prefix. Workers retain the packed relative graph.
  await cp(path.join(www, 'angular/browser'), path.join(www, 'angular-flat'), { recursive: true });
  await rm(path.join(www, 'angular'), { recursive: true }); await cp(path.join(www, 'angular-flat'), path.join(www, 'angular'), { recursive: true }); await rm(path.join(www, 'angular-flat'), { recursive: true });
  await cp(path.join(consumer, 'node_modules/@liquid-glass-forge/cpu/dist'), path.join(www, 'worker'), { recursive: true });
  if (prepareOnly) {
    for (const name of ['core', 'cpu', 'dom', 'webgl']) await cp(path.join(consumer, 'node_modules/@liquid-glass-forge', name, 'dist'), path.join(www, name), { recursive: true });
    for (const [source, destination] of [['tests/cpu-device-fixtures.mjs', 'cpu-device-fixtures.js'], ['tests/webgl-fixtures.mjs', 'webgl-fixtures.js'], ['tests/cpu-oracle.mjs', 'oracle.js'], ['tests/remote-qualification.mjs', 'remote-qualification.js'], ['tests/qualification-bench.mjs', 'qualification-bench.js'], ['spikes/phase-1/fixture.svg', 'fixture.svg']]) await cp(source, path.join(www, destination));
    await cp('tests/qualification-controller.mjs', path.join(www, 'qualification-controller.js'));
    await cp('docs/qualification-plan.json', path.join(www, 'qualification-plan.json'));
    await writeFile(path.join(www, 'remote.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Liquid Glass Forge qualification</title><link rel="stylesheet" href="/remote.css"><p id="status">Preparing Windows qualification</p><main id="stage"></main><script type="module" src="/remote-qualification.js"></script></html>');
    await writeFile(path.join(www, 'remote.css'), 'body{margin:0;font:16px system-ui;background:#eef4f4;color:#142b32}#status{margin:0;height:36px;line-height:36px;padding-left:12px}#stage{position:relative}iframe{display:block;border:0;width:100%;height:calc(100dvh - 36px)}');
    await writeFile(path.join(www, 'bench.css'), 'body{margin:0}#measurements{display:grid;grid-template-columns:repeat(auto-fit,320px);max-width:640px;gap:0;line-height:0}');
    const map = JSON.stringify({ imports: { '@liquid-glass-forge/core': '/core/index.js', '@liquid-glass-forge/cpu': '/cpu/index.js', '@liquid-glass-forge/dom': '/dom/index.js', '@liquid-glass-forge/webgl': '/webgl/index.js', '@liquid-glass-forge/webgl/dom': '/webgl/dom.js' } });
    await writeFile(path.join(www, 'bench.html'), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/dom/styles.css"><link rel="stylesheet" href="/bench.css"><script type="importmap">' + map + '</script><section id="measurements"></section><script type="module" src="/qualification-bench.js"></script>');
    await writeFile(path.join(www, 'soak.html'), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/soak.css"><h1>Phase 11 dynamic qualification</h1><main>' + ['vanilla','react','vue','angular'].map(name => '<iframe title="' + name + '" src="/' + name + '/?qualification=1"></iframe>').join('') + '</main><script type="module" src="/qualification-controller.js"></script>');
    await writeFile(path.join(www, 'soak.css'), 'body{margin:0;font:14px system-ui}h1{font-size:14px;margin:0;height:24px}main{position:relative}iframe{position:absolute;width:640px;height:360px;border:0;transform-origin:top left}');
  }
  await cp(www, path.join(dir, 'review-www'), { recursive: true });
  receipt.reviewAssets = path.relative(root, path.join(dir, 'review-www'));
  await check('production linked vanilla/React/Vue/Angular applications; no runtime JIT');
  if (prepareOnly) { receipt.prepared = true; receipt.pass = false; receipt.status = 'prepared; not a qualification pass'; }
  else {
  server = await integrationServers(www);
  for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
    const options = browserLaunchOptions(engineName);
    browser = await engine.launch(options);
    if (options.headless === false) receipt.firefoxGraphics = 'Xvfb with software OpenGL';
    for (const adapter of ['vanilla', 'react', 'vue', 'angular']) {
      console.log(engineName + ' / ' + adapter + ' forced backends, lifecycle and faults');
      const lane = await attachPage(browser, adapter, engineName), { page } = lane;
      for (const backend of ['cpu', 'worker', 'webgl']) { lane.setScenario(backend); await check(engineName + '/' + adapter + '/' + backend + ' output/native/resize/drag/transition/navigation/resources', { browserVersion: browser.version(), result: await lifecycleChecks(page, backend) }); }
      const faults = [['gpu-none', 'WEBGL_UNAVAILABLE'], ['worker-crash', 'WORKER_FAILED'], ['worker-timeout', 'TIMEOUT'], ['decode', 'DECODE_FAILED'], ['cors', 'UNREADABLE_SOURCE'], ['cors-request', 'DECODE_FAILED'], ['source-timeout', 'TIMEOUT'], ['timeout-init', 'TIMEOUT']];
      for (const [name, code] of faults) {
        lane.setScenario(name); await configure(page, name);
        await page.waitForFunction(() => window.phase10.state.run.errors.length > 0);
        const errors = await page.evaluate(() => window.phase10.state.run.errors); assert.ok(errors.some(e => e.codes.includes(code)), name + ': ' + JSON.stringify(errors));
        assert.equal(await page.evaluate(() => window.phase10.state.run.completed), 0, 'failed forced backend silently produced a fallback frame');
        if (name === 'timeout-init') {
          assert.equal(await page.evaluate(() => window.phase10.state.run.initSignal.aborted), true);
          await page.evaluate(() => window.phase10.state.run.pendingInit.splice(0).forEach(resolve => resolve()));
        }
        await page.waitForFunction(() => window.phase10.state.run.active === 0 && window.phase10.state.run.subscriptions === 0);
        await page.fill('#name-0', 'Readable failure fallback'); assert.equal(await page.inputValue('#name-0'), 'Readable failure fallback');
        await check(engineName + '/' + adapter + '/' + name + ' bounded typed failure/native fallback', { errors });
      }
      for (const name of ['gpu-cpu', 'gpu-material', 'shader-cpu']) {
        lane.setScenario(name); await configure(page, name); await page.waitForFunction(() => window.phase10.state.run.completed > 0);
        const diagnostics = await page.evaluate(() => window.phase10.state.run.diagnostics());
        assert.equal(diagnostics.effectiveBackend, name === 'gpu-material' ? 'material' : 'cpu');
        assert.equal(diagnostics.fallbackReason, name === 'shader-cpu' ? 'SHADER_COMPILE_FAILED' : 'WEBGL_UNAVAILABLE');
        assert.equal(diagnostics.gpu.ownedImageBytes, 0); assert.ok(Object.values(diagnostics.gpu.resources).every(count => count === 0));
        if (name !== 'gpu-material') await frame(page);
        assert.deepEqual(await page.evaluate(() => window.phase10.state.run.errors), []);
        await check(engineName + '/' + adapter + '/' + name + ' configured fallback', { diagnostics });
      }
      lane.setScenario('held-worker'); await staleCheck(page); await check(engineName + '/' + adapter + '/held-worker superseded/destroyed output release');
      lane.setScenario('held-init'); await configure(page, 'held-init'); await page.waitForFunction(() => window.phase10.state.run.pendingInit.length > 0);
      await page.evaluate(() => window.phase10.unmount()); assert.equal(await page.evaluate(() => window.phase10.state.run.initSignal.aborted), true);
      await page.evaluate(() => window.phase10.state.run.pendingInit.splice(0).forEach(resolve => resolve())); await page.waitForFunction(() => window.phase10.state.run.active === 0);
      await check(engineName + '/' + adapter + '/held-init abort and late cleanup');
      lane.setScenario('access'); await check(engineName + '/' + adapter + '/access semantics/keyboard/focus/opaque/preferences', { result: await accessChecks(page, engineName, dir, adapter) });
      lane.setScenario('auto-live'); await configure(page, 'auto-live'); await frame(page);
      const loss = await page.evaluate(() => { const gl = window.phase10.state.run.optical.atlas.context, ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return false; ext.loseContext(); return true; });
      if (loss) {
        await page.waitForFunction(() => window.phase10.state.run.optical.atlas.context.isContextLost());
        await page.evaluate(() => window.phase10.update()); await frame(page, 1, 255);
        assert.equal(await page.evaluate(() => window.phase10.state.run.diagnostics().effectiveBackend), 'cpu');
      }
      await check(engineName + '/' + adapter + '/native context loss capability and explicit auto fallback', { supported: loss });
      await page.evaluate(() => window.phase10.destroy()); await lane.audit(); await page.close();
      const denied = await attachPage(browser, adapter, engineName, true);
      denied.setScenario('worker'); await configure(denied.page, 'worker'); await denied.page.waitForFunction(() => window.phase10.state.run.errors.length > 0);
      assert.ok((await denied.page.evaluate(() => window.phase10.state.run.errors)).some(e => e.codes.includes('WORKER_FAILED')));
      denied.setScenario('worker-auto'); await configure(denied.page, 'worker-auto'); await frame(denied.page);
      const fallback = await denied.page.evaluate(() => window.phase10.state.run.diagnostics()); assert.equal(fallback.cpu.execution, 'main');
      assert.equal(fallback.cpu.executor.fallbackReason, 'WORKER_FAILED');
      await denied.page.evaluate(() => window.phase10.destroy()); await denied.audit(); await denied.page.close();
      await check(engineName + '/' + adapter + '/CSP worker denial required failure and auto main fallback', { fallback });
      const review = await attachPage(browser, adapter, engineName, false, true);
      await review.page.waitForFunction(() => window.phase10.state.run?.completed > 0);
      const pattern = await review.page.evaluate(() => {
        const c = document.querySelector('.test-card > canvas'); return { backend: window.phase10.state.run.diagnostics().effectiveBackend,
          corner: [...c.getContext('2d').getImageData(0, 0, 1, 1).data], center: [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data] };
      });
      assert.equal(pattern.backend, 'webgl'); assert.equal(pattern.corner[3], 0); assert.equal(pattern.center[3], 255);
      assert.ok(pattern.center[0] > 50 && pattern.center[0] < 240);
      await review.page.screenshot({ path: path.join(dir, `${engineName}-${adapter}-review-glass.png`) });
      await review.page.click('#opaque'); const opaque = await opaqueCheck(review.page, path.join(dir, `${engineName}-${adapter}-review-opaque.png`));
      review.setScenario('auto-live'); await review.page.evaluate(() => window.phase10.destroy()); await review.audit(); await review.page.close();
      await check(engineName + '/' + adapter + '/review actual patterned glass and explicit opaque control', { pattern, opaque });
    }
    await browser.close(); browser = undefined;
  }
  console.log('Remove installed resize/revision fixes and verify shared regression detectors fail');
  browser = await chromium.launch();
  await regressionMutations({ consumer, www, server, browser, command, check });
  await browser.close(); browser = undefined;
  receipt.pass = true;
  }
} catch (error) {
  receipt.error = error.stack;
  const page = browser?.contexts().flatMap(context => context.pages()).at(-1);
  if (page) { receipt.failure = await page.evaluate(() => ({ run: window.phase10?.state.run ? { name: window.phase10.state.run.name, active: window.phase10.state.run.active, errors: window.phase10.state.run.errors, diagnostics: window.phase10.state.run.diagnostics() } : null, html: document.body.innerHTML, violations: window.policyViolations })).catch(() => undefined); await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {}); }
  throw error;
} finally {
  await browser?.close(); await server?.close(); await rm(consumer, { recursive: true, force: true });
  receipt.endedAt = new Date().toISOString(); await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ dir, pass: receipt.pass, error: receipt.error }));
}
