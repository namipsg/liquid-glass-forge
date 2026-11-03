import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from '@playwright/test';
import { cpuServer } from './cpu-worker-server.mjs';
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: actual CPU worker/main parity, no WebGL and bounded CSP fallback`, { timeout: 60000 }, async () => {
    const server = await cpuServer(); let browser; const receipt = { engine: name };
    const base = new URL('../private/phase-5/worker/', import.meta.url); await mkdir(base, { recursive: true }); const dir = await mkdtemp(new URL('run-', base));
    try {
      browser = await engine.launch(); receipt.version = browser.version(); const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto(server.origin);
      receipt.parity = await page.evaluate(async () => {
        const { createSource, createFrame } = await import('/core/index.js');
        let created = 0, gpu = 0; const WorkerClass = window.Worker;
        window.Worker = class extends WorkerClass { constructor(...args) { created++; super(...args); } };
        const originalContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (/webgl/i.test(type)) { gpu++; throw new Error('CPU WebGL request'); } return originalContext.call(this, type, ...args); };
        const { CpuExecutor } = await import('/cpu/index.js');
        const source = createSource({ contractVersion: 1, width: 8, height: 8, revision: 0, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight', data: new Uint8Array(Array.from({ length: 256 }, (_, i) => i * 37 % 256)) });
        const original = [...source.data], main = new CpuExecutor({ worker: 'off' }); let workerGpu = 0;
        const threaded = new CpuExecutor({ worker: 'required', workerFactory: () => { const w = new Worker('/worker-spy.js', { type: 'module' }); w.addEventListener('message', e => { workerGpu += e.data.webglRequests ?? 0; }); return w; } });
        if (created !== 0) throw new Error('Eager worker');
        const cases = [];
        for (let revision = 0; revision < 3; revision++) {
          const frame = createFrame({ contractVersion: 1, generation: 0, revision, sourceRevision: 0, surfaces: [{ id: 'a', width: 16 + revision, height: 8, radius: 3, bevel: 2, strength: 3 }, { id: 'b', width: 7, height: 7, radius: 3.5, strength: 1 }] }, source);
          const effects = revision ? { model: 'rounded-material-v1', blurRadius: 2, dispersion: .5, tint: [.1, .4, .7, .3], rim: .2, specular: .6 } : undefined;
          const [a, b] = await Promise.all([main.render(source, frame, { effects }), threaded.render(source, frame, { effects })]);
          if (JSON.stringify(a.surfaces.map(s => [...s.data])) !== JSON.stringify(b.surfaces.map(s => [...s.data]))) throw new Error('Worker/main byte mismatch');
          cases.push({ revision, surfaces: a.surfaces.length, timings: b.timings }); a.release(); b.release(); await Promise.resolve();
        }
        if (source.data.byteLength !== 256 || original.join(',') !== [...source.data].join(',')) throw new Error('Borrowed input changed');
        if (gpu || workerGpu || created !== 1) throw new Error('Context or worker count');
        main.dispose(); threaded.dispose(); await Promise.resolve();
        return { cases, created, gpu, workerGpu, main: main.diagnostics, threaded: threaded.diagnostics };
      });
      assert.equal(receipt.parity.created, 1); assert.equal(receipt.parity.gpu, 0); assert.equal(receipt.parity.workerGpu, 0);
      await page.goto(server.origin + '/blocked');
      receipt.csp = await page.evaluate(async () => {
        const { createSource, createFrame } = await import('/core/index.js'), { CpuExecutor } = await import('/cpu/index.js');
        const source = createSource({ contractVersion: 1, width: 1, height: 1, revision: 0, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight', data: new Uint8Array([1, 2, 3, 255]) });
        const frame = createFrame({ contractVersion: 1, generation: 0, revision: 0, sourceRevision: 0, surfaces: [{ id: 'one', width: 1, height: 1, radius: 0, strength: 0 }] }, source);
        const auto = new CpuExecutor({ timeoutMs: 300 }), result = await auto.render(source, frame); result.release(); const fallback = auto.diagnostics; auto.dispose();
        const required = new CpuExecutor({ worker: 'required', timeoutMs: 300 }); let rejected = false;
        try { await required.render(source, frame); } catch { rejected = true; } finally { required.dispose(); }
        return { fallback, rejected, bytes: [...source.data] };
      });
      assert.equal(receipt.csp.fallback.execution, 'main'); assert.ok(receipt.csp.fallback.fallbackReason); assert.equal(receipt.csp.rejected, true); assert.deepEqual(receipt.csp.bytes, [1, 2, 3, 255]);
      assert.deepEqual(errors, []); receipt.pass = true;
    } catch (error) { receipt.pass = false; receipt.error = error.stack; throw error; }
    finally { await browser?.close(); await server.close(); await writeFile(new URL('receipt.json', `file://${dir}/`), JSON.stringify(receipt, null, 2)); }
  });
}
