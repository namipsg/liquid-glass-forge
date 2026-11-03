import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const entry = pathToFileURL(fileURLToPath(new URL('../packages/core/dist/index.js', import.meta.url))).href;
const domEntry = pathToFileURL(fileURLToPath(new URL('../packages/dom/dist/index.js', import.meta.url))).href;
const cpuEntry = pathToFileURL(fileURLToPath(new URL('../packages/cpu/dist/index.js', import.meta.url))).href;
const gpuEntry = pathToFileURL(fileURLToPath(new URL('../packages/webgl/dist/index.js', import.meta.url))).href;
const adapterEntry = pathToFileURL(fileURLToPath(new URL('../packages/webgl/dist/dom.js', import.meta.url))).href;
const reactEntry=pathToFileURL(fileURLToPath(new URL('../packages/react/dist/index.js',import.meta.url))).href;
const vueEntry=pathToFileURL(fileURLToPath(new URL('../packages/vue/dist/index.js',import.meta.url))).href;
const code = `
// React's development peer captures queueMicrotask at import; preload that external peer.
await import('react');await import('vue');
for (const name of ['window','document','navigator','Worker','OffscreenCanvas','requestAnimationFrame','queueMicrotask','ResizeObserver','IntersectionObserver','matchMedia','fetch','XMLHttpRequest','WebSocket','setTimeout','setInterval']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('Import touched ' + name); } });
}
const vueAdapter=await import(${JSON.stringify(vueEntry)});if(typeof vueAdapter.useGlassSurface!=='function')throw new Error('Missing Vue adapter');
const reactAdapter=await import(${JSON.stringify(reactEntry)});
if(typeof reactAdapter.useGlassSurface!=='function')throw new Error('Missing React adapter');
const dom = await import(${JSON.stringify(domEntry)});
if (typeof dom.createGlassScene !== 'function' || typeof dom.mountGlassHost !== 'function' || typeof dom.SourceProvider !== 'function') throw new Error('Missing source provider');
const core = await import(${JSON.stringify(entry)});
if (core.CONTRACT_VERSION !== 1) throw new Error('Missing public contract');
const cpu = await import(${JSON.stringify(cpuEntry)});
if (typeof cpu.renderCpu !== 'function') throw new Error('Missing CPU kernel');
const gpu=await import(${JSON.stringify(gpuEntry)}), optical=await import(${JSON.stringify(adapterEntry)});
new gpu.WebGLAtlas().dispose();optical.createWebGLRenderer().dispose();optical.createOpticalRenderer({backend:'auto',fallback:'cpu'}).dispose();
const adapter=dom.createCpuRenderer({executor:{worker:'off'}});adapter.dispose();
`;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 15000 });
if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
console.log('SSR import passed with browser, network and timer access traps.');
