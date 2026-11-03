import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { integrationServers } from '../tests/integration-server.mjs';
import { screenshotPixels } from '../tests/png-pixels.mjs';

const receiptFile = process.argv[2];
if (!receiptFile) throw Error('Provide the exact passing integration receipt');
const verified = JSON.parse(await readFile(receiptFile));
assert.equal(verified.pass, true, 'candidate requires a passing integration matrix');
const www = path.resolve(verified.reviewAssets), output = path.join(www, 'candidate');
await mkdir(output, { recursive: true });
const server = await integrationServers(www); let browser;
const result = { sourceReceipt: path.resolve(receiptFile), browser: 'installed Google Chrome; isolated temporary browser context', method: 'native Chrome keyboard, AX tree and screenshots; no VoiceOver session claimed', adapters: [], pass: false };
const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
async function captureOpaque(page, file) {
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.test-card > canvas')).opacity === '0');
  const colors = await page.$eval('.test-card', host => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const sample = value => { ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    return { background: sample(getComputedStyle(host).backgroundColor), foreground: sample(getComputedStyle(host).color) };
  });
  const pixels = screenshotPixels(await page.locator('.test-card').first().screenshot({ path: file }));
  assert.deepEqual(pixels.pixel(pixels.width - 40, pixels.height - 12), colors.background);
  const a = luminance(colors.foreground), b = luminance(colors.background), contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  assert.ok(contrast >= 4.5); return { ...colors, contrast };
}
try {
  browser = await chromium.launch({ channel: 'chrome' }); result.browserVersion = browser.version();
  for (const adapter of ['vanilla', 'react', 'vue', 'angular']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin + '/' + adapter + '/?review=1&other=' + encodeURIComponent(server.other));
    await page.waitForFunction(() => window.phase10?.state.run?.completed > 0);
    assert.equal(await page.evaluate(() => window.phase10.state.run.diagnostics().effectiveBackend), 'webgl');
    await page.locator('.test-card').first().screenshot({ path: path.join(output, adapter + '-glass.png') });
    const session = await page.context().newCDPSession(page), ax = await session.send('Accessibility.getFullAXTree');
    for (const [role, name] of [['textbox', 'Name 0'], ['button', 'Count'], ['link', 'Next section'], ['image', 'Color tile']]) assert.ok(ax.nodes.some(node => !node.ignored && node.role?.value === role && node.name?.value === name));
    const document = await session.send('DOM.getDocument'), canvases = await session.send('DOM.querySelectorAll', { nodeId: document.root.nodeId, selector: '.test-card > canvas' });
    assert.equal(canvases.nodeIds.length, 2);
    for (const nodeId of canvases.nodeIds) { const { node } = await session.send('DOM.describeNode', { nodeId }); assert.ok(ax.nodes.filter(n => n.backendDOMNodeId === node.backendNodeId).every(n => n.ignored)); }
    await writeFile(path.join(output, adapter + '-ax.json'), JSON.stringify(ax, null, 2)); await session.detach();
    await page.focus('#name-0'); await page.keyboard.type('Chrome check'); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'count-0'); await page.keyboard.press('Enter');
    assert.ok(await page.evaluate(() => window.phase10.clicks > 0));
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'link-0');
    await page.click('#opaque');
    const light = await captureOpaque(page, path.join(output, adapter + '-opaque.png'));
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await captureOpaque(page, path.join(output, adapter + '-dark.png'));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.focus('#name-0'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Focus visible');
    const focus = await page.$eval('#name-0', input => ({ width: getComputedStyle(input).outlineWidth, style: getComputedStyle(input).outlineStyle }));
    assert.equal(focus.style, 'solid'); assert.ok(parseFloat(focus.width) >= 3);
    const box = await page.locator('#name-0').boundingBox();
    await page.screenshot({ path: path.join(output, adapter + '-focus.png'), clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
    assert.deepEqual(errors, []); result.adapters.push({ adapter, light, dark, focus, nativeAX: true, keyboard: true });
    await page.evaluate(() => window.phase10.destroy()); await page.close();
  }
  const css = 'body{margin:24px;font:16px system-ui;color:#18212b;background:#fff}h1{font-size:24px;margin-bottom:8px}p{max-width:1000px;line-height:1.5}table{border-collapse:collapse;width:100%;max-width:1240px}th,td{padding:10px;border-bottom:1px solid #ccd1d7;text-align:left;vertical-align:middle}img{display:block;width:240px;max-width:100%;height:auto;border:1px solid #ccd1d7}td:last-child img{width:200px}.result{font-size:13px;color:#3b4855}';
  await writeFile(path.join(output, 'candidate.css'), css);
  await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Phase 10 concise visual review</title><link rel="stylesheet" href="candidate.css"><h1>One visual check: readable text and visible focus</h1><p>Chrome keyboard and native accessibility-tree checks passed for all four adapters. Decorative canvases are omitted. Please inspect the opaque and focus columns: text should be readable and the focus outline clear. Glass is shown only for comparison.</p><table><thead><tr><th>Adapter</th><th>Glass</th><th>Opaque · light</th><th>Opaque · dark</th><th>Keyboard focus</th></tr></thead><tbody>${result.adapters.map(item => `<tr><th>${item.adapter}<p class="result">Contrast ${item.light.contrast.toFixed(1)}:1 / ${item.dark.contrast.toFixed(1)}:1</p></th>${['glass','opaque','dark','focus'].map(mode => `<td><img src="${item.adapter}-${mode}.png" alt="${item.adapter} ${mode}" /></td>`).join('')}</tr>`).join('')}</tbody></table><p class="result">This page records the verified packed candidate. Native VoiceOver execution, broader devices and performance are not inferred from the Chrome accessibility tree.</p></html>`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(server.origin + '/candidate/'); await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await page.screenshot({ path: path.join(path.dirname(path.resolve(receiptFile)), 'access-candidate.png'), fullPage: true }); await page.close();
  result.pass = true;
} catch (error) { result.error = error.stack; throw error; }
finally {
  await browser?.close(); await server.close();
  result.producerSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
  await writeFile(path.join(output, 'inspection.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, pass: result.pass, error: result.error }));
}
