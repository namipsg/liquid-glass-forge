import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from '@playwright/test';
import { sourceServers } from './source-server.mjs';
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: real canvas/video revisions, lifecycle, fallback and source failures`, { timeout: 60000 }, async () => {
    const servers = await sourceServers(); let browser;
    const receipt = { browser: name, checks: [] };
    try {
      browser = await type.launch(); receipt.version = browser.version();
      const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(servers.origin);
      receipt.checks = await page.evaluate(async ({ other }) => {
        const { SourceProvider } = await import('/dom.js');
        const checks = [], sleep = ms => new Promise(r => setTimeout(r, ms));
        const assert = (x, text) => { if (!x) throw new Error(text); };
        const rejects = async (promise, code) => { try { await promise; } catch (e) { assert(e.code === code, `${e.code} expected ${code}`); return; } throw new Error(`Expected ${code}`); };
        const until = async fn => { const end = performance.now() + 5000; while (!fn()) { if (performance.now() > end) throw new Error('condition timed out'); await sleep(20); } };
        const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 1;
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray([230,20,40,255, 10,80,160,255]), 2, 1), 0, 0);
        const cp = new SourceProvider({ kind: 'canvas', value: canvas });
        const a = await cp.read(); assert(a.source.data[0] === 230 && a.source.data[6] === 160, 'canvas exact pixels');
        canvas.getContext('2d').clearRect(0, 0, 2, 1); cp.invalidate(); const b = await cp.read();
        assert(b.revision === 1 && b.source.data[3] === 0 && a.source.data[3] === 255, 'independent canvas snapshots');
        canvas.width = 3; assert((await cp.read()).source.width === 3 && cp.revision === 2, 'canvas resize revision');
        cp.destroy(); assert(canvas.width === 3, 'borrowed canvas preserved');
        if (typeof OffscreenCanvas === 'function') {
          const off = new OffscreenCanvas(1, 1); off.getContext('2d').fillStyle = '#00ff00'; off.getContext('2d').fillRect(0, 0, 1, 1);
          const p = new SourceProvider({ kind: 'canvas', value: off }); assert((await p.read()).source.data[1] === 255, 'offscreen pixels'); p.destroy();
        }
        const image = new Image(); image.src = `${other}/nocors.png`; await image.decode();
        const taint = document.createElement('canvas'); taint.width = 2; taint.height = 2; taint.getContext('2d').drawImage(image, 0, 0);
        const tp = new SourceProvider({ kind: 'canvas', value: taint }); await rejects(tp.read(), 'UNREADABLE_SOURCE'); tp.destroy();
        checks.push('canvas exact pixels, snapshots, invalidation/resize, offscreen capability and taint');
        const unavailable = new SourceProvider({ kind: 'video', value: document.createElement('video') });
        await rejects(unavailable.read(), 'UNAVAILABLE_SOURCE'); unavailable.destroy();
        const load = async (url, cors = 'anonymous') => {
          const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
          if (cors !== 'none') v.crossOrigin = cors;
          document.body.append(v); v.src = url; v.load(); await until(() => v.readyState >= 2 || v.error);
          assert(!v.error, `video decode ${url}: ${v.error?.message}`); return v;
        };
        const red = data => assert(data[0] > data[1] + 100 && data[0] > data[2] + 100 && data[3] === 255, `red frame ${[...data.slice(0,4)]}`);
        const blue = data => assert(data[2] > data[0] + 100 && data[2] > data[1] + 100, `blue frame ${[...data.slice(0,4)]}`);
        const native = v => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const ctx = c.getContext('2d', { colorSpace: 'srgb' }); ctx.drawImage(v, 0, 0); return ctx.getImageData(0, 0, c.width, c.height, { colorSpace: 'srgb' }).data; };
        const videoPixels = async (p, v) => { const data = (await p.read()).source.data; assert(JSON.stringify([...data]) === JSON.stringify([...native(v)]), 'provider video bytes match direct native readback exactly'); return data; };
        const cleanup = v => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); };
        for (const url of ['/fixture.mp4', `${other}/cors.mp4`]) {
          const v = await load(url), p = new SourceProvider({ kind: 'video', value: v });
          red(await videoPixels(p, v));
          v.currentTime = 1.3; await until(() => !v.seeking && v.readyState >= 2);
          blue(await videoPixels(p, v)); assert(p.revision > 0, 'seek revision detected without subscription');
          p.destroy(); assert(v.currentSrc.includes('mp4'), 'borrowed video retained'); cleanup(v);
        }
        checks.push('actual local/CORS-approved red and blue decoded frames and unobserved seek');
        const denied = await load(`${other}/nocors.mp4`, 'none');
        const dp = new SourceProvider({ kind: 'video', value: denied }); await rejects(dp.read(), 'UNREADABLE_SOURCE'); dp.destroy(); cleanup(denied);
        const broken = await load('/fixture.mp4'); broken.src = '/broken.png'; broken.load();
        const bp = new SourceProvider({ kind: 'video', value: broken }); await rejects(bp.read(), 'UNAVAILABLE_SOURCE'); bp.destroy(); cleanup(broken);
        checks.push('unavailable, decode-unavailable and cross-origin video remain typed failures');
        for (const fallback of [false, true]) {
          const v = await load('/fixture.mp4');
          if (fallback) Object.defineProperty(v, 'requestVideoFrameCallback', { value: undefined, configurable: true });
          const p = new SourceProvider({ kind: 'video', value: v }); let changes = 0;
          const off = p.subscribe(() => changes++); await v.play(); await until(() => changes > 2);
          p.pause(); const count = changes; await sleep(150); assert(changes === count && !v.paused, 'provider pause cancels own clock only');
          await rejects(p.read(), 'PAUSED'); p.resume(); await until(() => changes > count + 1);
          const old = p.generation, nextSrc = `${other}/wide.mp4`; v.src = nextSrc; v.load(); await until(() => (v.currentSrc === nextSrc && v.readyState >= 2 && v.videoWidth === 32) || v.error);
          assert(!v.error, 'replacement decoded'); red(await videoPixels(p, v)); assert(p.generation > old && (await p.read()).source.width === 32, 'source identity/resize invalidates generation and dimensions');
          off(); const stopped = changes; await v.play(); await sleep(150); assert(changes === stopped, 'unsubscribe stops notifications');
          p.destroy(); assert(!v.paused, 'destroy does not pause borrowed video'); cleanup(v);
        }
        checks.push('native/event-timer video scheduling, media replacement and pause/resume/unsubscribe/disposal');
        return checks;
      }, { other: servers.other });
      assert.equal(receipt.checks.length, 4); assert.deepEqual(errors, []); receipt.status = 'passed';
    } catch (e) { receipt.status = 'failed'; receipt.error = e.stack; throw e; }
    finally {
      await browser?.close(); await servers.close();
      const base = new URL('../private/phase-3/dynamic/', import.meta.url); await mkdir(base, { recursive: true });
      const dir = await mkdtemp(new URL(`run-${name}-`, base)); await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt, null, 2));
    }
  });
}
