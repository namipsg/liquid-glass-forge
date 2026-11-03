import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--candidate')) throw Error('An exact --candidate receipt is required');
const candidate = JSON.parse(await readFile(value('--candidate')));
const plan = JSON.parse(await readFile('docs/qualification-plan.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const review = args.includes('--review') ? JSON.parse(await readFile(value('--review'))) : { images: [] };
const rows = [];
for (const environment of plan.requiredEnvironments) {
  const receipts = [];
  for (const entry of await readdir('private/phase-11/devices', { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join('private/phase-11/devices', entry.name, 'receipt.json');
    let receipt;
    try { receipt = JSON.parse(await readFile(file)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (receipt.environment === environment.id && !receipt.diagnostic) receipts.push({ file, receipt });
  }
  receipts.sort((a, b) => (b.receipt.endedAt ?? '').localeCompare(a.receipt.endedAt ?? ''));
  const latest = receipts[0];
  for (const adapter of plan.requiredAdapters) for (const backend of plan.requiredBackends) {
    const row = { environment: environment.id, adapter, backend, status: 'held', reasons: [] };
    if (!latest) row.reasons.push('No physical capture receipt');
    else {
      row.receipt = latest.file;
      row.image = path.join(path.dirname(latest.file), adapter + '-' + backend + '.png');
      if (!latest.receipt.checks?.some(c => c.adapter === adapter && c.backend === backend && c.pass)) row.reasons.push('Physical controls/lifecycle capture missing');
      if (candidate.artifacts.length !== latest.receipt.artifacts?.length || candidate.artifacts.some(a => !latest.receipt.artifacts.some(b => a.name === b.name && a.sha256 === b.sha256))) row.reasons.push('Candidate artifact mismatch');
      try {
        row.sha256 = sha(await readFile(row.image));
        const decision = review.images?.find(r => r.image === row.image && r.sha256 === row.sha256);
        if (!decision || decision.result !== 'accepted' || !decision.reviewer || !decision.observation) row.reasons.push('Exact environment-specific image has no recorded visual review');
        else row.review = decision;
      } catch (error) { if (error.code === 'ENOENT') row.reasons.push('Screenshot missing'); else throw error; }
    }
    if (!row.reasons.length) row.status = 'reviewed-capture';
    rows.push(row);
  }
}
const result = { schemaVersion: 1, status: rows.every(r => r.status === 'reviewed-capture') ? 'reviewed-captures' : 'hold',
  scope: 'Environment-specific captured optical output and native control layout. Numerical conformance, timing, accessibility and sustained qualification remain separate gates. No cross-engine pixel baseline substitution.', rows };
const output = args.includes('--output') ? value('--output') : 'private/phase-11/visual-status.json';
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, status: result.status, reviewed: rows.filter(r => r.status === 'reviewed-capture').length, required: rows.length }));
if (result.status === 'hold' && !args.includes('--allow-held')) process.exitCode = 1;
