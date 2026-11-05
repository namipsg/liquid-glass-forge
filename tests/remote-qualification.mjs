// Fixed browser-side protocol for a physically operated browser. No eval,
// synthetic native input, lowered admission limits, or remote settings changes.
const session = new URL(location.href).searchParams.get('session');
if (!/^[a-f0-9]{32}$/.test(session ?? '')) throw Error('Exact owned session required');
const base = '/session/' + session;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const status = document.querySelector('#status'), stage = document.querySelector('#stage');
let serial = 0;
async function emit(kind, payload = {}) {
  const response = await fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial: ++serial, kind, payload }) });
  if (!response.ok) throw Error('Receipt writer rejected ' + kind);
  return response.json();
}
async function until(test, label, ms = 20000) {
  const end = performance.now() + ms;
  while (!test()) { if (performance.now() > end) throw Error(label + ' deadline'); await pause(10); }
}
async function acknowledge(kind, payload) {
  const { checkpoint } = await emit(kind, payload);
  const end = performance.now() + 600000;
  while (true) {
    const response = await fetch(base + '/ack/' + checkpoint);
    if (response.ok && (await response.json()).acknowledged) return;
    if (performance.now() > end) throw Error('Physical checkpoint deadline: ' + kind);
    await pause(300);
  }
}
async function load(url, ready) {
  const frame = document.createElement('iframe'); frame.title = 'Owned physical qualification fixture'; frame.src = url;
  stage.replaceChildren(frame);
  await until(() => { try { return ready(frame.contentWindow); } catch { return false; } }, 'fixture bootstrap');
  return frame.contentWindow;
}
const pixels = w => [...w.document.querySelectorAll('.test-card > canvas')].map(c => ({
  width: c.width, height: c.height,
  center: [...c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data],
  rect: (() => { const r = c.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; })(),
}));
addEventListener('error', e => { void emit('page-error', { message: e.message }); });
addEventListener('unhandledrejection', e => { void emit('page-error', { message: String(e.reason?.stack ?? e.reason) }); });
try {
  const config = await (await fetch(base + '/config')).json(), { plan, diagnostic } = config;
  await emit('identity', { userAgent:navigator.userAgent, platform:navigator.platform, visibility:document.visibilityState,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, screen:{width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight} });
  for (const adapter of plan.requiredAdapters) for (const backend of plan.requiredBackends) {
    status.textContent = adapter + ' / ' + backend + ' — native controls and lifecycle';
    const w = await load('/' + adapter + '/?qualification=1', w => w.phase10);
    await w.phase10.qualify(backend);
    await until(() => { if(w.phase10.state.run.errors.length)throw Error(JSON.stringify(w.phase10.state.run.errors));return w.phase10.state.run.completed > 0; }, 'first frame');
    const trusted = { input:0, click:0 }, input = w.document.querySelector('#name-0'), button = w.document.querySelector('#count-0');
    input.addEventListener('input', e => { if(e.isTrusted) trusted.input++; });
    button.addEventListener('click', e => { if(e.isTrusted) trusted.click++; });
    const text = 'Windows ' + adapter + ' ' + backend;
    input.focus();
    await acknowledge('native', { adapter, backend, text });
    const native = {value:input.value,clicks:w.phase10.clicks,visibility:w.document.visibilityState,trusted:{...trusted},dpr:w.devicePixelRatio,userAgent:w.navigator.userAgent};
    if(native.value !== text || native.clicks !== 1 || trusted.input < 1 || trusted.click !== 1 || native.visibility !== 'visible') throw Error('Trusted native controls failed: ' + JSON.stringify(native));
    w.document.activeElement?.blur();
    const count = diagnostic ? 2 : plan.lifecycleCycles;
    for(let cycle=0;cycle<count;cycle++) {
      const api=w.phase10, run=api.state.run;
      await api.unmount(); const d=run.diagnostics();
      if(run.active || run.subscriptions || run.workerCreated!==run.workerTerminated || d.pool.leased || d.gpu?.ownedImageBytes || (d.gpu && Object.values(d.gpu.resources).some(Boolean))) throw Error('Retained lifecycle resources');
      const before=run.completed;await api.mount();await until(()=>run.completed>before,'lifecycle frame');
      if(run.active!==1 || run.subscriptions!==1 || run.errors.length) throw Error('Lifecycle imbalance');
    }
    const diagnostics=w.phase10.state.run.diagnostics();
    if(diagnostics.effectiveBackend!==(backend==='webgl'?'webgl':'cpu') || (backend==='worker'&&diagnostics.cpu.execution!=='worker')) throw Error('Forced backend mismatch');
    let gpuIdentity;
    if(backend==='webgl') { const gl=w.phase10.state.run.optical.atlas.context,e=gl.getExtension('WEBGL_debug_renderer_info');gpuIdentity={version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(e?e.UNMASKED_VENDOR_WEBGL:gl.VENDOR)}; }
    await new Promise(r=>w.requestAnimationFrame(()=>w.requestAnimationFrame(r)));
    const capturePixels=pixels(w);
    if(capturePixels.length!==(backend==='webgl'?4:1)||capturePixels.some(c=>c.center[3]!==255)) throw Error('Missing persistent optical output');
    await acknowledge('capture',{adapter,backend,pixels:capturePixels});
    await w.phase10.destroy();
    await emit('device-check',{adapter,backend,lifecycleCycles:count,native,diagnostics,gpuIdentity,capturePixels,pass:true});
  }
  for(const kind of ['cpuConformance','gpuConformance']) {
    status.textContent=kind;
    const w=await load('/bench.html',w=>w.qualificationBench);
    const result=await w.qualificationBench[kind]();
    await emit(kind,result);
    if(!result.pass)throw Error(kind+' failed');
  }
  for(const execution of ['off','required']) for(const repeat of [1,2]) {
    status.textContent='Original CPU admission / '+execution+' / '+repeat;
    const w=await load('/bench.html',w=>w.qualificationBench);
    await emit('benchmark',{backend:'cpu',...await w.qualificationBench.cpu(execution,repeat)});
  }
  for(const repeat of [1,2]) {
    status.textContent='Original GPU admission / '+repeat;
    const w=await load('/bench.html',w=>w.qualificationBench);
    const r=await w.qualificationBench.gpu(repeat);
    r.fullyOnScreen=r.environment.targetCss.every(t=>t.rect.top>=0&&t.rect.left>=0&&t.rect.right<=r.environment.viewport.width&&t.rect.bottom<=r.environment.viewport.height);
    await emit('benchmark',{backend:'webgl',...r});
  }
  const admission=await emit('device-complete');
  for(const backend of plan.requiredBackends) {
    if(!diagnostic&&!admission.backendPass[backend]) { await emit('backend-held',{backend,reason:'Its complete original admission or native checks failed; no sustained pass inferred.'});continue; }
    status.textContent=backend+' — four-adapter sustained qualification';
    const w=await load('/soak.html',w=>w.phase11);
    const cycles=await w.phase11.cycles(backend,diagnostic?2:plan.lifecycleCycles);
    await acknowledge('soak-capture',{backend,phase:'before'});
    await emit('soak-begin',{backend,cycles});
    await w.phase11.start(backend,diagnostic?12000:plan.soakMinimumMs);
    while(true) {
      const sample=w.phase11.drain();
      await emit('soak-sample',{backend,sample});
      if(sample.done)break;
      await pause(2000);
    }
    const cleanup=await w.phase11.close();
    await emit('soak-complete',{backend,cleanup});
  }
  stage.replaceChildren();status.textContent='Windows qualification completed. Receipts saved; check reported results.';
  await emit('complete');
} catch(error) {
  status.textContent='Qualification stopped: '+error.message;
  const w=stage.querySelector('iframe')?.contentWindow;
  await emit('failure',{error:String(error.stack??error),fixtureErrors:w?.phase10?.state.run?.errors,diagnostics:w?.phase10?.state.run?.diagnostics()});
}
