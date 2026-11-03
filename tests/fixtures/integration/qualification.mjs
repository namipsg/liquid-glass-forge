import { SourceProvider } from '@liquid-glass-forge/dom';
import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
import { webglContextPoolDiagnostics } from '@liquid-glass-forge/webgl';

// Qualification fixture only. Product algorithms and the original budgets stay unchanged.
let observedRun;
const watched = new WeakSet();
function observePresentation(run) {
  observedRun = run;
  for (const canvas of document.querySelectorAll('.test-card > canvas')) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (watched.has(ctx)) continue; watched.add(ctx);
    for (const method of ['putImageData', 'drawImage']) {
      const native = ctx[method].bind(ctx);
      ctx[method] = (...args) => { const result = native(...args); observedRun?.presented(canvas); return result; };
    }
  }
}
export function qualificationRun(backend) {
  if (!['cpu', 'worker', 'webgl'].includes(backend)) throw Error('Exact forced backend required');
  const data = new Uint8Array(640 * 360 * 4);
  for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) data.set([x % 256, y % 256, (x + y) % 256, 255], (y * 640 + x) * 4);
  const source = new SourceProvider({ kind: 'pixels', width: 640, height: 360, data });
  const run = { name: 'qualification-' + backend, backend, count: backend === 'webgl' ? 4 : 1,
    source, active: 0, initialized: 0, cleaned: 0, subscriptions: 0, completed: 0, errors: [],
    workerCreated: 0, workerTerminated: 0, pendingInit: [], sequence: 0, rawFrames: [], previousEnd: undefined };
  const subscribe = source.subscribe.bind(source);
  source.subscribe = callback => { run.subscriptions++; const off = subscribe(callback); let ended = false; return () => { if (!ended) { ended = true; run.subscriptions--; off(); } }; };
  const renderer = createOpticalRenderer({ backend: backend === 'webgl' ? 'webgl' : 'cpu',
    surface: request => ({ radius: backend === 'webgl' ? 72 : 36, bevel: backend === 'webgl' ? 60 : 30, strength: 12 + (run.sequence % 20) / 5 }),
    quality: { maxWidth: backend === 'webgl' ? 640 : 320, maxHeight: backend === 'webgl' ? 360 : 180 },
    cpu: { executor: backend === 'worker' ? { worker: 'required', workerFactory() {
      const worker = new Worker(location.origin + '/worker/worker.js', { type: 'module' }), terminate = worker.terminate.bind(worker); run.workerCreated++;
      let closed = false; worker.terminate = () => { if (!closed) { closed = true; run.workerTerminated++; terminate(); } }; return worker;
    } } : { worker: 'off' } } });
  let batch;
  run.optical = renderer;
  run.report = error => run.errors.push({ code: error?.code, message: String(error) });
  run.diagnostics = () => ({ ...renderer.diagnostics, pool: webglContextPoolDiagnostics() });
  run.presented = canvas => {
    if (!batch || run.active !== 1 || !canvas.closest('.test-card')) return;
    batch.seen.add(canvas); if (batch.seen.size !== batch.count) return;
    const end = performance.now(), current = batch; batch = undefined; run.completed++;
    queueMicrotask(() => {
      const d = renderer.diagnostics;
      run.rawFrames.push({ sequence: current.sequence, startedAt: current.start, completedAt: end, ageMs: end - current.start,
        intervalMs: run.previousEnd === undefined ? null : end - run.previousEnd, visibility: document.visibilityState,
        effectiveBackend: d.effectiveBackend, execution: d.cpu?.execution, gpuOwnedBytes: d.gpu?.ownedImageBytes ?? 0,
        gpuContexts: d.gpu?.resources.contexts ?? 0, outputBytes: [...current.seen].reduce((sum, c) => sum + c.width * c.height * 4, 0),
        executor: d.cpu?.executor, surface: d.cpu?.surface, timings: d.cpu?.timings });
      run.previousEnd = end; run.resolveFrame?.(); run.resolveFrame = undefined;
    });
  };
  run.renderer = {
    initialize(signal) { run.active++; run.initialized++; let clean; try { clean = renderer.initialize(signal); } catch (e) { run.active--; throw e; }
      let closed = false; return () => { if (!closed) { closed = true; clean(); batch = undefined; run.active--; run.cleaned++; } }; },
    renderBatch(requests, signal) { observePresentation(run); batch = { sequence: run.sequence, start: run.tickStarted ?? performance.now(), count: requests.length, seen: new Set() }; return renderer.renderBatch(requests, signal); },
    render(request, signal) { return Promise.resolve(this.renderBatch([request], signal)).then(frames => frames[0]); },
    releaseSurface: id => renderer.releaseSurface(id),
  };
  run.step = async () => {
    if (run.errors.length) throw Error(JSON.stringify(run.errors));
    run.sequence++; run.tickStarted = performance.now();
    const i = (run.sequence % (640 * 360)) * 4; data[i] ^= 255;
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { run.resolveFrame = undefined; reject(Error('Dynamic frame deadline')); }, 5000);
      run.resolveFrame = () => { clearTimeout(timer); resolve(); };
    });
    source.replace({ kind: 'pixels', width: 640, height: 360, data }); await done;
  };
  run.finish = () => { if (observedRun === run) observedRun = undefined; renderer.dispose(); source.destroy(); };
  return run;
}
