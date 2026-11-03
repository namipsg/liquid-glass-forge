import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { configure, frame, resizeCheck, staleCheck } from './integration-checks.mjs';

/** Remove two actual fixes only in the installed temporary package. The same
 * positive-path detectors must then reject the resulting production bundles. */
export async function regressionMutations({ consumer, www, server, browser, command, check }) {
  const file = path.join(consumer, 'node_modules/@liquid-glass-forge/dom/dist/scene.js');
  const original = await readFile(file, 'utf8'), sha = text => createHash('sha256').update(text).digest('hex');
  const guard = 'frames.forEach((frame, i) => { const e = selected[i]; if (generation === this.#generation && revision === this.#revision && this.#active() && this.#visible(e))';
  const variants = [
    ['resize', "if (typeof view.ResizeObserver === 'function') {", 'if (false) {'],
    ['stale', guard, guard.replace('revision === this.#revision && ', '')],
  ];
  for (const [name, before, after] of variants) {
    assert.equal(original.split(before).length, 2, 'mutation must match exactly one current fix');
    const mutated = original.replace(before, after);
    const build = `import {build} from 'vite';import path from 'node:path';await build({root:path.resolve('entry/vanilla'),base:'/mutation-${name}/',build:{outDir:path.resolve('www/mutation-${name}'),emptyOutDir:true}});`;
    await writeFile(path.join(consumer, 'build-mutation.mjs'), build);
    try { await writeFile(file, mutated); await command(process.execPath, ['build-mutation.mjs'], 'mutation-' + name + '-build.txt'); }
    finally { await writeFile(file, original); }
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(server.origin + '/mutation-' + name + '/?other=' + encodeURIComponent(server.other));
      await page.waitForFunction(() => !!window.phase10);
      let detected;
      if (name === 'resize') {
        await configure(page, 'cpu'); await frame(page); await page.waitForTimeout(150);
        await assert.rejects(() => resizeCheck(page, 800), error => { detected = error.message; return error.name === 'TimeoutError'; });
        assert.equal(await page.evaluate(() => document.querySelector('.test-card').clientWidth), 320);
        assert.equal(await page.evaluate(() => document.querySelector('.test-card > canvas').width), 280);
      } else {
        await assert.rejects(() => staleCheck(page), error => { detected = error.message; return /superseded worker frames painted/.test(error.message); });
        assert.ok((await page.evaluate(() => window.stalePaints)).some(pixel => pixel[0] === 255));
      }
      assert.deepEqual(errors, []);
      await check('mutation/' + name + ' original fix removed and shared regression detector rejected it', { originalSha256: sha(original), mutatedSha256: sha(mutated), detected });
    } finally {
      await page.evaluate(async () => { if (!window.phase10) return; await window.phase10.unmount(); window.phase10.state.run.pending.splice(0).forEach(resolve => resolve()); await window.phase10.destroy(); }).catch(() => {});
      await page.close();
    }
  }
  assert.equal(await readFile(file, 'utf8'), original, 'installed package was not restored');
}
