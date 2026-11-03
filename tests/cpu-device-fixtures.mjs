// Browser-only physical fixture. The oracle contains no production/spike math.
import { oracleRender } from '/oracle.js';

export async function conformance(forceCpuBacking = false) {
  if(forceCpuBacking){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return get.call(this,type,this.classList.contains('lgf-surface')?{...options,willReadFrequently:true}:options);};}
  const core = await import('/core/index.js'), cpu = await import('/cpu/index.js');
  const dom = await import('/dom/index.js');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, label) => { const deadline = performance.now() + 5000; while (!predicate()) { if (performance.now() > deadline) throw new Error('Timed out: ' + label); await sleep(10); } };
  const difference = (a, b) => { let max = 0, sum = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); max = Math.max(max, d); sum += d; } return { max, mean: sum / a.length }; };
  const cases = [
    { name: 'identity orientation', width: 40, height: 32, radius: 0, bevel: 8, strength: 0 },
    { name: 'rounded refraction', width: 38, height: 30, radius: 10, bevel: 8, strength: 7 },
    { name: 'cropped asymmetric source', width: 31, height: 25, radius: 8, bevel: 7, strength: 4, sourceRect: { x: 3, y: 4, width: 31, height: 23 } },
    { name: 'hidden colors and fractional alpha', translucent: true, width: 39, height: 31, radius: 9, bevel: 7, strength: 5 },
    { name: 'blur dispersion tint rim specular', translucent: true, width: 35, height: 27, radius: 8, bevel: 6, strength: 4,
      effects: { model: 'rounded-material-v1', blurRadius: 1, dispersion: .3, tint: [.2, .4, .7, .1], rim: .1, specular: .2 } },
    { name: 'classified opaque baseline', width: 320, height: 180, radius: 36, bevel: 30, strength: 12 },
    { name: 'exact half-texel baseline', sourceWidth:128, sourceHeight:128, width:64, height:64, radius:16, bevel:10, strength:12 },
  ];
  const results = []; let maxByteError = 0, meanByteError = 0, idleExact = true, workerContexts = 0;
  for (const execution of ['off', 'required']) for (const entry of cases) {
    const sourceWidth = entry.sourceWidth ?? 40, sourceHeight = entry.sourceHeight ?? 32;
    const data = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
    for (let y = 0; y < sourceHeight; y++) for (let x = 0; x < sourceWidth; x++) data.set([(x * 17 + y * 3) % 256, (y * 19 + x * 2) % 256,
      ((x >> 2) + (y >> 2)) % 2 ? 240 : 25, entry.translucent ? (x < 10 ? 0 : y < 16 ? 128 : 255) : 255], (y * sourceWidth + x) * 4);
    const source = core.createSource({ contractVersion: 1, width: sourceWidth, height: sourceHeight, revision: 0, data, ownership: 'borrowed', colorSpace: 'srgb', alphaMode: 'straight' });
    const original = data.slice(), shape = { id: 'physical', width: entry.width, height: entry.height, radius: entry.radius, bevel: entry.bevel, strength: entry.strength,
      ...(entry.sourceRect ? { sourceRect: entry.sourceRect } : {}) };
    const expectedBytes = oracleRender(source, shape, entry.effects);
    const root = document.createElement('div'); root.style.cssText = `display:block;width:${entry.width}px;height:${entry.height}px`; document.body.append(root);
    const host = dom.mountGlassHost(root), renderer = dom.createCpuRenderer({ executor: { worker: execution,
      ...(execution === 'required' ? { workerFactory: () => { const w = new Worker('/worker-spy.js', { type: 'module' }); w.addEventListener('message', e => { workerContexts += e.data.webglRequests ?? 0; }); return w; } } : {}) },
      surface: { radius: entry.radius, bevel: entry.bevel, strength: entry.strength }, ...(entry.effects ? { effects: entry.effects } : {}), ...(entry.sourceRect ? { sourceRect: entry.sourceRect } : {}) });
    const controller = new AbortController(), cleanup = renderer.initialize(controller.signal);
    try {
      const output = await renderer.render({ snapshot: { source, generation: 0, revision: 0 }, width: entry.width, height: entry.height, dpr: 1,
        rect: { x: 0, y: 0, width: entry.width, height: entry.height } }, controller.signal);
      const raw = difference(output.data, expectedBytes); host.present(output); output.release?.();
      // Same canonical Canvas2D round trip used by original Phase1 conformance;
      // here its input is the independent scalar oracle, not the production CPU.
      const reference = document.createElement('canvas'); reference.width = entry.width; reference.height = entry.height;
      reference.getContext('2d').putImageData(new ImageData(expectedBytes, entry.width, entry.height), 0, 0);
      const expected = reference.getContext('2d').getImageData(0, 0, entry.width, entry.height).data;
      const ctx = host.target.getContext('2d'), first = ctx.getImageData(0, 0, entry.width, entry.height).data, presented = difference(first, expected);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const idle = ctx.getImageData(0, 0, entry.width, entry.height).data, same = first.every((v, i) => v === idle[i]);
      const intact = data.byteLength === original.byteLength && data.every((v, i) => v === original[i]);
      const effective = renderer.diagnostics.execution;
      const pass = raw.max <= 1 && raw.mean <= .5 && presented.max <= 3 && presented.mean <= .5 && same && intact && effective === (execution === 'off' ? 'main' : 'worker');
      results.push({ execution, name: entry.name, raw, presented, idleExact: same, borrowedIntact: intact, effective, pass, context:ctx.getContextAttributes?.(), idleDifferences:Array.from(first, (v,i)=>v===idle[i]?null:{channel:i,before:v,after:idle[i]}).filter(Boolean).slice(0,20) });
      maxByteError = Math.max(maxByteError, presented.max); meanByteError = Math.max(meanByteError, presented.mean); idleExact &&= same;
    } finally { cleanup(); renderer.dispose(); host.dispose(); root.remove(); }
  }
  const provider = new dom.SourceProvider({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) });
  const renderer = dom.createCpuRenderer({ executor: { worker: 'required' }, surface: { radius: 0, strength: 0 } });
  const root = document.createElement('div'); root.style.cssText = 'display:block;width:160px;height:64px'; root.innerHTML = '<input id="physical-input"><button id="physical-button">Native</button>'; document.body.append(root);
  const scene = dom.createGlassScene({ source: provider, renderer }), attachment = scene.attach(root); await scene.ready;
  await until(() => attachment.host.target.width > 0, 'scene first frame');
  provider.replace({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) });
  const pixel = () => attachment.host.target.getContext('2d').getImageData(0, 0, 1, 1).data;
  await until(() => pixel()[1] === 255, 'scene source update');
  scene.pause(); scene.resume(); await scene.ready; await until(() => pixel()[1] === 255, 'scene resume');
  window.physicalClicks = 0; root.querySelector('button').onclick = () => window.physicalClicks++;
  window.finishPhysicalNative = () => { const value = root.querySelector('input').value, clicks = window.physicalClicks; root.querySelector('input').blur(); scene.dispose(); scene.dispose(); const state = provider.state; provider.destroy(); renderer.dispose(); const canvasGone = !root.querySelector('canvas'); root.remove(); return { value, clicks, state, canvasGone }; };
  return { cases: results, maxByteError, meanByteError, idleExact, workerWebglRequests: workerContexts, pass: results.every(r => r.pass) && workerContexts === 0 };
}

export async function workload(execution, repeat, { diagnostic = false } = {}) {
  const { SourceProvider, createCpuRenderer, mountGlassHost } = await import('/dom/index.js');
  const { CPU_LOOKUP_BYTES } = await import('/cpu/index.js');
  const data = new Uint8Array(640 * 360 * 4);
  for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) { const i = (y * 640 + x) * 4; data[i] = x % 256; data[i + 1] = y % 256; data[i + 2] = (x + y) % 256; data[i + 3] = 255; }
  const source = new SourceProvider({ kind: 'pixels', width: 640, height: 360, data });
  const acquisitionTarget = new Uint8ClampedArray(data.length);
  let strength = 12;
  const renderer = createCpuRenderer({ executor: { worker: execution }, surface: () => ({ radius: 36, bevel: 30, strength }) });
  const controller = new AbortController(), cleanup = renderer.initialize(controller.signal);
  const root = document.createElement('div'); root.style.cssText = 'width:320px;height:180px;display:block'; document.body.append(root); const host = mountGlassHost(root);
  const warmup = 15, frames = diagnostic ? 24 : 90;
  const rawFrames = []; let previousEnd;
  try {
    for (let i = 0; i < warmup + frames; i++) {
      strength = 12 + (i % 20) / 5;
      const revisionStart = performance.now(), acquired = performance.now(), snapshot = await source.readInto(acquisitionTarget), acquisitionMs = performance.now() - acquired;
      const frame = await renderer.render({ snapshot, width: 320, height: 180, dpr: 1, rect: { x: 0, y: 0, width: 320, height: 180 } }, controller.signal);
      const presentation = performance.now(); host.present(frame); const presentationMs = performance.now() - presentation, end = performance.now();
      const diagnostics = renderer.diagnostics, t = diagnostics.timings;
      if (diagnostics.surface?.radius !== 36 || diagnostics.surface?.bevel !== 30 || diagnostics.surface?.strength !== strength) throw new Error('Original optical waveform was not rendered');
      if (frame.width !== 320 || frame.height !== 180 || diagnostics.backend !== 'cpu' || (execution === 'required' && diagnostics.execution !== 'worker')) throw new Error('Wrong physical benchmark workload/backend');
      if (i >= warmup) rawFrames.push({ frame: i - warmup, optics: diagnostics.surface, acquisitionMs, ...t, presentationMs,
        batchMs: acquisitionMs + t.captureMs + t.snapshotMs + t.transferCopyMs + t.roundTripMs + t.presentationWaitMs + presentationMs,
        intervalMs: end - previousEnd, completionAgeMs: end - revisionStart });
      previousEnd = end; frame.release?.();
    }
    return { execution, repeat, diagnostic, source: { width: 640, height: 360, updatePolicy: 'static RGBA8 pixels; optical strength changes each frame', acquisition: 'full per-frame readInto copy to caller-owned target' }, opticalWaveform: 'radius36/bevel30/strength12+(i%20)/5', width: 320, height: 180, warmup, frames,
      environment: { visibility: document.visibilityState, focused: document.hasFocus(), dpr: devicePixelRatio, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency }, rawFrames,
      accountedImageBytes: 640 * 360 * 4 * 8 + 320 * 180 * 4 * 3 + CPU_LOOKUP_BYTES * (execution === 'required' ? 2 : 1) + 270000 };
  } finally { cleanup(); renderer.dispose(); source.destroy(); host.dispose(); root.remove(); }
}

export async function idleProbe() {
  const core=await import('/core/index.js'),cpu=await import('/cpu/index.js'),dom=await import('/dom/index.js');
  const bytes=new Uint8Array(40*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<40;x++)bytes.set([(x*17+y*3)%256,(y*19+x*2)%256,((x>>2)+(y>>2))%2?240:25,x<10?0:y<16?128:255],(y*40+x)*4);
  const source=core.createSource({contractVersion:1,width:40,height:32,revision:0,data:bytes,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'}),prepared=cpu.prepareCpuSource(source);
  const pixels=cpu.renderCpu(prepared,{id:'idle',width:39,height:31,radius:9,bevel:7,strength:5});cpu.disposeCpuSource(prepared);
  const cases=[];
  for(const hint of [false,true])for(let trial=0;trial<4;trial++){
    const root=document.createElement('div');root.style.cssText='display:block;width:39px;height:31px';document.body.append(root);const host=dom.mountGlassHost(root),c=host.target,get=c.getContext.bind(c);c.getContext=(type,options)=>get(type,{...options,willReadFrequently:hint});host.present({width:39,height:31,data:pixels});const ctx=get('2d');
    const first=ctx.getImageData(0,0,39,31).data;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const after=ctx.getImageData(0,0,39,31).data,diffs=[];
    for(let i=0;i<first.length;i++)if(first[i]!==after[i])diffs.push({channel:i,before:first[i],after:after[i]});
    cases.push({hint,trial,attributes:ctx.getContextAttributes?.(),idleExact:diffs.length===0,differences:diffs});host.dispose();root.remove();
  }
  return {kind:'bounded actual GlassHost idle A/B; no admission workload',cases};
}
