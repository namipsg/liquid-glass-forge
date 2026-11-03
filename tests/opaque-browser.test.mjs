import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from '@playwright/test';
import { sourceServers } from './source-server.mjs';
import { screenshotPixels } from './png-pixels.mjs';

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(name + ': opaque material covers adverse optical pixels', async () => {
    await mkdir('private/phase-10/opaque', { recursive: true });
    const dir = await mkdtemp('private/phase-10/opaque/' + name + '-');
    const server = await sourceServers(); let browser;
    const receipt = { engine: name, pass: false };
    try {
      browser = await engine.launch(); receipt.version = browser.version();
      const page = await browser.newPage(); await page.goto(server.origin);
      await page.evaluate(async () => {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/styles.css';
        document.head.append(link); await new Promise(resolve => link.onload = resolve);
        document.body.style.cssText = 'margin:0;background:repeating-conic-gradient(black 0% 25%,white 0% 50%) 0/16px 16px';
        document.body.innerHTML = '<section id="host" style="display:block;width:240px;height:120px;color:CanvasText"><label>Name <input /></label></section>';
        const { mountGlassHost } = await import('/dom.js');
        const host = mountGlassHost(document.querySelector('#host'), { material: 'opaque' });
        host.present({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) });
      });
      const bytes = await page.screenshot({ path: dir + '/opaque.png' });
      receipt.backgroundPixel = screenshotPixels(bytes).pixel(100, 90);
      receipt.styles = await page.evaluate(() => ({
        host: getComputedStyle(document.querySelector('#host')).backgroundColor,
        canvasOpacity: getComputedStyle(document.querySelector('canvas')).opacity,
      }));
      await writeFile(dir + '/receipt.json', JSON.stringify(receipt, null, 2));
      assert.deepEqual(receipt.backgroundPixel, [255, 255, 255, 255], 'opaque Canvas must cover black optical output');
      assert.equal(receipt.styles.canvasOpacity, '0');
      receipt.pass = true;
    } catch (error) { receipt.error = error.stack; throw error; }
    finally { await browser?.close(); await server.close(); await writeFile(dir + '/receipt.json', JSON.stringify(receipt, null, 2)); }
  });
}
