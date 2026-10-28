import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from '@playwright/test';
import { sourceServers } from './source-server.mjs';

for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: source pixels, decoding, CORS and cancellation`, { timeout: 60000 }, async () => {
    const servers = await sourceServers(); let browser;
    const receipt = { browser: name, startedAt: new Date().toISOString(), checks: [] };
    try {
      browser = await type.launch(); const page = await browser.newPage();
      await page.goto(servers.origin);
      receipt.checks = await page.evaluate(async ({ other }) => {
        const { SourceProvider } = await import('/dom.js');
        const checks = [];
        const equal = (a, b, message) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${message}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
        const rejects = async (promise, code) => { try { await promise; } catch (e) { equal(e.code, code, 'error code'); return; } throw new Error(`Expected ${code}`); };
        const expected = [255,0,0,255, 0,255,0,255, 0,0,255,255, 0,0,0,0];
        for (const url of ['/fixture.png', `${other}/cors.png`]) {
          const p = new SourceProvider({ kind: 'image', url });
          equal(Array.from((await p.read()).source.data), expected, 'decoded pixels'); p.destroy();
        }
        checks.push('same-origin and CORS-approved decode exact pixels');
        for (const [url, mode, code] of [['/broken.png','anonymous','DECODE_FAILED'], [`${other}/nocors.png`,'anonymous','DECODE_FAILED'], [`${other}/nocors.png`,'none','UNREADABLE_SOURCE']]) {
          const p = new SourceProvider({ kind: 'image', url, crossOrigin: mode }); await rejects(p.read(), code); p.destroy();
        }
        checks.push('decode/CORS denial and tainted canvas remain typed failures');
        const image = new ImageData(new Uint8ClampedArray(expected), 2, 2);
        const pixels = new SourceProvider({ kind: 'image-data', value: image });
        const pending = pixels.read(); image.data[0] = 12;
        equal(Array.from((await pending).source.data), expected, 'ImageData copied before async work'); pixels.destroy();
        equal(image.data.byteLength, 16, 'ImageData remains attached');
        const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(expected), 2, 2));
        const bitmapSource = new SourceProvider({ kind: 'bitmap', value: bitmap });
        equal(Array.from((await bitmapSource.read()).source.data), expected, 'bitmap pixels');
        bitmapSource.replace({ kind: 'pixels', width: 1, height: 1, data: new Uint8Array(4) }); bitmapSource.destroy();
        equal(bitmap.width, 2, 'borrowed bitmap remains open'); bitmap.close();
        checks.push('ImageData and borrowed bitmap ownership');
        for (const action of ['abort','replace','destroy','pause','timeout']) {
          const p = new SourceProvider({ kind: 'image', url: '/hang.png' }, { timeoutMs: 80 });
          const controller = new AbortController(); const pendingRead = p.read({ signal: controller.signal });
          const code = { abort:'ABORTED', replace:'SUPERSEDED', destroy:'DESTROYED', pause:'PAUSED', timeout:'TIMEOUT' }[action];
          const settled = rejects(pendingRead, code);
          if (action === 'abort') controller.abort();
          if (action === 'replace') p.replace({ kind: 'image', url: '/fixture.png' });
          if (action === 'destroy') p.destroy();
          if (action === 'pause') p.pause();
          await settled;
          if (action === 'replace') equal(Array.from((await p.read()).source.data), expected, 'new generation');
          p.destroy(); p.destroy();
        }
        checks.push('abort/replacement/destroy/pause/timeout settle without stale delivery');
        return checks;
      }, { other: servers.other });
      assert.equal(receipt.checks.length, 4); receipt.status = 'passed';
    } catch (error) { receipt.status = 'failed'; receipt.error = error.message; throw error; }
    finally {
      await browser?.close(); await servers.close();
      const base = new URL('../private/phase-3/browser/', import.meta.url); await mkdir(base, { recursive: true });
      const dir = await mkdtemp(new URL(`run-${name}-`, base));
      await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2));
    }
  });
}
