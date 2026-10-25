import { prepareSource, renderCpu } from './cpu.mjs';
import { createWebGLRenderer } from './webgl.mjs';

const now = () => performance.now();
const frame = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Animation frame unavailable; benchmark interrupted')), 5000);
  requestAnimationFrame(time => { clearTimeout(timer); resolve(time); });
});
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? null;
const summary = values => ({ p50: percentile(values, .5), p95: percentile(values, .95), max: Math.max(...values) });

export async function loadImageSource(url) {
  const begin = now();
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas2D unavailable');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return { source: { width: canvas.width, height: canvas.height, data }, acquisitionMs: now() - begin };
}

export async function benchmark(source, { backend, count = 1, width = 320, height = 180, frames = 90, warmup = 15 } = {}) {
  if (!['cpu', 'webgl'].includes(backend)) throw new Error('Explicit cpu or webgl backend required');
  for (const [name, value, max] of [['count', count, 16], ['frames', frames, 600], ['warmup', warmup, 120]]) {
    if (!Number.isInteger(value) || value < (name === 'warmup' ? 0 : 1) || value > max) throw new Error(`Invalid ${name}`);
  }
  if (![width, height].every(n => Number.isInteger(n) && n > 0) || width * height > 4000000) throw new Error('Invalid output dimensions');
  const stage = document.querySelector('#measurements');
  const canvases = [], contexts = [], outputs = [], imageData = [];
  let renderer;
  const setupStart = now();
  let prepared;
  try {
    if (backend === 'cpu') prepared = prepareSource(source);
    else renderer = createWebGLRenderer(source);
    for (let i = 0; i < count; i++) {
      const target = document.createElement('canvas');
      target.width = width; target.height = height;
      target.style.width = '320px'; target.style.height = '180px';
      target.setAttribute('aria-hidden', 'true');
      stage.append(target); canvases.push(target);
      if (backend === 'cpu') {
        contexts.push(target.getContext('2d'));
        outputs.push(new Uint8ClampedArray(width * height * 4));
        imageData.push(new ImageData(outputs[i], width, height));
      }
    }
    const setupMs = now() - setupStart;
    const options = { width, height, radius: Math.min(width, height) / 5, bevel: Math.min(width, height) / 6, strength: 18 };
    const batchesMs = [], frameIntervalsMs = [], rawFrames = [];
    const kernelMs = [], presentationMs = [], completionAgeMs = [], oldestSurfaceAgeMs = [];
    let previousFrame;
    for (let i = 0; i < frames + warmup; i++) {
      const timestamp = await frame();
      const start = now();
      let kernel = 0, presentation = 0;
      const completedAt = [];
      for (let surface = 0; surface < count; surface++) {
        // Changing optical state defeats a no-op result/cache shortcut.
        options.strength = 12 + ((i + surface) % 20) / 5;
        if (backend === 'cpu') {
          const kernelStart = now();
          renderCpu(prepared, options, outputs[surface]);
          kernel += now() - kernelStart;
          const copyStart = now();
          contexts[surface].putImageData(imageData[surface], 0, 0);
          presentation += now() - copyStart;
        } else renderer.render(options, canvases[surface]);
        completedAt.push(now());
      }
      const elapsed = now() - start;
      if (i >= warmup) {
        batchesMs.push(elapsed);
        if (previousFrame !== undefined) frameIntervalsMs.push(timestamp - previousFrame);
        if (backend === 'cpu') { kernelMs.push(kernel); presentationMs.push(presentation); }
        const completionAge = completedAt.at(-1) - timestamp;
        const oldestSurfaceAge = completedAt.at(-1) - completedAt[0];
        completionAgeMs.push(completionAge); oldestSurfaceAgeMs.push(oldestSurfaceAge);
        rawFrames.push({ frame: i - warmup, timestamp, batchMs: elapsed, intervalMs: previousFrame === undefined ? null : timestamp - previousFrame,
          completionAgeMs: completionAge, oldestSurfaceAgeMs: oldestSurfaceAge, completedAt,
          cpuKernelMs: backend === 'cpu' ? kernel : null, cpuPresentationMs: backend === 'cpu' ? presentation : null });
      }
      previousFrame = timestamp;
    }
    const gpuBeforeDestroy = renderer?.inspect() ?? null;
    return {
      backend, count, width, height, frames, warmup, setupMs,
      source: { width: source.width, height: source.height, updatePolicy: 'decoded once, static pixels; optical strength changes each frame' },
      timedWork: backend === 'cpu' ? 'JS optics and Canvas2D putImageData for entire batch' : 'WebGL commands, FBO blit and synchronous Canvas2D copies for entire batch; not a GPU timer',
      batchMs: summary(batchesMs), frameIntervalMs: summary(frameIntervalsMs), rawFrames,
      completionAgeMs: summary(completionAgeMs), oldestSurfaceAgeMs: summary(oldestSurfaceAgeMs),
      cpuKernelMs: backend === 'cpu' ? summary(kernelMs) : null,
      cpuPresentationMs: backend === 'cpu' ? summary(presentationMs) : null,
      ageDefinition: 'Time from the rAF optical revision timestamp to the last synchronous Canvas2D copy. Oldest-surface age is first-to-last copy skew at batch completion. Neither measures physical display scanout. Static source has no producer revision/latency measurement.',
      estimatedOwnedBytes: gpuBeforeDestroy?.estimatedOwnedBytes ?? prepared.data.byteLength + outputs.reduce((sum, array) => sum + array.byteLength, 0),
      targetCanvasBytesLowerBound: count * width * height * 4,
      inputBytes: source.data.byteLength,
      allocationNote: 'Explicit array/texture/drawing-buffer storage estimate only; target canvases and borrowed input shown separately. Excludes browser/driver/compositor overhead and transient allocations; not measured process or GPU memory.',
      gpu: gpuBeforeDestroy,
      environment: { userAgent: navigator.userAgent, devicePixelRatio, visibility: document.visibilityState, hardwareConcurrency: navigator.hardwareConcurrency },
      note: 'No physical-device or browser-support guarantee. Source decode/readback and renderer setup are outside timed batches and reported separately.',
    };
  } finally {
    renderer?.destroy();
    for (const canvas of canvases) canvas.remove();
  }
}

async function boot() {
  const { source, acquisitionMs } = await loadImageSource('/fixture.svg');
  const cpuCanvas = document.querySelector('#cpu');
  const cpuOptions = { width: 320, height: 180, radius: 36, bevel: 28, strength: 18 };
  const prepared = prepareSource(source);
  cpuCanvas.getContext('2d').putImageData(new ImageData(renderCpu(prepared, cpuOptions), 320, 180), 0, 0);
  let gpuStatus = 'disabled for forced CPU mode';
  let gpuRenderer = null;
  if (new URLSearchParams(location.search).get('mode') !== 'cpu') {
    gpuRenderer = createWebGLRenderer(source);
    gpuRenderer.render(cpuOptions, document.querySelector('#gpu'));
    gpuStatus = JSON.stringify(gpuRenderer.inspect().attributes);
    addEventListener('pagehide', () => gpuRenderer.destroy(), { once: true });
  }
  const renderGpu = () => {
    try {
      if (!gpuRenderer) throw new Error('WebGL preview is disabled');
      gpuRenderer.render(cpuOptions, document.querySelector('#gpu'));
      return { ok: true };
    } catch (error) {
      window.phase1Error = `${error.code ?? error.name}: ${error.message}`;
      document.querySelector('#status').textContent = window.phase1Error;
      return { ok: false, code: error.code ?? error.name, error: error.message };
    }
  };
  window.phase1 = { source, cpuCanvas, cpuOptions, acquisitionMs, gpuRenderer, renderGpu, benchmark: options => benchmark(source, options) };
  window.phase1Ready = true;
  document.querySelector('#status').textContent = `Local image decoded and read in ${acquisitionMs.toFixed(2)} ms. CPU frame painted. WebGL: ${gpuStatus}`;
  const button = document.querySelector('#benchmark');
  button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    const output = document.querySelector('#result');
    output.textContent = 'Measuring warm CPU and shared-context WebGL batches…';
    try {
      const cpu = await benchmark(source, { backend: 'cpu' });
      const webgl = await benchmark(source, { backend: 'webgl', count: 4, width: 640, height: 360 });
      window.phase1.lastBenchmark = { acquisitionMs, cpu, webgl };
      output.textContent = JSON.stringify({ acquisitionMs, cpu: { ...cpu, rawFrames: '(retained in window.phase1.lastBenchmark)' }, webgl: { ...webgl, rawFrames: '(retained in window.phase1.lastBenchmark)' } }, null, 2);
    } catch (error) { output.textContent = `${error.name}: ${error.message}`; }
    finally { button.disabled = false; }
  });
}

boot().catch(error => {
  window.phase1Error = `${error.name}: ${error.message}`;
  document.querySelector('#status').textContent = window.phase1Error;
});
