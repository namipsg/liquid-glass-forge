import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function cpuServer({ root = fileURLToPath(new URL('../packages/', import.meta.url)) } = {}) {
  const server = createServer((req, res) => { void (async () => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' || url.pathname === '/blocked') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...(url.pathname === '/blocked' ? { 'Content-Security-Policy': "worker-src 'none'" } : {}) });
      res.end('<!doctype html><script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core/index.js","@liquid-glass-forge/cpu":"/cpu/index.js","@liquid-glass-forge/dom":"/dom/index.js"}}</script>'); return;
    }
    if (url.pathname === '/worker-spy.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`import '/cpu/worker.js';let gpu=0; if(typeof OffscreenCanvas!=='undefined'){const original=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(type,...args){if(/webgl/i.test(type)){gpu++;throw new Error('CPU requested WebGL');}return original.call(this,type,...args);};}const post=globalThis.postMessage.bind(globalThis);globalThis.postMessage=(m,t)=>post({...m,webglRequests:gpu},t);`); return;
    }
    const match = /^\/(core|cpu|dom)\/([a-z-]+\.(?:js|css))$/.exec(url.pathname);
    if (!match) { res.writeHead(404).end(); return; }
    try { const bytes = await readFile(`${root}/${match[1]}/dist/${match[2]}`); res.writeHead(200, { 'Content-Type': match[2].endsWith('.css') ? 'text/css' : 'text/javascript' }).end(bytes); }
    catch { res.writeHead(404).end(); }
  })().catch(() => res.destroy()); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } };
}
