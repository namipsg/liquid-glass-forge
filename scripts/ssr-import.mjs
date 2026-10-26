import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const entry = pathToFileURL(fileURLToPath(new URL('../packages/core/dist/index.js', import.meta.url))).href;
const code = `
for (const name of ['window','document','navigator','Worker','OffscreenCanvas','requestAnimationFrame','fetch','XMLHttpRequest','WebSocket','setTimeout','setInterval']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('Import touched ' + name); } });
}
const core = await import(${JSON.stringify(entry)});
if (core.CONTRACT_VERSION !== 1) throw new Error('Missing public contract');
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 15000 });
if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
console.log('SSR import passed with browser, network and timer access traps.');
