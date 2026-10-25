import { prepareSource, renderCpu } from './cpu.mjs';
import { createWebGLRenderer } from './webgl.mjs';

// Shared browser/device fixture. Tolerances remain in each calling test gate.
export async function checkBatch() {
  const source = { width: 40, height: 32, data: new Uint8ClampedArray(40 * 32 * 4) };
  for (let y = 0; y < 32; y++) for (let x = 0; x < 40; x++) {
    source.data.set([(17 * x + 3 * y) % 256, (19 * y + 2 * x) % 256,
      ((x >> 2) + (y >> 2)) % 2 ? 240 : 25, x < 10 ? 0 : y < 16 ? 128 : 255], (y * 40 + x) * 4);
  }
  const before = source.data.slice(), prepared = prepareSource(source);
  const options = [
    { width: 40, height: 32, radius: 0, strength: 0 },
    { width: 38, height: 30, radius: 10, bevel: 8, strength: 7 },
    { width: 31, height: 25, radius: 8, bevel: 7, strength: 4, sourceRect: { x: 3, y: 4, width: 31, height: 23 } },
    { width: 39, height: 31, radius: 9, bevel: 7, strength: 5 },
  ];
  const targets = options.map(() => document.createElement('canvas'));
  document.querySelector('#measurements').append(...targets);
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  let requests = 0, renderer;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) requests++;
    return originalGetContext.call(this, kind, ...args);
  };
  const read = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const compare = (target, settings) => {
    const reference = document.createElement('canvas');
    reference.width = settings.width; reference.height = settings.height;
    reference.getContext('2d').putImageData(new ImageData(renderCpu(prepared, settings), settings.width, settings.height), 0, 0);
    const expected = read(reference), actual = read(target);
    let max = 0, sum = 0;
    for (let i = 0; i < actual.length; i++) { const delta = Math.abs(actual[i] - expected[i]); max = Math.max(max, delta); sum += delta; }
    return { max, mean: sum / actual.length };
  };
  try {
    renderer = createWebGLRenderer(source);
    const batch = renderer.renderBatch(options.map((settings, i) => ({ options: settings, target: targets[i] })));
    const parity = targets.map((target, i) => compare(target, options[i]));
    const saved = targets.map(target => read(target).slice());
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const idle = targets.every((target, i) => read(target).every((value, j) => value === saved[i][j]));
    const changed = { ...options[2], width: 47, height: 23 };
    const transparent = { width: 9, height: 7, radius: 0, strength: 0, sourceRect: { x: 0, y: 0, width: 4, height: 4 } };
    const context = targets[2].getContext('2d');
    context.beginPath(); context.rect(0, 0, 1, 1); context.clip(); context.globalAlpha = .1;
    renderer.renderBatch([{ options: changed, target: targets[2] }, { options: transparent, target: targets[3] }]);
    parity.push(compare(targets[2], changed));
    const preserved = [0, 1].every(i => read(targets[i]).every((value, j) => value === saved[i][j]));
    const cleared = read(targets[3]).every(value => value === 0);
    let duplicateRejected = false, budgetRejected = false;
    try { renderer.renderBatch([{ options: options[0], target: targets[0] }, { options: options[1], target: targets[0] }]); }
    catch (error) { duplicateRejected = error instanceof TypeError; }
    try { renderer.renderBatch(targets.slice(0, 2).map(target => ({ target, options: { width: 2000, height: 2000 } }))); }
    catch (error) { budgetRejected = error.code === 'BATCH_SIZE_UNSUPPORTED'; }
    const active = renderer.inspect();
    renderer.destroy(); renderer.destroy();
    const dead = renderer.inspect();
    return { requests, batch, parity, idle, preserved, cleared, duplicateRejected, budgetRejected,
      sourceUnchanged: source.data.every((value, i) => value === before[i]), active, dead };
  } finally {
    renderer?.destroy(); targets.forEach(target => target.remove());
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
}
