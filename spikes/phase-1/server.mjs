import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// An explicit allowlist prevents the spike server exposing local research.
const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ...['cpu.mjs', 'webgl.mjs', 'scene.mjs'].map(name => [`/${name}`, [name, 'text/javascript; charset=utf-8']]),
  ['/fixture.svg', ['fixture.svg', 'image/svg+xml']],
]);

export function startServers(port = 4173) {
  if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('Invalid port');
  const handler = async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const entry = files.get(url.pathname);
    if (req.method !== 'GET' || !entry) { res.writeHead(404).end('Not found'); return; }
    try {
      const content = await readFile(resolve(root, entry[0]));
      const headers = { 'Content-Type': entry[1], 'Cache-Control': 'no-store' };
      if (url.pathname === '/fixture.svg' && url.searchParams.get('cors') === '1') headers['Access-Control-Allow-Origin'] = '*';
      res.writeHead(200, headers).end(content);
    } catch { res.writeHead(500).end('Fixture unavailable'); }
  };
  const servers = [createServer(handler), createServer(handler)];
  return new Promise((resolveStart, reject) => {
    let ready = 0;
    for (const [index, server] of servers.entries()) {
      server.on('error', error => { for (const item of servers) item.close(); reject(error); });
      server.listen(port + index, '127.0.0.1', () => {
        if (++ready === servers.length) resolveStart({ url: `http://127.0.0.1:${port}`, close: () => Promise.all(servers.map(item => new Promise(done => item.close(done)))) });
      });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServers(Number(process.env.PHASE1_PORT ?? 4173));
  console.log(`Phase 1 spike: ${running.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await running.close(); process.exit(0); });
}
