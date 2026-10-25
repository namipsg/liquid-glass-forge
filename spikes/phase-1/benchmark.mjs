import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { platform, release, arch, cpus, totalmem } from 'node:os';
import { startServers } from './server.mjs';
import { evaluateAdmission } from './admission.mjs';

// Raw measurements are local-only by default. No publishable benchmark claim is
// inferred from this command, and no runtime telemetry is sent by the spike.
const destination = fileURLToPath(new URL('../../private/phase-1/results/desktop/', import.meta.url));
await mkdir(destination, { recursive: true, mode: 0o700 });
const names = process.argv.filter(arg => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
const selected = names.length ? names : ['chrome', 'firefox', 'webkit'];
const engines = { chrome: chromium, chromium, firefox, webkit };
if (selected.some(name => !engines[name])) throw new Error('Use chrome, chromium, firefox or webkit');
const headed = process.argv.includes('--headed');
const admission = process.argv.includes('--admission');
const server = await startServers(4173);
try {
  for (const name of selected) {
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const receipt = { schema: 1, timestamp: stamp, name, headed,
      host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, totalMemoryBytes: totalmem() },
      note: 'Playwright WebKit is not actual Safari. Headless results are a separate lane from hardware/browser qualification.' };
    let browser;
    try {
      browser = await engines[name].launch({ headless: !headed, ...(name === 'chrome' ? { channel: 'chrome' } : {}) });
      receipt.browserVersion = browser.version();
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
      await page.bringToFront();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.url}/?mode=cpu`);
      await page.waitForFunction(() => window.phase1Ready || window.phase1Error);
      const init = await page.evaluate(() => ({ error: window.phase1Error, acquisitionMs: window.phase1?.acquisitionMs, cpuFirstFrameMs: window.phase1?.cpuFirstFrameMs }));
      if (init.error) throw new Error(init.error);
      receipt.acquisitionMs = init.acquisitionMs;
      receipt.cpuFirstFrameMs = init.cpuFirstFrameMs;
      receipt.cpu = await page.evaluate(() => window.phase1.benchmark({ backend: 'cpu', frames: 90, warmup: 15 }));
      receipt.webgl = await page.evaluate(() => window.phase1.benchmark({ backend: 'webgl', count: 4, width: 640, height: 360, frames: 90, warmup: 15 }));
      if (admission) {
        receipt.cpuRepeat2 = await page.evaluate(() => window.phase1.benchmark({ backend: 'cpu', frames: 90, warmup: 15 }));
        receipt.webglRepeat2 = await page.evaluate(() => window.phase1.benchmark({ backend: 'webgl', count: 4, width: 640, height: 360, frames: 90, warmup: 15 }));
        receipt.admission = evaluateAdmission(receipt);
        if (!receipt.admission.pass) process.exitCode = 1;
      }
      receipt.gpuIdentity = await page.evaluate(async () => {
        const { createWebGLRenderer } = await import('/webgl.mjs');
        const renderer = createWebGLRenderer(window.phase1.source);
        try {
          const gl = renderer.context, debug = gl.getExtension('WEBGL_debug_renderer_info');
          return { vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
            unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
            unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null };
        } finally { renderer.destroy(); }
      });
      receipt.pageErrors = errors;
      await page.goto(server.url);
      await page.waitForFunction(() => window.phase1Ready || window.phase1Error);
      await page.screenshot({ path: `${destination}/${stamp}-${name}.png`, fullPage: true });
      console.log(JSON.stringify({ name, headed, cpuBatchP95Ms: receipt.cpu.batchMs.p95, cpuIntervalP95Ms: receipt.cpu.frameIntervalMs.p95,
        webglBatchP95Ms: receipt.webgl.batchMs.p95, webglIntervalP95Ms: receipt.webgl.frameIntervalMs.p95,
        admission: receipt.admission?.pass ?? null, gpuIdentity: receipt.gpuIdentity }));
    } catch (error) {
      receipt.error = `${error.name}: ${error.message}`;
      process.exitCode = 1;
      console.error(`${name}: ${receipt.error}`);
    } finally {
      await browser?.close();
      await writeFile(`${destination}/${stamp}-${name}.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    }
  }
} finally { await server.close(); }
