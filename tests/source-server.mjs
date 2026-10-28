import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([size, body, crc]);
}
export function fixturePng() {
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  // Independent coordinate-color oracle: TL red, TR green, BL blue, BR transparent.
  const rows = Buffer.from([0,255,0,0,255, 0,255,0,255, 0,0,0,255,255, 0,0,0,0]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export async function sourceServers() {
  const png = fixturePng();
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/hang.png') return;
    if (url.pathname === '/broken.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end('broken'); return; }
    if (['/fixture.png','/cors.png','/nocors.png'].includes(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'image/png', ...(url.pathname === '/cors.png' ? { 'Access-Control-Allow-Origin': '*' } : {}) }); res.end(png); return;
    }
    if (['/fixture.mp4', '/cors.mp4', '/nocors.mp4', '/wide.mp4'].includes(url.pathname)) {
      const bytes = await readFile(new URL(url.pathname === '/wide.mp4' ? './fixtures/red-blue-wide.mp4' : './fixtures/red-blue.mp4', import.meta.url));
      const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
        ...(['/cors.mp4', '/wide.mp4'].includes(url.pathname) ? { 'Access-Control-Allow-Origin': '*' } : {}) };
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
      if (range) {
        const start = Number(range[1]), end = Math.min(bytes.length - 1, range[2] ? Number(range[2]) : bytes.length - 1);
        if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); res.end(); return; }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
        res.end(bytes.subarray(start, end + 1));
      } else { res.writeHead(200, { ...headers, 'Content-Length': bytes.length }); res.end(bytes); }
      return;
    }
    const files = new Map([
      ['/core.js', new URL('../packages/core/dist/index.js', import.meta.url)],
      ['/dom.js', new URL('../packages/dom/dist/index.js', import.meta.url)],
      ['/providers.js', new URL('../packages/dom/dist/providers.js', import.meta.url)],
      ['/mapping.js', new URL('../packages/dom/dist/mapping.js', import.meta.url)],
      ['/host.js', new URL('../packages/dom/dist/host.js', import.meta.url)],
      ['/scene.js', new URL('../packages/dom/dist/scene.js', import.meta.url)],
      ['/styles.css', new URL('../packages/dom/dist/styles.css', import.meta.url)]
    ]);
    if (files.has(url.pathname)) {
      try { res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' }); res.end(await readFile(files.get(url.pathname))); }
      catch { res.destroy(); } return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core.js"}}</script>'); return;
    }
    res.writeHead(404); res.end();
  };
  const servers = [createServer((...args) => { void handler(...args); }), createServer((...args) => { void handler(...args); })];
  for (const server of servers) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${servers[0].address().port}`, other: `http://127.0.0.1:${servers[1].address().port}`,
    async close() { await Promise.all(servers.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }))); } };
}
