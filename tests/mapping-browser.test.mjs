import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from '@playwright/test';
import { sourceServers } from './source-server.mjs';
import { screenshotPixels } from './png-pixels.mjs';
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  test(`${name}: mapped pixels agree with native object-fit across scroll, resize, DPR and transforms`, { timeout: 60000 }, async () => {
    const servers = await sourceServers(); let browser;
    const receipt = { browser: name, cases: [] };
    const base = new URL('../private/phase-3/mapping/', import.meta.url); await mkdir(base, { recursive: true });
    const dir = await mkdtemp(new URL(`run-${name}-`, base));
    try {
      browser = await type.launch(); receipt.version = browser.version();
      const page = await browser.newPage({ viewport: { width: 700, height: 600 }, deviceScaleFactor: 2 });
      await page.goto(servers.origin);
      await page.evaluate(async () => {
        document.body.style.cssText = 'margin:0;height:2400px;background:white';
        const holder = document.createElement('div'); holder.id = 'holder'; holder.style.cssText = 'position:absolute;left:80px;top:900px;width:240px;height:240px';
        const img = document.createElement('img'); img.id = 'source'; img.style.cssText = 'display:block;width:160px;height:160px;image-rendering:pixelated;transform-origin:0 0';
        const c = document.createElement('canvas'); c.width = 4; c.height = 2;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray([
          255,0,0,255, 255,0,0,255, 0,255,0,255, 0,255,0,255,
          0,0,255,255, 0,0,255,255, 255,255,255,255, 255,255,255,255]), 4, 2), 0, 0);
        img.src = c.toDataURL(); holder.append(img); document.body.append(holder); await img.decode();
      });
      for (const config of [
        { fit: 'fill', scroll: 700, size: 160 }, { fit: 'contain', scroll: 750, size: 200 },
        { fit: 'cover', scroll: 800, size: 160 }, { fit: 'cover', scroll: 760, size: 200, right: true },
        { fit: 'contain', scroll: 730, size: 160, scaled: true },
        { fit: 'fill', scroll: 720, size: 160, clipped: true }
      ]) {
        const result = await page.evaluate(async config => {
          const { mapSourceRegion } = await import('/mapping.js');
          const image = document.querySelector('#source'), holder = document.querySelector('#holder');
          image.style.width = `${config.size}px`; image.style.height = `${config.size}px`;
          image.style.objectFit = config.fit; image.style.objectPosition = config.right ? '100% 50%' : '50% 50%';
          image.style.transform = config.scaled ? 'matrix(1.5, 0, 0, 1.25, 12, 18)' : 'none';
          scrollTo(0, config.scroll); await new Promise(requestAnimationFrame);
          const r = image.getBoundingClientRect(), h = holder.getBoundingClientRect();
          const target = { x: r.x + r.width * 0.25 - 8, y: r.y + r.height * 0.375 - 8, width: 16, height: 16 };
          const clip = config.clipped ? { x: target.x + 8, y: target.y, width: 8, height: 16 } : undefined;
          const input = { source: { width: 4, height: 2 }, box: { x: h.x, y: h.y, width: config.size, height: config.size },
            target, fit: config.fit, position: { x: config.right ? 1 : 0.5, y: 0.5 }, padding: 1, dpr: devicePixelRatio,
            ...(clip ? { clip } : {}), ...(config.scaled ? { transform: { a: 1.5, b: 0, c: 0, d: 1.25, e: 12, f: 18 } } : {}) };
          const m = mapSourceRegion(input); if (!m.ok) throw new Error(JSON.stringify(m));
          const out = document.createElement('canvas'); out.width = m.backing.width; out.height = m.backing.height;
          const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false;
          // Use the unpadded sample and backing offset, preserving transparent clipped output.
          ctx.drawImage(image, m.sample.x, m.sample.y, m.sample.width, m.sample.height, m.output.x, m.output.y, m.output.width, m.output.height);
          const x = Math.floor(m.output.x + m.output.width/2), y = Math.floor(m.output.y + m.output.height/2);
          const pixel = [...ctx.getImageData(x, y, 1, 1).data];
          const point = { x: Math.floor((target.x + (x + 0.5)/m.backing.width * target.width) * devicePixelRatio),
            y: Math.floor((target.y + (y + 0.5)/m.backing.height * target.height) * devicePixelRatio) };
          if (config.clipped && ctx.getImageData(0,0,1,1).data[3] !== 0) throw new Error('clip output must stay transparent');
          return { pixel, point, backing: m.backing, sample: m.sample };
        }, config);
        const png = await page.screenshot(); const native = screenshotPixels(png).pixel(result.point.x, result.point.y);
        await writeFile(`${dir}/${receipt.cases.length}.png`, png);
        assert.deepEqual(result.pixel, config.right ? [0,255,0,255] : [255,0,0,255], 'independent color oracle');
        assert.deepEqual(result.pixel, native, `native CSS vs mapped canvas: ${JSON.stringify(config)}`);
        assert.deepEqual(result.backing, { width: 32, height: 32 }); receipt.cases.push({ config, ...result, native });
      }
      receipt.status = 'passed';
    } catch (e) { receipt.status = 'failed'; receipt.error = e.stack; throw e; }
    finally { await browser?.close(); await servers.close(); await writeFile(`${dir}/receipt.json`, JSON.stringify(receipt,null,2)); }
  });
}
