import { SourceProvider } from '@liquid-glass-forge/dom';
import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
import { webglContextPoolDiagnostics, releaseIdleWebGLContexts, WEBGL_ATTRIBUTES } from '@liquid-glass-forge/webgl';
import { qualificationRun } from './qualification.mjs';

export const cases = ['cpu', 'worker', 'webgl', 'auto-live', 'gpu-none', 'gpu-cpu', 'gpu-material',
  'shader-cpu', 'worker-auto', 'worker-crash', 'worker-timeout', 'decode', 'cors',
  'cors-request', 'source-timeout', 'held-worker', 'held-init', 'timeout-init', 'review-glass'];
export const cardMarkup = i => `<p>Readable native content</p><label for="name-${i}">Name ${i}</label>
  <input id="name-${i}" name="name-${i}" value="" /><button id="count-${i}">Count</button>
  <a href="#destination" id="link-${i}">Next section</a>
  <img id="image-${i}" src="/fixture.png" alt="Color tile" draggable="true" width="24" height="24" />`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) {
  const end = performance.now() + 5000;
  while (!test()) { if (performance.now() > end) throw Error('Fixture timeout: ' + label); await sleep(5); }
}
function errorCodes(error) {
  const codes = []; for (let e = error; e; e = e.cause) if (e.code) codes.push(e.code);
  return codes;
}
function makeRun(name) {
  const run = { name, active: 0, initialized: 0, cleaned: 0, subscriptions: 0, completed: 0,
    workerCreated: 0, workerTerminated: 0, pending: [], pendingInit: [], released: 0, errors: [] };
  const parameters = new URLSearchParams(location.search);
  const other = parameters.get('other');
  const reviewPixels = new Uint8Array(128 * 96 * 4);
  if (name === 'review-glass') for (let y = 0; y < 96; y++) for (let x = 0; x < 128; x++) {
    const stripe = Math.floor(x / 16) % 2;
    reviewPixels.set([80 + x, 120 + y, stripe ? 245 : 175, 255], (y * 128 + x) * 4);
  }
  const sourceSpec = name === 'review-glass' ? { kind: 'pixels', width: 128, height: 96, data: reviewPixels }
    : name === 'decode' ? { kind: 'image', url: location.origin + '/broken.png' }
    : name === 'cors' || name === 'cors-request' ? { kind: 'image', url: other + '/fixture.png', crossOrigin: name === 'cors' ? 'none' : 'anonymous' }
    : name === 'source-timeout' ? { kind: 'image', url: location.origin + '/hang.png' }
    : { kind: 'pixels', width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) };
  const source = new SourceProvider(sourceSpec, { timeoutMs: 700 });
  const subscribe = source.subscribe.bind(source);
  source.subscribe = listener => {
    run.subscriptions++; const off = subscribe(listener); let done = false;
    return () => { if (!done) { done = true; run.subscriptions--; off(); } };
  };
  const worker = ['worker', 'worker-auto', 'worker-crash', 'worker-timeout', 'held-worker'].includes(name);
  const executor = worker ? { worker: name === 'worker-auto' ? 'auto' : 'required', timeoutMs: name === 'worker-timeout' ? 150 : 2000,
    workerFactory() {
      const file = name === 'worker-crash' ? 'crash.js' : name === 'worker-timeout' ? 'silent.js' : 'worker.js';
      const w = new Worker(location.origin + '/worker/' + file, { type: 'module' });
      run.workerCreated++; const terminate = w.terminate.bind(w); let stopped = false;
      w.terminate = () => { if (!stopped) { stopped = true; run.workerTerminated++; terminate(); } };
      return w;
    } } : { worker: 'off' };
  let atlas;
  if (name.startsWith('gpu-')) atlas = { canvasFactory() { const c = document.createElement('canvas'); c.getContext = () => null; return c; } };
  if (name === 'shader-cpu') atlas = { canvasFactory() {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2', WEBGL_ATTRIBUTES);
    if (gl) { const get = gl.getShaderParameter.bind(gl); gl.getShaderParameter = (s, p) => p === gl.COMPILE_STATUS ? false : get(s, p); gl.getShaderInfoLog = () => 'Intentional Phase 10 shader failure'; }
    return c;
  } };
  const gpu = name === 'webgl' || name === 'gpu-none' || name === 'review-glass';
  const auto = name === 'auto-live' || name === 'gpu-cpu' || name === 'gpu-material' || name === 'shader-cpu';
  const renderer = createOpticalRenderer({ backend: gpu ? 'webgl' : auto ? 'auto' : 'cpu',
    ...(auto ? { fallback: name === 'gpu-material' ? 'material' : 'cpu' } : {}),
    ...(atlas ? { atlas } : {}), surface: name === 'review-glass' ? { radius: 28, bevel: 20, strength: 8 } : { radius: 0, strength: 0 },
    ...(name === 'review-glass' ? { effects: { model: 'rounded-material-v1', blurRadius: 3, dispersion: .3, tint: [.9, .95, 1, .12], rim: .08, specular: .12 } } : {}), cpu: { executor } });
  run.source = source; run.optical = renderer;
  run.report = error => run.errors.push({ codes: errorCodes(error), message: String(error) });
  run.renderer = {
    initialize(signal) {
      run.active++; run.initialized++; run.initSignal = signal; let done = false;
      const clean = () => { if (!done) { done = true; run.active--; run.cleaned++; } };
      if (name === 'held-init' || name === 'timeout-init') return new Promise(resolve => run.pendingInit.push(() => resolve(clean)));
      try { const end = renderer.initialize(signal); return () => { end(); clean(); }; }
      catch (error) { clean(); throw error; }
    },
    renderBatch(requests, signal) {
      run.renderSignal = signal;
      const output = renderer.renderBatch(requests, signal);
      const complete = frames => {
        run.completed++;
        if (name !== 'held-worker') return frames;
        return new Promise(resolve => run.pending.push(() => resolve(frames.map(frame => ({ ...frame,
          release() { run.released++; frame.release?.(); } })))));
      };
      return output instanceof Promise ? output.then(complete) : complete(output);
    },
    render(request, signal) { return Promise.resolve(this.renderBatch([request], signal)).then(frames => frames[0]); },
    releaseSurface(id) { renderer.releaseSurface(id); },
  };
  run.diagnostics = () => ({ ...renderer.diagnostics, pool: webglContextPoolDiagnostics() });
  run.finish = () => { renderer.dispose(); source.destroy(); };
  return run;
}

export function installRuntime(adapter) {
  document.body.innerHTML = `<header><h1>Phase 10 ${adapter} access and resilience</h1>
    <label>Scenario <select id="scenario">${cases.map(c => `<option>${c}</option>`).join('')}</select></label>
    <button id="apply">Apply scenario</button><button id="glass">Show glass</button><button id="opaque">Readable opaque</button>
    <button id="update">Update source</button><button id="navigate">Navigate away/back</button>
    <button id="transition">View Transition</button><output id="status" role="status">Ready</output>
    <p id="review-guide" hidden>These identical cards compare native controls in four adapters. Glass shows an explicit patterned optical source.
    Readable opaque hides that optical layer behind a solid system background. Test keyboard focus, typing, Count and VoiceOver labels in both modes.
    The decorative canvases should not be announced. Current material: <strong id="current-material">glass</strong>.</p></header>
    <main class="adverse"><div id="app"></div></main><p id="destination">Destination</p>`;
  const listeners = new Set(), history = [];
  let state = { run: null, shown: true, material: 'glass', revision: 0, count: 2 };
  const emit = patch => { state = { ...state, ...patch, revision: state.revision + 1 }; document.querySelector('#current-material').textContent = state.material; for (const fn of listeners) fn(state); };
  const api = {
    get state() { return state; }, history,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    async unmount() {
      emit({ shown: false }); await until(() => !document.querySelector('.test-card'), 'unmounted DOM');
      if (state.run) await until(() => state.run.subscriptions === 0 && (state.run.active === 0 || state.run.pendingInit.length), 'engine cleanup');
    },
    async mount() { emit({ shown: true }); await until(() => !!document.querySelector('.test-card'), 'mounted DOM'); },
    async configure(name) {
      if (!cases.includes(name)) throw Error('Unknown fixture case');
      await api.unmount();
      if (state.run) { if (state.run.active) throw Error('Unreleased pending initialization'); state.run.finish(); }
      const run = makeRun(name); history.push(run); emit({ run, shown: true, material: 'glass', count: 2 });
      document.querySelector('#status').textContent = name;
      await until(() => !!document.querySelector('.test-card'), 'scenario DOM');
    },
    async qualify(backend) {
      await api.unmount(); state.run?.finish(); const run = qualificationRun(backend); history.push(run);
      document.body.classList.add('qualification'); emit({ run, shown: true, material: 'glass', count: run.count });
      await until(() => document.querySelectorAll('.test-card').length === run.count, 'qualification hosts');
    },
    material(value) { emit({ material: value }); },
    update(color = [0, 255, 0, 255]) { state.run.source.replace({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array(color) }); },
    async navigate() {
      const url = new URL(location.href);
      await api.unmount(); url.hash = 'away'; window.history.replaceState(null, '', url);
      await api.mount(); url.hash = 'home'; window.history.replaceState(null, '', url);
    },
    async transition() {
      if (!document.startViewTransition) return 'unavailable';
      const startedAt = performance.now();
      const transition = document.startViewTransition(async () => {
        await api.unmount(); await api.mount();
        // Readiness is independent of painting. The engine registers its source
        // subscription only after initialization and source priming settle.
        await until(() => (state.run.active === 1 && state.run.subscriptions === 1) || state.run.errors.length, 'initialization inside View Transition update');
        if (state.run.errors.length) throw Error('View Transition initialization failed');
      });
      await Promise.all([transition.ready, transition.updateCallbackDone, transition.finished]);
      return { state: 'completed', elapsedMs: performance.now() - startedAt };
    },
    async destroy() { await api.unmount(); state.run?.finish(); releaseIdleWebGLContexts(); },
  };
  document.querySelector('#apply').onclick = () => { void api.configure(document.querySelector('#scenario').value); };
  document.querySelector('#glass').onclick = () => api.material('glass');
  document.querySelector('#opaque').onclick = () => api.material('opaque');
  document.querySelector('#update').onclick = () => api.update();
  document.querySelector('#navigate').onclick = () => { void api.navigate(); };
  document.querySelector('#transition').onclick = () => { void api.transition(); };
  document.addEventListener('click', event => { if (event.target.id?.startsWith('count-')) { api.clicks++; document.querySelector('#status').textContent = 'Native clicks: ' + api.clicks; } });
  api.clicks = 0; api.drags = 0;
  document.addEventListener('dragstart', () => { api.drags++; });
  window.phase10 = api;
  if (new URLSearchParams(location.search).has('review')) {
    document.body.classList.add('review-mode'); document.querySelector('#review-guide').hidden = false;
    document.querySelector('#scenario').value = 'review-glass'; void api.configure('review-glass');
  }
  return api;
}
