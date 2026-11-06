import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const base = '/liquid-glass-forge/';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (process.env.GITHUB_SHA) assert.equal(commit, process.env.GITHUB_SHA);
const report = { commit, base, pass: false, failedRequests: [], pageErrors: [] };
const output = 'private/showcase/pages-smoke.json';
let server, browser;
try {
  const ledger = await readFile('docs/SUPPORT.json');
  const support = JSON.parse(await readFile('showcase/dist/support/overview.json'));
  const release = JSON.parse(await readFile('showcase/dist/release.json'));
  assert.equal(release.publicShowcase, true);
  assert.equal(support.version, release.version);
  assert.equal(support.installVersion, release.installVersion);
  assert.equal(release.installable, Boolean(release.installVersion));
  for (const framework of support.frameworks) assert.equal(framework.version, release.installVersion);
  assert.deepEqual(await readFile('showcase/dist/support/qualification.json'), ledger);
  assert.equal(support.qualificationStatus, JSON.parse(ledger).status);
  assert.equal(support.betaFrozen, JSON.parse(ledger).betaFrozen);

  const film = JSON.parse(await readFile('showcase/dist/media/sprite-fright.json'));
  assert.equal(film.license, 'https://creativecommons.org/licenses/by/1.0/');
  for (const [name, sha256] of Object.entries(film.files)) {
    assert.equal(createHash('sha256').update(await readFile('showcase/dist/media/' + name)).digest('hex'), sha256, name);
  }

  server = await preview({ root: 'showcase', base, preview: { host: '127.0.0.1', port: 0 } });
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch();
  report.browser = browser.version();
  const page = await browser.newPage({ reducedMotion: 'reduce', forcedColors: 'active', viewport: { width: 390, height: 840 } });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === origin && (response.status() >= 400 || !new URL(response.url()).pathname.startsWith(base))) {
      report.failedRequests.push({ status: response.status(), url: response.url() });
    }
  });

  assert.equal((await page.goto(origin + base + '#playground')).status(), 200);
  const lens = page.getByRole('button', { name: /^Move glass lens/ });
  const play = page.locator('#play-light');
  await lens.waitFor();
  assert.equal(await play.isDisabled(), true);
  await page.locator('#engine-status').getByText(/opaque/i).waitFor();
  await lens.focus();
  const position = (await lens.boundingBox()).x;
  await lens.press('ArrowRight');
  await page.waitForFunction(previous => document.querySelector('#drag-handle').getBoundingClientRect().x > previous, position);
  const tab = page.getByRole('tab', { name: 'Vanilla' });
  await tab.focus();
  await tab.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'React' }).getAttribute('aria-selected'), 'true');
  if (release.installable) {
    assert.match(await page.locator('#install-command').textContent(), new RegExp('@' + release.installVersion.replaceAll('.', '\\.') + '(?: |$)'));
  }

  assert.equal((await page.goto(origin + base + 'support.html')).status(), 200);
  await page.waitForFunction(() => window.lgfSupport);
  const packageLinks = page.locator('#support-frameworks a[href^="https://www.npmjs.com/"]');
  assert.equal(await packageLinks.count(), release.installable ? 4 : 0);
  for (const link of await packageLinks.all()) assert.ok((await link.getAttribute('href')).endsWith('/v/' + release.installVersion));
  assert.equal((await page.goto(origin + base + 'examples.html?example=video')).status(), 200);
  const credits = page.getByRole('link', { name: 'CC BY 1.0 and credits' });
  await credits.waitFor();
  assert.equal(await credits.getAttribute('href'), film.credits);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.pageErrors, []);
  report.release = release;
  report.qualificationStatus = support.qualificationStatus;
  report.pass = true;
} catch (error) {
  report.error = error.stack;
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  await mkdir('private/showcase', { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(output);
}
