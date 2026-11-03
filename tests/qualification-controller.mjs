const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) { const end = performance.now() + 15000; while (!test()) { if (performance.now() > end) throw Error(label + ' deadline'); await delay(5); } }
const children = () => [...document.querySelectorAll('iframe')].map(frame => ({ adapter: frame.title, window: frame.contentWindow }));
const state = { running: false, done: false, errors: [], startedAt: null, endedAt: null, cycles: [] };
async function configure(backend) {
  await until(() => children().every(child => child.window.phase10), 'adapter bootstrap');
  for (const child of children()) {
    await child.window.phase10.qualify(backend);
    await until(() => child.window.phase10.state.run.completed > 0, 'first ' + child.adapter + ' frame');
  }
  await delay(100);
}
window.phase11 = {
  state,
  async cycles(backend, count) {
    await configure(backend);
    for (const child of children()) for (let cycle = 0; cycle < count; cycle++) {
      const api = child.window.phase10, run = api.state.run;
      await api.unmount(); const d = run.diagnostics();
      if (run.active || run.subscriptions || run.workerCreated !== run.workerTerminated || d.pool.leased || d.gpu?.ownedImageBytes || (d.gpu && Object.values(d.gpu.resources).some(Boolean))) throw Error(child.adapter + ' retained resources at cycle ' + cycle);
      const previous = run.completed; await api.mount(); await until(() => run.completed > previous, 'cycle frame');
      if (run.active !== 1 || run.subscriptions !== 1 || run.errors.length) throw Error(child.adapter + ' lifecycle resource imbalance');
    }
    state.cycles.push({ backend, count, adapters: children().map(child => child.adapter) }); return state.cycles.at(-1);
  },
  async start(backend, durationMs) {
    if (state.running) throw Error('Soak already running'); await configure(backend);
    for (const child of children()) child.window.phase10.state.run.rawFrames.splice(0);
    state.running = true; state.startedAt = performance.now();
    const jobs = children().map(async child => {
      try { while (state.running && performance.now() - state.startedAt < durationMs) await child.window.phase10.state.run.step(); }
      catch (error) { state.errors.push({ adapter: child.adapter, error: String(error.stack || error) }); state.running = false; }
    });
    void Promise.all(jobs).then(() => { state.running = false; state.done = true; state.endedAt = performance.now(); });
    return { startedAt: state.startedAt };
  },
  drain() {
    return { ...state, elapsedMs: state.startedAt === null ? 0 : (state.endedAt ?? performance.now()) - state.startedAt,
      visibility: document.visibilityState, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      adapters: children().map(child => { const run = child.window.phase10?.state.run; return { adapter: child.adapter, frames: run?.rawFrames.splice(0) ?? [],
        active: run?.active, subscriptions: run?.subscriptions, errors: run?.errors, diagnostics: run?.diagnostics(), workerCreated: run?.workerCreated, workerTerminated: run?.workerTerminated,
        visibility: child.window.document.visibilityState, targets: [...child.window.document.querySelectorAll('.test-card > canvas')].map(c => ({ width: c.width, height: c.height })) }; }) };
  },
  async close() { state.running = false; await delay(100); for (const child of children()) await child.window.phase10.destroy(); return children().map(child => ({ adapter: child.adapter, active: child.window.phase10.state.run.active, subscriptions: child.window.phase10.state.run.subscriptions, workers: child.window.phase10.state.run.workerCreated - child.window.phase10.state.run.workerTerminated, leased: child.window.phase10.state.run.diagnostics().pool.leased })); },
};
