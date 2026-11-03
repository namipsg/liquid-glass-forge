import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { screenshotPixels } from './png-pixels.mjs';

export async function frame(page, channel = 0, value = 255) {
  await page.waitForFunction(({ channel, value }) => [...document.querySelectorAll('.test-card > canvas')].length === 2 &&
    [...document.querySelectorAll('.test-card > canvas')].every(c => c.width >= 280 && c.getContext('2d').getImageData(0, 0, 1, 1).data[channel] === value), { channel, value });
}
export async function configure(page, name) {
  await page.evaluate(name => window.phase10.configure(name), name);
}
export async function resizeCheck(page, timeout = 5000) {
  await page.evaluate(() => { document.querySelector('.test-card').style.width = '320px'; });
  await page.waitForFunction(() => document.querySelector('.test-card > canvas').width === 320, undefined, { timeout });
}
export async function staleCheck(page) {
  await configure(page, 'held-worker'); await page.waitForFunction(() => window.phase10.state.run.pending.length > 0);
  await page.evaluate(() => {
    const c = document.querySelector('.test-card > canvas'), ctx = c.getContext('2d'), put = ctx.putImageData.bind(ctx);
    window.stalePaints = []; ctx.putImageData = (image, ...args) => { window.stalePaints.push([...image.data.subarray(0, 4)]); return put(image, ...args); };
    window.phase10.update(); window.phase10.state.run.pending.splice(0).forEach(resolve => resolve());
  });
  await page.waitForFunction(() => window.phase10.state.run.released >= 2);
  const paints = await page.evaluate(() => window.stalePaints);
  assert.deepEqual(paints, [], 'superseded worker frames painted before latest source');
  await page.waitForFunction(() => window.phase10.state.run.pending.length > 0);
  await page.evaluate(() => { window.retiredTarget = document.querySelector('.test-card > canvas'); });
  await page.evaluate(() => window.phase10.unmount());
  const before = await page.evaluate(() => ({ width: window.retiredTarget.width, pixels: [...window.retiredTarget.getContext('2d').getImageData(0, 0, 1, 1).data] }));
  assert.equal(await page.evaluate(() => window.phase10.state.run.renderSignal.aborted), true);
  await page.evaluate(() => window.phase10.state.run.pending.splice(0).forEach(resolve => resolve()));
  await page.waitForFunction(() => window.phase10.state.run.released >= 4);
  assert.deepEqual(await page.evaluate(() => ({ width: window.retiredTarget.width, pixels: [...window.retiredTarget.getContext('2d').getImageData(0, 0, 1, 1).data] })), before);
  assert.equal(await page.evaluate(() => window.phase10.state.run.workerCreated === window.phase10.state.run.workerTerminated), true);
}
const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
export async function opaqueCheck(page, file) {
  await page.waitForFunction(() => [...document.querySelectorAll('.test-card > canvas')].every(c => getComputedStyle(c).opacity === '0'));
  const colors = await page.evaluate(() => {
    const host = document.querySelector('.test-card'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sample = value => { ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const rect = host.getBoundingClientRect(), style = getComputedStyle(host);
    return { foreground: sample(style.color), background: sample(style.backgroundColor), x: Math.round(rect.right - 40), y: Math.round(rect.bottom - 12) };
  });
  const screenshot = await page.screenshot({ path: file });
  const pixel = screenshotPixels(screenshot).pixel(colors.x, colors.y);
  assert.deepEqual(pixel, colors.background, 'opaque host does not cover adverse source/background');
  const a = luminance(colors.foreground), b = luminance(pixel), contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  assert.ok(contrast >= 4.5, 'fixture inherited text contrast < 4.5:1');
  return { ...colors, pixel, contrast };
}

export async function accessChecks(page, engineName, dir, adapter) {
  await configure(page, 'webgl'); await frame(page);
  await page.evaluate(() => window.phase10.update([0, 0, 0, 255])); await frame(page, 0, 0);
  await page.evaluate(() => window.phase10.material('opaque'));
  const light = await opaqueCheck(page, `${dir}/${engineName}-${adapter}-opaque-light.png`);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce', contrast: 'more' });
  const dark = await opaqueCheck(page, `${dir}/${engineName}-${adapter}-opaque-dark.png`);
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  let tabKey = 'Tab';
  // macOS WebKit follows the user's text-controls-only Tab preference. Verify
  // that behavior on plain DOM, then use native Option-Tab for all controls.
  if (engineName === 'webkit' && process.platform === 'darwin') {
    await page.evaluate(() => { const p = document.createElement('div'); p.id = 'keyboard-probe'; p.innerHTML = '<input id="probe-first"><button id="probe-button">Probe</button><input id="probe-last">'; document.querySelector('header').append(p); });
    await page.focus('#probe-first'); await page.keyboard.press('Tab');
    const plainTab = await page.evaluate(() => document.activeElement.id);
    if (plainTab === 'probe-last') tabKey = 'Alt+Tab'; else assert.equal(plainTab, 'probe-button');
    await page.evaluate(() => document.querySelector('#keyboard-probe').remove());
  }
  await page.focus('#name-0'); await page.keyboard.type('Keyboard input'); await page.keyboard.press(tabKey);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'count-0');
  await page.keyboard.press('Enter'); await expect(page.locator('#status')).toContainText('Native clicks:');
  await page.keyboard.press(tabKey); assert.equal(await page.evaluate(() => document.activeElement.id), 'link-0');
  const aria = await page.locator('#app').ariaSnapshot();
  assert.match(aria, /textbox "Name 0"/); assert.match(aria, /button "Count"/); assert.match(aria, /link "Next section"/); assert.match(aria, /img "Color tile"/);
  assert.doesNotMatch(aria, /canvas|presentation/); await writeFile(`${dir}/${engineName}-${adapter}-aria.yml`, aria);
  await page.focus('#name-0'); const focusPixels = screenshotPixels(await page.screenshot({ path: `${dir}/${engineName}-${adapter}-focus.png` }));
  const focus = await page.$eval('#name-0', e => {
    const rect = e.getBoundingClientRect(), ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const sample = color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    return { width: getComputedStyle(e).outlineWidth, style: getComputedStyle(e).outlineStyle, ring: sample(getComputedStyle(e).outlineColor), background: sample(getComputedStyle(e.closest('.test-card')).backgroundColor), x: Math.round(rect.right + 5), y: Math.round(rect.top + rect.height / 2) };
  });
  assert.notEqual(focus.width, '0px'); assert.equal(focus.style, 'solid');
  focus.pixel = focusPixels.pixel(focus.x, focus.y); assert.deepEqual(focus.pixel, focus.ring);
  const ringLight = luminance(focus.ring), backgroundLight = luminance(focus.background);
  focus.contrast = (Math.max(ringLight, backgroundLight) + .05) / (Math.min(ringLight, backgroundLight) + .05);
  assert.ok(focus.contrast >= 3, 'focus indicator contrast < 3:1');
  await page.evaluate(() => window.phase10.material('glass'));
  await page.emulateMedia({ forcedColors: 'active' });
  const forcedActive = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
  let forced;
  if (forcedActive) forced = await opaqueCheck(page, `${dir}/${engineName}-${adapter}-forced-colors.png`);
  // CDP is a native browser test API. Other engines still run the mandatory explicit opaque mode.
  await page.emulateMedia({ forcedColors: 'none', colorScheme: 'light', reducedMotion: 'no-preference', contrast: 'no-preference' });
  let transparency = { emulation: 'unavailable in this Playwright engine' }, nativeAX;
  if (engineName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    const tree = await session.send('Accessibility.getFullAXTree');
    for (const [role, name] of [['textbox', 'Name 0'], ['button', 'Count'], ['link', 'Next section'], ['image', 'Color tile']]) {
      assert.ok(tree.nodes.some(node => !node.ignored && node.role?.value === role && node.name?.value === name), 'native AX control missing: ' + name);
    }
    const document = await session.send('DOM.getDocument');
    const targets = await session.send('DOM.querySelectorAll', { nodeId: document.root.nodeId, selector: '.test-card > canvas' });
    assert.equal(targets.nodeIds.length, 2);
    for (const nodeId of targets.nodeIds) {
      const { node } = await session.send('DOM.describeNode', { nodeId });
      assert.ok(tree.nodes.filter(item => item.backendDOMNodeId === node.backendNodeId).every(item => item.ignored), 'decorative canvas in native accessibility tree');
    }
    nativeAX = { nodes: tree.nodes.length, decorativeCanvasesHidden: true, nativeControlsPresent: true };
    await writeFile(`${dir}/${engineName}-${adapter}-native-ax.json`, JSON.stringify(tree, null, 2));
    await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true);
    transparency = await opaqueCheck(page, `${dir}/${engineName}-${adapter}-reduced-transparency.png`);
    await session.send('Emulation.setEmulatedMedia', { features: [] }); await session.detach();
  }
  await page.emulateMedia({ colorScheme: 'light', forcedColors: 'none', reducedMotion: 'reduce', contrast: 'no-preference' });
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  const transition = await page.evaluate(() => window.phase10.transition());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return { light, dark, forcedActive, forced, transparency, focus, nativeAX, tabKey, reducedMotionTransition: transition, aria };
}

export async function lifecycleChecks(page, backend) {
  await configure(page, backend); await frame(page);
  const before = await page.evaluate(() => window.gpuRequests);
  await page.waitForTimeout(180);
  const idle = await page.evaluate(() => [window.rafRequests, window.phase10.state.run.completed]);
  await page.waitForTimeout(180);
  assert.deepEqual(await page.evaluate(() => [window.rafRequests, window.phase10.state.run.completed]), idle, 'idle framework scene keeps scheduling');
  await page.fill('#name-0', 'Native input'); await page.click('#count-0');
  await page.focus('#name-0'); await page.keyboard.press('ControlOrMeta+A');
  assert.deepEqual(await page.$eval('#name-0', e => [e.selectionStart, e.selectionEnd]), [0, 12]);
  await page.evaluate(() => window.phase10.update()); await frame(page, 1, 255);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'name-0');
  await resizeCheck(page); await frame(page, 1, 255);
  const image = await page.locator('#image-0').boundingBox();
  await page.mouse.move(image.x + 8, image.y + 8); await page.mouse.down();
  await page.mouse.move(image.x + 110, image.y + 55, { steps: 12 }); await page.mouse.up(); await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => window.phase10.drags > 0));
  await page.fill('#name-0', 'After image drag');
  const transition = await page.evaluate(() => window.phase10.transition()); await frame(page, 1, 255);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.phase10.unmount());
    const retired = await page.evaluate(() => {
      const run = window.phase10.state.run, diagnostics = run.diagnostics();
      return { active: run.active, subscriptions: run.subscriptions, workers: run.workerCreated - run.workerTerminated,
        pool: diagnostics.pool, gpuResources: diagnostics.gpu?.resources, gpuOwnedImageBytes: diagnostics.gpu?.ownedImageBytes ?? 0 };
    });
    assert.equal(retired.active, 0); assert.equal(retired.subscriptions, 0); assert.equal(retired.workers, 0); assert.equal(retired.pool.leased, 0);
    assert.equal(retired.gpuOwnedImageBytes, 0); if (retired.gpuResources) assert.ok(Object.values(retired.gpuResources).every(count => count === 0));
    await page.evaluate(() => window.phase10.mount()); await frame(page, 1, 255);
    assert.equal(await page.evaluate(() => window.phase10.state.run.active), 1);
  }
  await page.evaluate(() => window.phase10.navigate()); await frame(page, 1, 255); assert.match(page.url(), /#home$/);
  const result = await page.evaluate(() => ({ diagnostics: window.phase10.state.run.diagnostics(), initialized: window.phase10.state.run.initialized, completed: window.phase10.state.run.completed, gpuRequests: window.gpuRequests }));
  assert.equal(result.diagnostics.effectiveBackend, backend === 'webgl' ? 'webgl' : 'cpu');
  if (backend === 'worker') assert.equal(result.diagnostics.cpu.execution, 'worker');
  if (backend === 'cpu') assert.equal(result.gpuRequests, before, 'forced CPU requested a WebGL context');
  if (backend === 'webgl') {
    assert.ok(result.gpuRequests > 0 && result.diagnostics.gpu.renderCount > 0);
    result.environment = await page.evaluate(() => {
      const gl = window.phase10.state.run.optical.atlas.context;
      return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR), identity: 'browser-reported; may be privacy masked' };
    });
  }
  assert.ok(result.diagnostics.pool.contexts <= 4); assert.ok(result.diagnostics.pool.leased <= 1);
  return { ...result, transition };
}
