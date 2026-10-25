// Real-device companion for the browser conformance suite. These evaluators use
// the same fixtures and frozen max=3 / mean=0.5 channel tolerances.
// Results default to ignored private/; never use a public output path.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const options = {
  transport: process.env.PHASE1_DEVICE ?? 'android',
  url: process.env.PHASE1_URL ?? 'http://127.0.0.1:4183',
  cdp: process.env.PHASE1_CDP ?? 'http://127.0.0.1:9225',
  webdriver: process.env.PHASE1_WEBDRIVER ?? 'http://127.0.0.1:4447',
  session: process.env.PHASE1_WEBDRIVER_SESSION,
};
const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, 'private/phase-1/results/devices');

async function webdriver(path, method = 'GET', data) {
  const response = await fetch(`${options.webdriver}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = (await response.json()).value;
  if (!response.ok || result?.error) throw new Error(`${result?.error}: ${result?.message}`);
  return result;
}

async function attach() {
  if (options.transport === 'android') {
    // Open and close only our page. Disconnecting the Node process below leaves
    // the user's browser and other pages intact.
    const browser = await chromium.connectOverCDP(options.cdp);
    const page = await browser.contexts()[0].newPage();
    await page.addInitScript(() => {
      window.webglContextRequests = 0;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) window.webglContextRequests++;
        return original.call(this, kind, ...args);
      };
    });
    return { capabilities: { transport: 'CDP', version: browser.version() },
      goto: url => page.goto(url), run: fn => page.evaluate(fn),
      screenshot: path => page.screenshot({ path }), close: () => page.close() };
  }
  if (options.transport !== 'safari') throw new Error('PHASE1_DEVICE must be android or safari');
  const session = options.session ? { sessionId: options.session, capabilities: null } :
    await webdriver('/session', 'POST', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  const path = `/session/${session.sessionId}`;
  await webdriver(`${path}/timeouts`, 'POST', { script: 60000, pageLoad: 30000 });
  return { capabilities: session.capabilities,
    goto: url => webdriver(`${path}/url`, 'POST', { url }),
    run: async fn => {
      const result = await webdriver(`${path}/execute/async`, 'POST', {
        script: `const done = arguments[arguments.length - 1]; Promise.resolve().then(${fn.toString()}).then(value => done({value}), error => done({error: String(error.stack || error)}));`, args: [],
      });
      if (result.error) throw new Error(result.error);
      return result.value;
    },
    screenshot: async file => writeFile(file, Buffer.from(await webdriver(`${path}/screenshot`), 'base64'), { mode: 0o600 }),
    close: () => webdriver(path, 'DELETE') };
}

const cpuCheck = async () => {
    const { prepareSource, renderCpu } = await import('/cpu.mjs');
    const { source, cpuCanvas, cpuOptions } = window.phase1;
    const painted = cpuCanvas.getContext('2d').getImageData(0, 0, cpuCanvas.width, cpuCanvas.height).data;
    const flat = renderCpu(prepareSource(source), { ...cpuOptions, strength: 0 });
    let changed = 0;
    let visible = 0;
    for (let i = 0; i < painted.length; i += 4) {
      if (painted[i + 3] > 0) visible++;
      if (Math.abs(painted[i] - flat[i]) + Math.abs(painted[i + 1] - flat[i + 1]) + Math.abs(painted[i + 2] - flat[i + 2]) > 6) changed++;
    }
    return { contexts: window.webglContextRequests, changed, visible };
  };

const parityCheck = async () => {
    const { prepareSource, renderCpu } = await import('/cpu.mjs');
    const { createWebGLRenderer } = await import('/webgl.mjs');
    function fixture(translucent) {
      const width = 40;
      const height = 32;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        data.set([(x * 17 + y * 3) % 256, (y * 19 + x * 2) % 256, ((x >> 2) + (y >> 2)) % 2 ? 240 : 25,
          translucent ? (x < 10 ? 0 : y < 16 ? 128 : 255) : 255], (y * width + x) * 4);
      }
      return { width, height, data };
    }
    const cases = [
      { name: 'identity orientation', options: { width: 40, height: 32, radius: 0, strength: 0 } },
      { name: 'rounded edge refraction', options: { width: 38, height: 30, radius: 10, bevel: 8, strength: 7 } },
      { name: 'cropped asymmetric source', options: { width: 31, height: 25, radius: 8, bevel: 7, strength: 4, sourceRect: { x: 3, y: 4, width: 31, height: 23 } } },
      { name: 'transparent hidden colors and fractional alpha', translucent: true, options: { width: 39, height: 31, radius: 9, bevel: 7, strength: 5 } },
    ];
    return cases.map(({ name, options, translucent }) => {
      const source = fixture(translucent);
      const original = source.data.slice();
      const prepared = prepareSource(source);
      const cpu = document.createElement('canvas');
      cpu.width = options.width;
      cpu.height = options.height;
      const context = cpu.getContext('2d');
      context.putImageData(new ImageData(renderCpu(prepared, options), options.width, options.height), 0, 0);
      const expected = context.getImageData(0, 0, options.width, options.height).data;
      const target = document.createElement('canvas');
      const renderer = createWebGLRenderer(source); // Throws if the required backend is unavailable.
      try {
        renderer.render(options, target);
        const actual = target.getContext('2d').getImageData(0, 0, options.width, options.height).data;
        let max = 0;
        let sum = 0;
        for (let i = 0; i < actual.length; i++) {
          const delta = Math.abs(actual[i] - expected[i]);
          max = Math.max(max, delta);
          sum += delta;
        }
        return { name, max, mean: sum / actual.length, backend: renderer.inspect().backend,
          sourceUnchanged: source.data.every((value, i) => value === original[i]),
          capabilities: { version: renderer.context.getParameter(renderer.context.VERSION), maxTextureSize: renderer.context.getParameter(renderer.context.MAX_TEXTURE_SIZE) } };
      } finally { renderer.destroy(); }
    });
  };

const sharedCheck = async () => {
    const { createWebGLRenderer } = await import('/webgl.mjs');
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let requests = 0;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) requests++;
      return originalGetContext.call(this, kind, ...args);
    };
    const data = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) data.set([230, 40, 70, x < 4 ? 255 : 0], (y * 8 + x) * 4);
    const renderer = createWebGLRenderer({ width: 8, height: 4, data });
    const first = document.createElement('canvas');
    const second = document.createElement('canvas');
    document.querySelector('#measurements').append(first, second);
    const opaque = { width: 12, height: 8, radius: 0, strength: 0, sourceRect: { x: 0, y: 0, width: 4, height: 4 } };
    function read(canvas) { return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; }
    try {
      renderer.render(opaque, first);
      const before = read(first).slice();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const afterIdle = read(first).slice();
      renderer.render({ ...opaque, width: 17, height: 11 }, second);
      const afterResize = read(first).slice();
      const preserved = afterResize.every((value, i) => value === before[i]);
      const idlePreserved = afterIdle.every((value, i) => value === before[i]);
      const differences = [];
      for (let i = 0; i < before.length && differences.length < 12; i++) if (afterResize[i] !== before[i]) differences.push({ channel: i, before: before[i], idle: afterIdle[i], afterResize: afterResize[i] });
      const opaqueAlpha = read(second)[3];
      const context = second.getContext('2d');
      context.beginPath(); context.rect(0, 0, 1, 1); context.clip();
      context.globalAlpha = 0.1;
      context.globalCompositeOperation = 'multiply';
      renderer.render({ ...opaque, width: 3, height: 5, sourceRect: { x: 4, y: 0, width: 4, height: 4 } }, second);
      const transparent = read(second).every(value => value === 0);
      const active = renderer.inspect();
      renderer.destroy(); renderer.destroy();
      const dead = renderer.inspect();
      let destroyedCode;
      try { renderer.render(opaque, first); } catch (error) { destroyedCode = error.code; }
      return { requests, preserved, idlePreserved, differences, opaqueAlpha, transparent, width: second.width, height: second.height, active, dead, destroyedCode };
    } finally {
      renderer.destroy();
      first.remove(); second.remove();
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  };

const lossCheck = async () => {
    const renderer = window.phase1.gpuRenderer;
    if (!renderer || renderer.inspect().backend !== 'webgl') throw new Error('Required WebGL preview did not start');
    const gl = renderer.context;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Required controlled context-loss capability is unavailable');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebGL context-loss event was not delivered')), 5000);
      gl.canvas.addEventListener('webglcontextlost', () => { clearTimeout(timeout); resolve(); }, { once: true });
      extension.loseContext();
    });
    const failure = window.phase1.renderGpu();
    const lost = renderer.inspect();
    renderer.destroy(); renderer.destroy();
    const dead = renderer.inspect();
    return { failure, lost, dead, visibleError: window.phase1Error };
  };

const sourceCheck = async () => {
    async function load(url, cors) {
      const image = new Image();
      if (cors) image.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Fixture image failed to load: ${url}`));
        image.src = url;
      });
      return image;
    }
    function errorName(action) {
      try { action(); return null; } catch (error) { return error.name; }
    }
    const noCorsImage = await load(`http://127.0.0.1:${Number(location.port) + 1}/fixture.svg`, false);
    const tainted = document.createElement('canvas');
    tainted.width = tainted.height = 8;
    tainted.getContext('2d').drawImage(noCorsImage, 0, 0);
    const taintError = errorName(() => tainted.getContext('2d').getImageData(0, 0, 1, 1));
    const corsImage = await load(`http://127.0.0.1:${Number(location.port) + 1}/fixture.svg?cors=1`, true);
    const approved = document.createElement('canvas');
    approved.width = approved.height = 8;
    const context = approved.getContext('2d');
    context.drawImage(corsImage, 0, 0);
    const approvedPixels = context.getImageData(0, 0, 8, 8).data;
    const domError = errorName(() => context.drawImage(document.body, 0, 0));
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) throw new Error('Required WebGL capability is unavailable; source restriction test cannot pass');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const uploadError = errorName(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noCorsImage));
    gl.deleteTexture(texture);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    let approvedAlpha = 0;
    for (let i = 3; i < approvedPixels.length; i += 4) approvedAlpha = Math.max(approvedAlpha, approvedPixels[i]);
    return { taintError, domError, uploadError, approvedLength: approvedPixels.length, approvedAlpha };
  };

const receipt = { recordedAt: new Date().toISOString(), transport: options.transport,
  criteria: { maxChannelDelta: 3, meanChannelDelta: 0.5 }, checks: {}, benchmarks: {} };
let adapter;
let failures = 0;
function record(name, actual, pass) { receipt.checks[name] = { pass, actual }; if (!pass) failures++; }
async function boot(mode = 'cpu') {
  await adapter.goto(`${options.url}/?mode=${mode}`);
  await adapter.run(async () => {
    const end = performance.now() + 10000;
    while (!window.phase1Ready && !window.phase1Error && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 25));
    if (window.phase1Error || !window.phase1Ready) throw new Error(window.phase1Error ?? 'boot timeout');
    return true;
  });
}
await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
try {
  adapter = await attach();
  receipt.capabilities = adapter.capabilities;
  await boot();
  receipt.environment = await adapter.run(() => ({ userAgent: navigator.userAgent, platform: navigator.platform,
    dpr: devicePixelRatio, width: innerWidth, height: innerHeight, visibility: document.visibilityState,
    acquisitionMs: window.phase1.acquisitionMs, source: { width: window.phase1.source.width, height: window.phase1.source.height },
    forcedCpuPreview: window.phase1.gpuRenderer === null }));
  // Safari WebDriver cannot install a pre-navigation script. Its boot WebGL
  // request count remains explicitly missing; the direct CPU path is checked.
  if (options.transport === 'safari') await adapter.run(() => {
    window.webglContextRequests = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) window.webglContextRequests++;
      return original.call(this, kind, ...args);
    };
  });
  const cpu = await adapter.run(cpuCheck);
  record('cpuRefraction', cpu, cpu.contexts === 0 && cpu.visible > 0 && cpu.changed > 10);
  receipt.cpuBootRequestInstrumentation = options.transport === 'android' ? 'pre-navigation, observed zero' : 'not collected: WebDriver lacks pre-navigation script installation';
  const parity = await adapter.run(parityCheck);
  record('parity', parity, parity.every(r => r.max <= 3 && r.mean <= .5 && r.backend === 'webgl' && r.sourceUnchanged));
  const shared = await adapter.run(sharedCheck);
  record('sharedSurfaceAndCleanup', shared, shared.requests === 1 && shared.preserved && shared.opaqueAlpha === 255 && shared.transparent && shared.width === 3 && shared.height === 5 && shared.active.renderCount === 3 && shared.dead.destroyed && shared.dead.estimatedOwnedBytes === 0 && Object.values(shared.dead.resources).every(n => n === 0) && shared.destroyedCode === 'DESTROYED');
  const source = await adapter.run(sourceCheck);
  record('sourceRestrictions', source, source.taintError === 'SecurityError' && source.uploadError === 'SecurityError' && source.domError === 'TypeError' && source.approvedLength === 256 && source.approvedAlpha > 0);
  receipt.graphics = await adapter.run(async () => {
    const { createWebGLRenderer } = await import('/webgl.mjs');
    const renderer = createWebGLRenderer(window.phase1.source);
    try { const gl = renderer.context, debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, resources: renderer.inspect() };
    } finally { renderer.destroy(); }
  });
  if (process.env.PHASE1_BENCHMARK === '1') {
    const repeats = Number(process.env.PHASE1_REPEATS ?? 2);
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('PHASE1_REPEATS must be 1..3');
    for (let index = 0; index < repeats; index++) {
      const suffix = index ? `Repeat${index + 1}` : '';
      receipt.benchmarks[`cpu${suffix}`] = await adapter.run(() => window.phase1.benchmark({ backend: 'cpu', count: 1, width: 320, height: 180, frames: 90, warmup: 15 }));
      receipt.benchmarks[`webgl${suffix}`] = await adapter.run(() => window.phase1.benchmark({ backend: 'webgl', count: 4, width: 640, height: 360, frames: 90, warmup: 15 }));
    }
    // Retain the original workload; reduced tiers are additional observations.
    if (Object.entries(receipt.benchmarks).some(([name, item]) => name.startsWith('cpu') && item.batchMs.p95 > 1000 / 30)) {
      for (let index = 0; index < repeats; index++) receipt.benchmarks[`cpuReduced${index + 1}`] = await adapter.run(() => window.phase1.benchmark({ backend: 'cpu', count: 1, width: 160, height: 90, frames: 90, warmup: 15 }));
    }
    if (Object.entries(receipt.benchmarks).some(([name, item]) => name.startsWith('webgl') && item.batchMs.p95 > 1000 / 60)) {
      for (let index = 0; index < repeats; index++) receipt.benchmarks[`webglReduced${index + 1}`] = await adapter.run(() => window.phase1.benchmark({ backend: 'webgl', count: 4, width: 320, height: 180, frames: 90, warmup: 15 }));
    }
    receipt.benchmarkCleanup = await adapter.run(() => ({ remainingTargets: document.querySelector('#measurements').children.length, visibility: document.visibilityState }));
    record('benchmarkCleanup', receipt.benchmarkCleanup, receipt.benchmarkCleanup.remainingTargets === 0);
  }
  const screenshots = resolve(root, 'private/phase-1/screenshots');
  await mkdir(screenshots, { recursive: true, mode: 0o700 });
  const screenshot = resolve(screenshots, `${options.transport}-cpu.png`);
  await adapter.screenshot(screenshot);
  await chmod(screenshot, 0o600);
  await boot('webgl');
  const gpuScreenshot = resolve(screenshots, `${options.transport}-webgl.png`);
  await adapter.screenshot(gpuScreenshot);
  await chmod(gpuScreenshot, 0o600);
  const loss = await adapter.run(lossCheck);
  record('contextLoss', loss, !loss.failure.ok && loss.failure.code === 'CONTEXT_LOST' && loss.lost.contextLost && /context.*lost/i.test(loss.visibleError) && loss.dead.destroyed && Object.values(loss.dead.resources).every(n => n === 0));
} catch (error) { receipt.error = String(error.stack ?? error); failures++; }
finally {
  if (adapter) { try { await adapter.close(); } catch (error) { receipt.closeError = String(error); failures++; } }
  receipt.failedChecks = failures;
  const file = resolve(output, `${options.transport}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ receipt: file, failedChecks: failures, error: receipt.error ?? null,
    checks: Object.fromEntries(Object.entries(receipt.checks).map(([name, item]) => [name, item.pass])),
    batchP95: Object.fromEntries(Object.entries(receipt.benchmarks).map(([name, item]) => [name, item.batchMs.p95])) }, null, 2));
  // CDP connection teardown by process exit keeps all pre-existing browser tabs.
  process.exit(failures ? 1 : 0);
}
