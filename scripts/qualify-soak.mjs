import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { integrationServers } from '../tests/integration-server.mjs';

const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--candidate')) throw Error('An exact --candidate receipt is required');
const candidatePath = path.resolve(value('--candidate')), candidate = JSON.parse(await readFile(candidatePath));
if (!candidate.prepared) throw Error('A qualification candidate built from physical tarballs is required');
const planBytes = await readFile('docs/qualification-plan.json'), plan = JSON.parse(planBytes), smoke = args.includes('--smoke'), backend = args.includes('--backend') ? value('--backend') : 'worker';
if (!plan.requiredBackends.includes(backend)) throw Error('Exact forced backend required');
const durationMs = smoke ? 12000 : plan.soakMinimumMs;
await mkdir('private/phase-11/soak', { recursive: true }); const dir = await mkdtemp(path.resolve('private/phase-11/soak/run-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), sourceSha256 = {};
for (const file of ['scripts/qualify-soak.mjs','tests/qualification-controller.mjs','tests/integration-server.mjs','docs/qualification-plan.json',...Object.keys(candidate.sourceSha256)]) sourceSha256[file] = sha(await readFile(file));
const receipt = { startedAt: new Date().toISOString(), candidate: candidatePath, artifacts: candidate.artifacts, sourceSha256, planSha256: sha(planBytes),
  environment: 'installed headed Google Chrome on local Mac; hardware identity must be matched separately', backend, diagnostic: smoke,
  requiredDurationMs: plan.soakMinimumMs, requestedDurationMs: durationMs, cycles: [], samples: [], summary: {}, errors: [], completed: false, pass: false };
const server = await integrationServers(path.resolve(candidate.reviewAssets)); let browser, page;
const gzip = createGzip(), output = createWriteStream(path.join(dir, 'frames.ndjson.gz')); gzip.pipe(output);
const vectors = new Map(plan.requiredAdapters.map(name => [name, { age: [], interval: [], maxBytes: 0, frames: 0 }]));
const startClock = process.hrtime.bigint();
try {
  browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=0,0','--window-size=1000,760'] });
  const context = await browser.newContext({ viewport: null }); page = await context.newPage(); page.on('pageerror', error => receipt.errors.push(error.message));
  await page.goto(server.origin + '/soak.html'); await page.waitForFunction(() => !!window.phase11);
  receipt.browserVersion = browser.version(); receipt.screen = await page.evaluate(() => ({ availWidth: screen.availWidth, availHeight: screen.availHeight, outerWidth, outerHeight, innerWidth, innerHeight, dpr: devicePixelRatio, userAgent: navigator.userAgent }));
  const cycleCount = smoke ? 2 : plan.lifecycleCycles;
  receipt.cycles.push(await page.evaluate(({backend,count}) => window.phase11.cycles(backend,count), { backend, count: cycleCount }));
  await page.screenshot({ path: path.join(dir, 'before.png') });
  await page.evaluate(({backend,duration}) => window.phase11.start(backend,duration), { backend, duration: durationMs });
  const soakClock = process.hrtime.bigint();
  while (true) {
    const snapshot = await page.evaluate(() => window.phase11.drain());
    receipt.elapsedMs = snapshot.elapsedMs; receipt.hostElapsedMs = Number(process.hrtime.bigint() - soakClock) / 1e6;
    if (snapshot.visibility !== 'visible' || snapshot.adapters.some(a => a.visibility !== 'visible')) throw Error('Soak became hidden; operating conditions invalidated');
    if (snapshot.errors.length) throw Error(JSON.stringify(snapshot.errors));
    for (const adapter of snapshot.adapters) {
      if (adapter.errors.length || adapter.active !== 1 || adapter.subscriptions !== 1) throw Error('Soak lifecycle imbalance: ' + adapter.adapter);
      const v = vectors.get(adapter.adapter);
      for (const frame of adapter.frames) {
        if (frame.effectiveBackend !== (backend === 'webgl' ? 'webgl' : 'cpu') || (backend === 'worker' && frame.execution !== 'worker')) throw Error('Forced backend changed');
        v.frames++; if (frame.sequence >= plan.soakWarmupFrames) { v.age.push(frame.ageMs); if (frame.intervalMs !== null) v.interval.push(frame.intervalMs); }
        const e = frame.executor;
        // pooledBytes already includes inputPooledBytes. Keep the original
        // conservative CPU image reservation as a lower floor, without counting
        // the same input pool twice. Browser/driver heap remains unmeasured.
        const reported = frame.outputBytes + 640*360*4*3 + (e ? e.mainCachedBytes + e.workerCachedBytes + e.fixedKernelReservationBytes + e.pooledBytes + e.leasedBytes + e.reservedBytes : 0);
        const canonicalCpu = 640*360*4*8 + 320*180*4*3 + (backend === 'worker' ? 24592 : 12296) + 270000;
        const known = backend === 'webgl' ? frame.gpuOwnedBytes + frame.outputBytes + 640*360*4*3 : Math.max(reported,canonicalCpu);
        v.maxBytes = Math.max(v.maxBytes, known);
        if (!gzip.write(JSON.stringify({ adapter: adapter.adapter, ...frame, knownImageBytes: known }) + '\n')) await once(gzip, 'drain');
      }
    }
    receipt.samples.push({ hostElapsedMs: receipt.hostElapsedMs, elapsedMs: snapshot.elapsedMs, adapters: snapshot.adapters.map(({frames,...a}) => a) });
    await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ elapsedMs: Math.round(snapshot.elapsedMs), requestedMs: durationMs, frames: Object.fromEntries([...vectors].map(([name,v]) => [name,v.frames])) }));
    if (snapshot.done) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  receipt.cleanup = await page.evaluate(() => window.phase11.close());
  if (receipt.cleanup.some(r => r.active || r.subscriptions || r.workers || r.leased)) throw Error('Soak retained owned resources');
  await page.screenshot({ path: path.join(dir, 'after.png') });
  const limit = backend === 'webgl' ? plan.webgl : plan.cpu, percentile = values => values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
  for (const [name,v] of vectors) receipt.summary[name] = { frames: v.frames, ageP95Ms: percentile(v.age), intervalP95Ms: percentile(v.interval), knownImageBytesMax: v.maxBytes,
    budgetPass: v.age.length > 0 && percentile(v.age) <= limit.ageMs && percentile(v.interval) <= limit.intervalMs && v.maxBytes <= limit.bytes };
  receipt.completed = true;
  receipt.pass = !smoke && receipt.elapsedMs >= plan.soakMinimumMs && receipt.hostElapsedMs >= plan.soakMinimumMs && receipt.cycles.every(c=>c.count>=plan.lifecycleCycles) && Object.values(receipt.summary).every(s=>s.budgetPass) && receipt.errors.length === 0;
} catch (error) { receipt.error = error.stack; await page?.screenshot({ path: path.join(dir,'failure.png') }).catch(()=>{}); }
finally {
  gzip.end(); await once(output, 'close'); await browser?.close(); await server.close();
  receipt.totalHostElapsedMs = Number(process.hrtime.bigint()-startClock)/1e6; receipt.endedAt = new Date().toISOString();
  await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)); console.log(JSON.stringify({dir,completed:receipt.completed,pass:receipt.pass,error:receipt.error}));
}
if (!receipt.completed || (!smoke && !receipt.pass)) process.exitCode = 1;
