import { test, expect } from '@playwright/test';

// Freeze these before running the browser matrix. Compare both presentation
// canvases so the browser applies the same premultiplied storage quantization.
const MAX_CHANNEL_DELTA = 3;
const MAX_MEAN_DELTA = 0.5;

async function boot(page) {
  await page.goto('/?mode=cpu');
  await page.waitForFunction(() => window.phase1Ready === true || Boolean(window.phase1Error));
  expect(await page.evaluate(() => window.phase1Error ?? null)).toBeNull();
}

test('forced CPU paints refraction without requesting any WebGL context', async ({ page }) => {
  await page.addInitScript(() => {
    window.webglContextRequests = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (['webgl', 'experimental-webgl', 'webgl2'].includes(kind)) window.webglContextRequests++;
      return original.call(this, kind, ...args);
    };
  });
  await boot(page);
  const result = await page.evaluate(async () => {
    const { prepareSource, renderCpu } = await import('/cpu.mjs');
    const { source, cpuCanvas, cpuOptions } = window.phase1;
    const painted = cpuCanvas.getContext('2d').getImageData(0, 0, cpuCanvas.width, cpuCanvas.height).data;
    const flat = renderCpu(prepareSource(source), { ...cpuOptions, strength: 0 });
    let changed = 0;
    let visible = 0;
    for (let i = 0; i < painted.length; i += 4) {
      if (painted[i + 3] > 0) visible++;
      if (Math.abs(painted[i] - flat[i]) + Math.abs(painted[i + 1] - flat[i + 1]) + Math.abs(painted[i + 2] - flat[i + 2]) > 6) changed++;
    }
    return { contexts: window.webglContextRequests, changed, visible };
  });
  expect(result.contexts).toBe(0);
  expect(result.visible).toBeGreaterThan(0);
  expect(result.changed).toBeGreaterThan(10);
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('required WebGL2 agrees with CPU across orientation, rounding, crop, and alpha fixtures', async ({ page }) => {
  await boot(page);
  const results = await page.evaluate(async () => {
    const { prepareSource, renderCpu } = await import('/cpu.mjs');
    const { createWebGLRenderer } = await import('/webgl.mjs');
    function fixture(translucent) {
      const width = 40;
      const height = 32;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        data.set([(x * 17 + y * 3) % 256, (y * 19 + x * 2) % 256, ((x >> 2) + (y >> 2)) % 2 ? 240 : 25,
          translucent ? (x < 10 ? 0 : y < 16 ? 128 : 255) : 255], (y * width + x) * 4);
      }
      return { width, height, data };
    }
    const cases = [
      { name: 'identity orientation', options: { width: 40, height: 32, radius: 0, strength: 0 } },
      { name: 'rounded edge refraction', options: { width: 38, height: 30, radius: 10, bevel: 8, strength: 7 } },
      { name: 'cropped asymmetric source', options: { width: 31, height: 25, radius: 8, bevel: 7, strength: 4, sourceRect: { x: 3, y: 4, width: 31, height: 23 } } },
      { name: 'transparent hidden colors and fractional alpha', translucent: true, options: { width: 39, height: 31, radius: 9, bevel: 7, strength: 5 } },
    ];
    return cases.map(({ name, options, translucent }) => {
      const source = fixture(translucent);
      const original = source.data.slice();
      const prepared = prepareSource(source);
      const cpu = document.createElement('canvas');
      cpu.width = options.width;
      cpu.height = options.height;
      const context = cpu.getContext('2d');
      context.putImageData(new ImageData(renderCpu(prepared, options), options.width, options.height), 0, 0);
      const expected = context.getImageData(0, 0, options.width, options.height).data;
      const target = document.createElement('canvas');
      const renderer = createWebGLRenderer(source); // Throws if the required backend is unavailable.
      try {
        renderer.render(options, target);
        const actual = target.getContext('2d').getImageData(0, 0, options.width, options.height).data;
        let max = 0;
        let sum = 0;
        for (let i = 0; i < actual.length; i++) {
          const delta = Math.abs(actual[i] - expected[i]);
          max = Math.max(max, delta);
          sum += delta;
        }
        return { name, max, mean: sum / actual.length, backend: renderer.inspect().backend,
          sourceUnchanged: source.data.every((value, i) => value === original[i]),
          capabilities: { version: renderer.context.getParameter(renderer.context.VERSION), maxTextureSize: renderer.context.getParameter(renderer.context.MAX_TEXTURE_SIZE) } };
      } finally { renderer.destroy(); }
    });
  });
  for (const result of results) {
    expect(result.backend, result.name).toBe('webgl');
    expect(result.capabilities.version, result.name).toContain('WebGL 2');
    expect(result.capabilities.maxTextureSize, result.name).toBeGreaterThanOrEqual(40);
    expect(result.max, JSON.stringify(result)).toBeLessThanOrEqual(MAX_CHANNEL_DELTA);
    expect(result.mean, JSON.stringify(result)).toBeLessThanOrEqual(MAX_MEAN_DELTA);
    expect(result.sourceUnchanged, result.name).toBe(true);
  }
});

test('one shared context preserves idle tiles, resizes outputs, and replaces opaque pixels with transparency', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const { createWebGLRenderer } = await import('/webgl.mjs');
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let requests = 0;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) requests++;
      return originalGetContext.call(this, kind, ...args);
    };
    const data = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) data.set([230, 40, 70, x < 4 ? 255 : 0], (y * 8 + x) * 4);
    const renderer = createWebGLRenderer({ width: 8, height: 4, data });
    const first = document.createElement('canvas');
    const second = document.createElement('canvas');
    document.querySelector('#measurements').append(first, second);
    const opaque = { width: 12, height: 8, radius: 0, strength: 0, sourceRect: { x: 0, y: 0, width: 4, height: 4 } };
    function read(canvas) { return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; }
    try {
      renderer.render(opaque, first);
      const before = read(first).slice();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      renderer.render({ ...opaque, width: 17, height: 11 }, second);
      const preserved = read(first).every((value, i) => value === before[i]);
      const opaqueAlpha = read(second)[3];
      const context = second.getContext('2d');
      context.beginPath(); context.rect(0, 0, 1, 1); context.clip();
      context.globalAlpha = 0.1;
      context.globalCompositeOperation = 'multiply';
      renderer.render({ ...opaque, width: 3, height: 5, sourceRect: { x: 4, y: 0, width: 4, height: 4 } }, second);
      const transparent = read(second).every(value => value === 0);
      const active = renderer.inspect();
      renderer.destroy(); renderer.destroy();
      const dead = renderer.inspect();
      let destroyedCode;
      try { renderer.render(opaque, first); } catch (error) { destroyedCode = error.code; }
      return { requests, preserved, opaqueAlpha, transparent, width: second.width, height: second.height, active, dead, destroyedCode };
    } finally {
      renderer.destroy();
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
  expect(result.requests).toBe(1);
  expect(result.preserved).toBe(true);
  expect(result.opaqueAlpha).toBe(255);
  expect(result.transparent).toBe(true);
  expect([result.width, result.height]).toEqual([3, 5]);
  expect(result.active.renderCount).toBe(3);
  expect(result.active.resources).toEqual({ contexts: 1, textures: 3, sourceTextures: 1, outputTextures: 1, encodingTextures: 1, framebuffers: 1, programs: 1, shaders: 0, buffers: 0, vertexArrays: 0 });
  expect(Object.values(result.dead.resources).every(value => value === 0)).toBe(true);
  expect(result.dead.estimatedOwnedBytes).toBe(0);
  expect(result.dead.destroyed).toBe(true);
  expect(result.destroyedCode).toBe('DESTROYED');
});

test('context loss produces a visible failure and teardown remains idempotent', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.phase1Ready === true || Boolean(window.phase1Error));
  expect(await page.evaluate(() => window.phase1Error ?? null)).toBeNull();
  const result = await page.evaluate(async () => {
    const renderer = window.phase1.gpuRenderer;
    if (!renderer || renderer.inspect().backend !== 'webgl') throw new Error('Required WebGL preview did not start');
    const gl = renderer.context;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Required controlled context-loss capability is unavailable');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebGL context-loss event was not delivered')), 5000);
      gl.canvas.addEventListener('webglcontextlost', () => { clearTimeout(timeout); resolve(); }, { once: true });
      extension.loseContext();
    });
    const failure = window.phase1.renderGpu();
    const lost = renderer.inspect();
    renderer.destroy(); renderer.destroy();
    const dead = renderer.inspect();
    return { failure, lost, dead, visibleError: window.phase1Error };
  });
  expect(result.failure.ok).toBe(false);
  expect(result.failure.code).toBe('CONTEXT_LOST');
  expect(result.lost.contextLost).toBe(true);
  expect(result.visibleError).toMatch(/context.*lost/i);
  await expect(page.locator('#status')).toBeVisible();
  await expect(page.locator('#status')).toContainText(/context.*lost/i);
  expect(result.dead.destroyed).toBe(true);
  expect(Object.values(result.dead.resources).every(value => value === 0)).toBe(true);
  expect(result.dead.estimatedOwnedBytes).toBe(0);
});

test('browser source restrictions: CORS, tainted readback, direct upload, and DOM capture', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    async function load(url, cors) {
      const image = new Image();
      if (cors) image.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Fixture image failed to load: ${url}`));
        image.src = url;
      });
      return image;
    }
    function errorName(action) {
      try { action(); return null; } catch (error) { return error.name; }
    }
    const noCorsImage = await load('http://127.0.0.1:4174/fixture.svg', false);
    const tainted = document.createElement('canvas');
    tainted.width = tainted.height = 8;
    tainted.getContext('2d').drawImage(noCorsImage, 0, 0);
    const taintError = errorName(() => tainted.getContext('2d').getImageData(0, 0, 1, 1));
    const corsImage = await load('http://127.0.0.1:4174/fixture.svg?cors=1', true);
    const approved = document.createElement('canvas');
    approved.width = approved.height = 8;
    const context = approved.getContext('2d');
    context.drawImage(corsImage, 0, 0);
    const approvedPixels = context.getImageData(0, 0, 8, 8).data;
    const domError = errorName(() => context.drawImage(document.body, 0, 0));
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) throw new Error('Required WebGL capability is unavailable; source restriction test cannot pass');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const uploadError = errorName(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noCorsImage));
    gl.deleteTexture(texture);
    let approvedAlpha = 0;
    for (let i = 3; i < approvedPixels.length; i += 4) approvedAlpha = Math.max(approvedAlpha, approvedPixels[i]);
    return { taintError, domError, uploadError, approvedLength: approvedPixels.length, approvedAlpha };
  });
  expect(result.taintError).toBe('SecurityError');
  expect(result.uploadError).toBe('SecurityError');
  expect(result.domError).toBe('TypeError');
  expect(result.approvedLength).toBe(8 * 8 * 4);
  expect(result.approvedAlpha).toBeGreaterThan(0);
});

test('the allowlisted spike server does not serve private files or traversal paths', async ({ request }) => {
  const paths = [
    '/private/README.md',
    '/../../private/README.md',
    '/%2e%2e/private/README.md',
    '/%2e%2e%2fprivate%2fREADME.md',
    '/%252e%252e%252fprivate%252fREADME.md',
    '/..%5cprivate%5cREADME.md',
    '/%00/private/README.md',
    '/.git/config',
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test('benchmark receipts include actual work, bounded samples, ages and target cleanup', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const cpu = await window.phase1.benchmark({ backend: 'cpu', frames: 2, warmup: 1 });
    const webgl = await window.phase1.benchmark({ backend: 'webgl', count: 2, width: 64, height: 36, frames: 2, warmup: 1 });
    let invalidRejected = false;
    try { await window.phase1.benchmark({ backend: 'cpu', frames: 0 }); } catch { invalidRejected = true; }
    return { cpu, webgl, invalidRejected, targets: document.querySelector('#measurements').childElementCount };
  });
  expect(result.invalidRejected).toBe(true);
  expect(result.targets).toBe(0);
  for (const receipt of [result.cpu, result.webgl]) {
    expect(receipt.rawFrames).toHaveLength(2);
    expect(receipt.environment.visibility).toBe('visible');
    expect(receipt.batchMs.p95).toBeGreaterThanOrEqual(0);
    expect(receipt.completionAgeMs.p95).toBeGreaterThanOrEqual(0);
    expect(receipt.oldestSurfaceAgeMs.p95).toBeGreaterThanOrEqual(0);
    expect(receipt.targetCanvasBytesLowerBound).toBe(receipt.count * receipt.width * receipt.height * 4);
  }
  expect(result.cpu.cpuKernelMs.p95).toBeGreaterThan(0);
  expect(result.webgl.gpu.backend).toBe('webgl');
  expect(result.webgl.gpu.resources.contexts).toBe(1);
  expect(result.webgl.gpu.renderCount).toBe(6);
});

test('atlas batching preserves independent tiles, alpha, state and bounded resources', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => (await import('/batch-check.mjs')).checkBatch());
  for (const parity of result.parity) {
    expect(parity.max, JSON.stringify(result)).toBeLessThanOrEqual(MAX_CHANNEL_DELTA);
    expect(parity.mean, JSON.stringify(result)).toBeLessThanOrEqual(MAX_MEAN_DELTA);
  }
  for (const key of ['idle', 'preserved', 'cleared', 'sourceUnchanged', 'duplicateRejected', 'budgetRejected']) expect(result[key], key).toBe(true);
  expect(result.requests).toBe(1);
  expect(result.batch.gpuSnapshots).toBe(1);
  expect(result.batch.targets).toBe(4);
  expect(result.active.renderCount).toBe(6);
  expect(result.active.batchCount).toBe(2);
  expect(result.active.resources.contexts).toBe(1);
  expect(result.active.resources.textures).toBe(3);
  expect(result.active.presentationResources.snapshotCanvases).toBe(1);
  expect(result.dead.estimatedOwnedBytes).toBe(0);
  expect(Object.values(result.dead.resources).every(value => value === 0)).toBe(true);
  expect(result.dead.presentationResources.snapshotCanvases).toBe(0);
});

test('CSS material retains real DOM content with JavaScript disabled', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ javaScriptEnabled: false, baseURL });
  try {
    await page.goto('/');
    await expect(page.locator('.material')).toBeVisible();
    await expect(page.locator('.material')).toHaveText('Native DOM content');
    const style = await page.locator('.material').evaluate(element => {
      const computed = getComputedStyle(element);
      return { background: computed.backgroundColor, filter: computed.backdropFilter };
    });
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.filter).toContain('blur');
    await expect(page.locator('#status')).toHaveText('Loading local image…');
  } finally { await page.close(); }
});
