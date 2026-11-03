import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { cpuServer } from '../tests/cpu-worker-server.mjs';
import { ADMISSION } from '../spikes/phase-1/admission.mjs';
const base = new URL('../private/phase-5/benchmark/', import.meta.url); await mkdir(base, { recursive: true });
const dir = await mkdtemp(new URL('run-', base)), server = await cpuServer(); let browser;
const receipt = { schema: 1, lane: 'headless Chromium software measurement; not physical-device admission', limits: ADMISSION.cpu, runs: [] };
try {
  browser = await chromium.launch(); receipt.browser = browser.version(); const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  await page.goto(server.origin);
  for (const execution of ['off', 'required']) for (let repeat = 1; repeat <= 2; repeat++) {
    const result = await page.evaluate(async ({ execution, repeat }) => {
      const { SourceProvider, createCpuRenderer, mountGlassHost } = await import('/dom/index.js');
      const { CPU_LOOKUP_BYTES } = await import('/cpu/index.js');
      const data = new Uint8Array(640 * 360 * 4);
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) { const i = (y * 640 + x) * 4; data[i] = x % 256; data[i + 1] = y % 256; data[i + 2] = (x + y) % 256; data[i + 3] = 255; }
      const source = new SourceProvider({ kind: 'pixels', width: 640, height: 360, data });
      const acquisitionTarget = new Uint8ClampedArray(data.length);
      let strength = 12;
      const renderer = createCpuRenderer({ executor: { worker: execution }, surface: () => ({ radius: 36, bevel: 30, strength }) });
      const controller = new AbortController(), cleanup = renderer.initialize(controller.signal);
      const element = document.createElement('div'); element.style.cssText = 'width:320px;height:180px;display:block;'; document.body.append(element); const host = mountGlassHost(element);
      const rawFrames = []; let previousEnd;
      try {
        for (let i = 0; i < 105; i++) {
          strength = 12 + (i % 20) / 5;
          const revisionStart = performance.now(), acquired = performance.now(), snapshot = await source.readInto(acquisitionTarget), acquisitionMs = performance.now() - acquired;
          const frame = await renderer.render({ snapshot, width: 320, height: 180, dpr: 1, rect: { x: 0, y: 0, width: 320, height: 180 } }, controller.signal);
          const presentation = performance.now(); host.present(frame); const presentationMs = performance.now() - presentation, end = performance.now();
          const diagnostics = renderer.diagnostics, timings = diagnostics.timings;
          if (diagnostics.surface?.radius !== 36 || diagnostics.surface?.bevel !== 30 || diagnostics.surface?.strength !== strength) throw new Error('Original optical waveform was not rendered');
          if (!timings || frame.width !== 320 || frame.height !== 180 || diagnostics.backend !== 'cpu') throw new Error('Benchmark did not run the declared CPU workload');
          if (execution === 'required' && diagnostics.execution !== 'worker') throw new Error('Required worker was not effective');
          if (i >= 15) rawFrames.push({ frame: i - 15, optics: diagnostics.surface, acquisitionMs, captureMs: timings.captureMs, rateWaitMs: timings.rateWaitMs, snapshotMs: timings.snapshotMs, transferCopyMs: timings.transferCopyMs,
            prepareMs: timings.prepareMs, kernelMs: timings.kernelMs, transferSubmitMs: timings.transferSubmitMs,
            roundTripMs: timings.roundTripMs, presentationWaitMs: timings.presentationWaitMs, presentationMs, batchMs: acquisitionMs + timings.captureMs + timings.snapshotMs + timings.transferCopyMs + timings.roundTripMs + timings.presentationWaitMs + presentationMs,
            intervalMs: end - previousEnd, completionAgeMs: end - revisionStart, diagnostics });
          previousEnd = end; frame.release?.();
        }
        return { execution, repeat, source: { width: 640, height: 360, updatePolicy: 'static RGBA8 pixels; optical strength changes each frame', acquisition: 'full per-frame readInto copy to caller-owned target' }, opticalWaveform: 'radius36/bevel30/strength12+(i%20)/5', width: 320, height: 180, warmup: 15, frames: 90,
          environment: { visibility: document.visibilityState, focused: document.hasFocus(), dpr: devicePixelRatio, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency }, rawFrames,
          // Conservative known image-storage bound, not browser/driver/process memory:
          // decoded source + snapshot + optional staging + batch output; provider
          // snapshot and original borrowed input; target plus presentation ImageData.
          accountedImageBytes: 640 * 360 * 4 * 8 + 320 * 180 * 4 * 3 + CPU_LOOKUP_BYTES * (execution === 'required' ? 2 : 1) + 270000 };
      } finally { cleanup(); renderer.dispose(); source.destroy(); host.dispose(); element.remove(); }
    }, { execution, repeat });
    const p95 = key => [...result.rawFrames.map(f => f[key])].sort((a, b) => a - b)[Math.ceil(result.frames * .95) - 1];
    result.p95 = Object.fromEntries(['acquisitionMs', 'captureMs', 'rateWaitMs', 'snapshotMs', 'transferCopyMs', 'prepareMs', 'kernelMs', 'transferSubmitMs', 'roundTripMs', 'presentationWaitMs', 'presentationMs', 'batchMs', 'intervalMs', 'completionAgeMs'].map(key => [key, p95(key)]));
    result.budgetPass = result.p95.batchMs <= ADMISSION.cpu.batchMs && result.p95.intervalMs <= ADMISSION.cpu.intervalMs && result.p95.completionAgeMs <= ADMISSION.cpu.ageMs && result.accountedImageBytes <= ADMISSION.cpu.bytes;
    receipt.runs.push(result);
    console.log(JSON.stringify({ execution, repeat, p95: result.p95, accountedImageBytes: result.accountedImageBytes, budgetPass: result.budgetPass }));
  }
  receipt.complete = true; receipt.allHeadlessBudgetsPass = receipt.runs.every(r => r.budgetPass); receipt.physicalAdmission = 'pending';
} catch (error) { receipt.complete = false; receipt.error = error.stack; throw error; }
finally { await browser?.close(); await server.close(); await writeFile(new URL('receipt.json', `file://${dir}/`), JSON.stringify(receipt, null, 2)); console.log(`CPU benchmark receipt: ${dir}/receipt.json`); }
