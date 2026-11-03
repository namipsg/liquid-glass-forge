import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fixturePng } from './source-server.mjs';
import { createHash } from 'node:crypto';

/** Serve built physical consumers, never workspace aliases. No CSP exceptions for scripts. */
export async function integrationServers(www, { reviewIndex = false, host = '127.0.0.1' } = {}) {
  const servers = [], png = fixturePng(), requests = [];
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost'); requests.push(url.pathname);
    if (url.pathname === '/' && reviewIndex) {
      const other = 'http://127.0.0.1:' + servers[1].address().port;
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }).end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Phase 10 access review</title><style>body{font:18px system-ui;margin:40px;max-width:840px;line-height:1.6}li{margin:16px}a:focus-visible{outline:3px solid Highlight}</style><h1>Glass and opaque access review</h1><p>The same two cards are rendered by four adapters. Each page starts with an optical glass pattern. Choose <strong>Readable opaque</strong> to test solid contrast, then <strong>Show glass</strong> to compare.</p><p>Check visible keyboard focus, type in Name, activate Count, and navigate with VoiceOver. Native controls and Color tile should be announced; decorative canvases should be omitted. On macOS Safari/WebKit, Option-Tab follows all controls when ordinary Tab follows text inputs.</p><ul>${['vanilla','react','vue','angular'].map(name => `<li><a href="/${name}/?review=1&other=${encodeURIComponent(other)}">${name}</a></li>`).join('')}</ul><p>Optical pixels use an explicit pattern, not a capture of this page. Opaque mode is the required readable baseline over the adverse checkerboard. These fixtures test access and lifecycle behavior; broader device and performance qualification remains Phase 11.</p></html>`);
      return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (url.pathname === '/fixture.png') { res.writeHead(200, { 'Content-Type': 'image/png' }).end(png); return; }
    if (url.pathname === '/broken.png') { res.writeHead(200, { 'Content-Type': 'image/png' }).end('intentionally invalid image'); return; }
    if (url.pathname === '/hang.png') { req.on('close', () => res.destroy()); return; }
    if (url.pathname === '/worker/crash.js' || url.pathname === '/worker/silent.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(url.pathname.includes('crash')
        ? "throw Error('Intentional Phase 10 worker crash');" : 'self.onmessage=()=>{};'); return;
    }
    const relative = decodeURIComponent(url.pathname).slice(1);
    if (relative.split('/').some(p => p === '..') || relative.includes('\\')) { res.writeHead(404).end(); return; }
    const file = path.join(www, relative.endsWith('/') ? relative + 'index.html' : relative);
    try {
      const bytes = await readFile(file), html = file.endsWith('.html');
      const other = 'http://127.0.0.1:' + servers[1].address().port;
      const headers = { 'Content-Type': html ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream', 'Cache-Control': 'no-store' };
      const importMap = /<script type="importmap">([^<]+)<\/script>/.exec(bytes.toString());
      const mapHash = importMap ? " 'sha256-" + createHash('sha256').update(importMap[1]).digest('base64') + "'" : '';
      if (html) headers['Content-Security-Policy'] = `default-src 'none'; script-src 'self'${mapHash}; style-src 'self' 'unsafe-inline'; worker-src ${url.searchParams.has('deny-worker') ? "'none'" : "'self'"}; img-src 'self' ${other}; connect-src 'self'; font-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'self'; frame-ancestors ${url.searchParams.has('qualification') ? "'self'" : "'none'"}`;
      res.writeHead(200, headers).end(bytes);
    } catch { res.writeHead(404).end(); }
  };
  for (let i = 0; i < 2; i++) {
    const server = createServer((req, res) => { void handler(req, res).catch(() => res.destroy()); });
    servers.push(server); await new Promise(resolve => server.listen(0, host, resolve));
  }
  return { origin: 'http://127.0.0.1:' + servers[0].address().port, other: 'http://127.0.0.1:' + servers[1].address().port, requests,
    async close() { await Promise.all(servers.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }))); } };
}
