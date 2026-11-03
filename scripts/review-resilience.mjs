import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { integrationServers } from '../tests/integration-server.mjs';

const receiptFile = process.argv[2];
if (!receiptFile) throw Error('Provide the exact integration receipt.json for the review candidate');
const receipt = JSON.parse(await readFile(receiptFile));
if (!receipt.reviewAssets) throw Error('Receipt has no built review assets');
const server = await integrationServers(path.resolve(receipt.reviewAssets), { reviewIndex: true });
console.log(JSON.stringify({ receipt: path.resolve(receiptFile), automatedPass: receipt.pass, index: server.origin + (existsSync(path.resolve(receipt.reviewAssets, 'candidate/index.html')) ? '/candidate/' : '/'),
  urls: Object.fromEntries(['vanilla', 'react', 'vue', 'angular'].map(adapter => [adapter,
    server.origin + '/' + adapter + '/?review=1&other=' + encodeURIComponent(server.other)])) }, null, 2));
let closing = false;
async function close() { if (!closing) { closing = true; await server.close(); process.exit(0); } }
process.on('SIGINT', () => { void close(); }); process.on('SIGTERM', () => { void close(); });
