import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, lstat, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';
import { cpuServer } from './cpu-worker-server.mjs';
const consumer = await mkdtemp(path.join(tmpdir(), 'lgf-cpu-installed-'));
after(() => rm(consumer, { recursive: true, force: true }));
const base = new URL('../private/phase-5/host-packed/', import.meta.url); await mkdir(base, { recursive: true }); const dir = await mkdtemp(new URL('run-', base));
await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const tarballs = [];
for (const name of ['core', 'cpu', 'dom']) {
  const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: new URL(`../packages/${name}/`, import.meta.url), encoding: 'utf8', timeout: 30000 }))[0];
  tarballs.push(path.join(dir, result.filename));
}
await writeFile(path.join(dir, 'install.txt'), execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--save=false', ...tarballs], { cwd: consumer, encoding: 'utf8', timeout: 30000 }));
for (const name of ['core', 'cpu', 'dom']) { const p = path.join(consumer, 'node_modules/@liquid-glass-forge', name); assert.equal((await lstat(p)).isSymbolicLink(), false); assert.ok((await realpath(p)).startsWith(await realpath(consumer))); }
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: physical packed CPU main/worker host, quality, native input, lifecycle and idle`, { timeout: 60000 }, async () => {
    const server = await cpuServer({ root: path.join(consumer, 'node_modules/@liquid-glass-forge') }); let browser; const receipt = { engine: name, physicalInstalledConsumer: true };
    try {
      browser = await engine.launch(); receipt.version = browser.version(); const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto(server.origin);
      receipt.result = await page.evaluate(async () => {
        const native = { setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, queueMicrotask: window.queueMicrotask, requestAnimationFrame: window.requestAnimationFrame };
        const sleep = ms => new Promise(resolve => native.setTimeout.call(window, resolve, ms));
        const until = async (fn, label) => { const end = performance.now() + 5000; while (!fn()) { if (performance.now() > end) throw new Error('Timed out: ' + label); await sleep(10); } };
        let gpu = 0, raf = 0, microtasks = 0; const timers = new Set(), get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (/webgl/i.test(type)) { gpu++; throw new Error('CPU requested GPU'); } return get.call(this, type, ...args); };
        window.setTimeout = (fn, ms, ...args) => { let id = native.setTimeout.call(window, () => { timers.delete(id); fn(...args); }, ms); timers.add(id); return id; };
        window.clearTimeout = id => { timers.delete(id); native.clearTimeout.call(window, id); };
        window.queueMicrotask = fn => { microtasks++; native.queueMicrotask.call(window, fn); };
        window.requestAnimationFrame = fn => { raf++; return native.requestAnimationFrame.call(window, fn); };
        window.setInterval = () => { throw new Error('Unexpected CPU idle interval'); };
        const { SourceProvider, createGlassScene, createCpuRenderer } = await import('/dom/index.js');
        const results = [];
        for (const worker of ['off', 'required']) {
          const root = document.createElement('div'); root.id = worker; root.style.cssText = 'width:640px;height:360px;display:block;'; root.innerHTML = '<input class="native"><button>Native</button>'; document.body.append(root);
          const pixels = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), source = new SourceProvider({ kind: 'pixels', width: 2, height: 1, data: pixels });
          const renderer = createCpuRenderer({ executor: { worker }, surface: { radius: 0, strength: 0 } });
          const scene = createGlassScene({ source, renderer }), attachment = scene.attach(root); await scene.ready;
          await until(() => attachment.host.target.width === 320, 'CPU first target');
          const target = attachment.host.target, read = x => [...target.getContext('2d').getImageData(x, 0, 1, 1).data];
          if (read(0).join(',') !== '255,0,0,255' || read(319).join(',') !== '0,0,255,255') throw new Error('Actual CPU crop pixels');
          const first = renderer.diagnostics;
          if (!first.qualityReduced || first.effectiveWidth !== 320 || first.effectiveHeight !== 180 || first.execution !== (worker === 'off' ? 'main' : 'worker')) throw new Error('Effective CPU quality/backend');
          root.querySelector('input').id = 'input-' + worker; root.querySelector('button').id = 'button-' + worker;
          window['fixture-' + worker] = { scene, source, renderer, attachment, root };
          source.replace({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) });
          await until(() => read(0)[1] === 255, 'latest source update');
          scene.pause(); source.replace({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array([0, 0, 255, 255]) }); scene.resume(); await scene.ready;
          await until(() => read(0)[2] === 255, 'CPU resumed fresh executor');
          if (pixels.byteLength !== 8 || pixels[0] !== 255) throw new Error('Borrowed bytes changed');
          await sleep(150); const idle = { raf, microtasks, timers: timers.size }; await sleep(100);
          if (raf !== 0 || microtasks !== idle.microtasks || timers.size !== 0) throw new Error('CPU not idle');
          results.push({ worker, first, idle });
        }
        // Independent direct-request boundary tests use the installed adapter.
        const tiny = createCpuRenderer({ executor: { worker: 'off' }, surface: { radius: 0, strength: 0 }, sourceRect: () => ({ x: 1, y: 0, width: 1, height: 1 }), quality: { maxPixels: 1 } });
        const controller = new AbortController(), cleanup = tiny.initialize(controller.signal), provider = new SourceProvider({ kind: 'pixels', width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) });
        const snapshot = await provider.read();
        for (const [width, height] of [[4000, 1], [1, 4000]]) {
          const pending = tiny.render({ snapshot, width, height, dpr: 1, rect: { x: 0, y: 0, width, height } }, controller.signal);
          if (height === 4000) snapshot.source.data.fill(0);
          const out = await pending;
          if (out.width * out.height !== 1 || [...out.data].join(',') !== '0,0,255,255') throw new Error('Thin aspect pixel/crop cap'); out.release?.();
        }
        cleanup(); tiny.dispose(); provider.destroy();
        const core = await import('/core/index.js'), cpu = await import('/cpu/index.js');
        const data = new Uint8Array(Array.from({ length: 64 }, (_, i) => [i * 17 % 256, i * 37 % 256, i * 71 % 256, 255]).flat());
        const input = core.createSource({ contractVersion: 1, width: 8, height: 8, revision: 0, data, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
        const request = { snapshot: { source: input, generation: 0, revision: 0 }, width: 20, height: 16, dpr: 1, rect: { x: 0, y: 0, width: 20, height: 16 } };
        const shape = { radius: 5, bevel: 4, strength: 0 }, prepared = cpu.prepareCpuSource(input), dynamic = [];
        let callbackCalls = 0;
        const adapter = createCpuRenderer({ executor: { worker: 'off' }, surface: r => { if (r !== request) throw new Error('Wrong callback request'); callbackCalls++; return shape; } });
        const state = new AbortController(), close = adapter.initialize(state.signal);
        let previous;
        for (const strength of [0, 7, 3]) {
          shape.strength = strength;
          const expected = cpu.renderCpu(prepared, { id: 'expected', width: 20, height: 16, ...shape });
          const pending = adapter.render(request, state.signal);
          shape.strength = 999; // The pending rate wait must use the synchronous snapshot.
          const output = await pending;
          if (!output.data.every((v, i) => v === expected[i])) throw new Error('Dynamic optics did not match captured surface');
          if (adapter.diagnostics.surface.strength !== strength || !Object.isFrozen(adapter.diagnostics.surface)) throw new Error('Optical diagnostics were not frozen');
          if (previous && !output.data.some((v, i) => v !== previous[i])) throw new Error('Changed strength reused old output');
          previous = output.data.slice(); dynamic.push({ strength, rateWaitMs: adapter.diagnostics.timings.rateWaitMs }); output.release?.();
        }
        if (callbackCalls !== 3 || !dynamic.slice(1).some(r => r.rateWaitMs > 0)) throw new Error('Dynamic request/rate-wait coverage');
        close(); adapter.dispose(); cpu.disposeCpuSource(prepared);
        const startDeadlines = [];
        for (const mode of ['off', 'required']) {
          const limited = createCpuRenderer({ executor: { worker: mode }, surface: { radius: 0, strength: 0 } });
          const life = new AbortController(), end = limited.initialize(life.signal); let lastStart, lastReturned;
          try {
            for (let i = 0; i < 3; i++) {
              const active = lastStart !== undefined && performance.now() - lastStart < 2000 / 30;
              const output = await limited.render(request, life.signal), timings = limited.diagnostics.timings;
              if (lastStart !== undefined && timings.startedAt < lastStart + 1000 / 30) throw new Error('CPU start exceeded30Hz limit');
              // Completion pacing is relative to the previous successful output;
              // fast kernels reserve their compute phase before execution.
              if (active && lastReturned !== undefined && performance.now() - lastReturned < 1000 / 30 - 1.1) throw new Error('Active output exceeded the completion cadence');
              if (mode === 'required' && timings.transferCopyMs !== 0) throw new Error('Required worker copied owned capture twice');
              startDeadlines.push({ mode, startedAt: timings.startedAt, rateWaitMs: timings.rateWaitMs });
              lastStart = timings.startedAt; lastReturned = performance.now(); output.release();
            }
          } finally { end(); limited.dispose(); }
          if (limited.diagnostics.executor.leasedBytes || limited.diagnostics.executor.pooledBytes) throw new Error('Rate-limited renderer retained buffers after disposal');
        }
        let invalidWorkers = 0;
        for (const invalid of [undefined, null, { strength: -1 }, { strength: NaN }, { extra: 1 }, Promise.resolve({})]) {
          const adapter = createCpuRenderer({ executor: { workerFactory() { invalidWorkers++; throw new Error('Invalid surface constructed worker'); } }, surface: () => invalid });
          const state = new AbortController(), close = adapter.initialize(state.signal), timersBefore = timers.size;
          let rejected = false; try { await adapter.render(request, state.signal); } catch { rejected = true; }
          if (!rejected || timers.size !== timersBefore) throw new Error('Invalid dynamic surface accepted or scheduled');
          close(); adapter.dispose();
        }
        const throwing = createCpuRenderer({ surface: () => { throw new Error('surface callback failure'); } });
        const stop = new AbortController(), stopCleanup = throwing.initialize(stop.signal);
        let thrown = false; try { await throwing.render(request, stop.signal); } catch (error) { thrown = error.message === 'surface callback failure'; }
        stopCleanup(); throwing.dispose(); if (!thrown || invalidWorkers !== 0 || gpu !== 0) throw new Error('Dynamic callback side effect/failure handling');
        const pacingCancellation = [];
        for (const mode of ['off', 'required']) {
          const paced = createCpuRenderer({ executor: { worker: mode }, surface: { radius: 0, strength: 0 } });
          const life = new AbortController(), cleanup = paced.initialize(life.signal);
          const prototype = cpu.CpuDeadlineScheduler.prototype, originalWait = prototype.waitUntil, heldDeadlines = [];
          let heldBatch = 3;
          try {
            // Warm the native worker and establish an active successful output.
            for (let i = 0; i < 2; i++) { const out = await paced.render(request, life.signal); out.release(); }
            const successfulTimings = paced.diagnostics.timings;
            prototype.waitUntil = function(deadline, signal) {
              // Hold only a completed output, keeping executor start waits real.
              if (paced.diagnostics.executor.completedBatches === heldBatch) {
                heldDeadlines.push(deadline);
                return new Promise((resolve, reject) => {
                  const abort = () => reject(signal.reason);
                  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
                });
              }
              return originalWait.call(this, deadline, signal);
            };
            const abort = new AbortController(), pending = paced.render(request, abort.signal);
            void pending.catch(() => {});
            await until(() => heldDeadlines.length === 1, 'held completed CPU output');
            if (!paced.diagnostics.executor.leasedBytes) throw new Error('Cancellation fixture did not hold output');
            abort.abort(); let rejected = false; try { await pending; } catch { rejected = true; }
            if (!rejected || paced.diagnostics.executor.leasedBytes) throw new Error('Pacing abort retained a lease');
            if (paced.diagnostics.timings !== successfulTimings) throw new Error('Aborted output published completion timings');
            heldBatch = 4;
            const disposed = paced.render(request, life.signal); void disposed.catch(() => {});
            await until(() => heldDeadlines.length === 2, 'held output before disposal');
            paced.dispose(); let disposalRejected = false; try { await disposed; } catch { disposalRejected = true; }
            if (!disposalRejected || paced.diagnostics.executor.leasedBytes || paced.diagnostics.executor.pooledBytes) throw new Error('Pacing disposal retained buffers');
            if (paced.diagnostics.timings !== successfulTimings) throw new Error('Disposed output published completion timings');
            pacingCancellation.push({ mode, pacingRejected: rejected, disposalRejected });
          } finally { prototype.waitUntil = originalWait; cleanup(); paced.dispose(); }
        }
        const capturedProvider=new SourceProvider({kind:'pixels',width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])}),captureTarget=new Uint8ClampedArray(8);
        const capturedRenderer=createCpuRenderer({executor:{worker:'off'},surface:{radius:0,strength:0}}),capturedLife=new AbortController(),capturedCleanup=capturedRenderer.initialize(capturedLife.signal);
        for(let i=0;i<2;i++) {
          if(i>0)capturedProvider.invalidate();
          const captured=await capturedProvider.readInto(captureTarget);
          if(captured.source.data!==captureTarget||captured.source.ownership!=='borrowed')throw new Error('Caller-owned capture contract');
          const pending=capturedRenderer.render({...request,snapshot:captured,width:2,height:1,rect:{x:0,y:0,width:2,height:1}},capturedLife.signal);
          captureTarget.fill(0);const out=await pending;
          if([...out.data].join(',')!=='255,0,0,255,0,0,255,255')throw new Error('Reused acquisition target changed deferred CPU pixels');out.release();
        }
        capturedCleanup();capturedRenderer.dispose();capturedProvider.destroy();if(captureTarget.byteLength!==8)throw new Error('Caller target detached');
        return { results, dynamic, startDeadlines, invalidWorkers, pacingCancellation, callerCapture:true, gpu };
      });
      for (const mode of ['off', 'required']) { await page.fill('#input-' + mode, 'native CPU input'); assert.equal(await page.inputValue('#input-' + mode), 'native CPU input'); await page.click('#button-' + mode); }
      const cleanup = await page.evaluate(() => ['off', 'required'].map(mode => { const f = window['fixture-' + mode]; f.scene.dispose(); f.scene.dispose(); const borrowed = f.source.state; f.source.destroy(); f.renderer.dispose(); return { state: f.scene.state, borrowed, canvas: !!f.root.querySelector('canvas'), nativeInput: f.root.querySelector('input').value }; }));
      assert.deepEqual(cleanup, Array(2).fill({ state: 'destroyed', borrowed: 'ready', canvas: false, nativeInput: 'native CPU input' })); assert.deepEqual(errors, []); receipt.pass = true;
    } catch (error) { receipt.pass = false; receipt.error = error.stack; throw error; }
    finally { await browser?.close(); await server.close(); await writeFile(path.join(dir, name + '.json'), JSON.stringify(receipt, null, 2)); }
  });
}
