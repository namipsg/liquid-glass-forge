import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fixturePng } from './source-server.mjs';

export async function qualificationServer(www, { host = '127.0.0.1' } = {}) {
  const server = createServer((req,res) => { void (async () => {
    const url = new URL(req.url,'http://localhost'); let bytes;
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (url.pathname === '/fixture.png') { res.writeHead(200,{'Content-Type':'image/png'}).end(fixturePng()); return; }
    if (url.pathname === '/worker-spy.js') { res.writeHead(200,{'Content-Type':'text/javascript'}).end("import '/cpu/worker.js';let gpu=0;if(typeof OffscreenCanvas!=='undefined'){const native=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(type,...args){if(/webgl/i.test(type)){gpu++;throw Error('CPU requested WebGL')}return native.call(this,type,...args)}}const post=globalThis.postMessage.bind(globalThis);globalThis.postMessage=(m,t)=>post({...m,webglRequests:gpu},t);"); return; }
    const relative = decodeURIComponent(url.pathname).slice(1);
    if (relative.split('/').includes('..') || relative.includes('\\')) { res.writeHead(404).end(); return; }
    const file = path.join(www,relative.endsWith('/')?relative+'index.html':relative);
    try { bytes=await readFile(file); } catch { res.writeHead(404).end(); return; }
    const headers={'Cache-Control':'no-store','Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.js')?'text/javascript':'application/octet-stream'};
    if(file.endsWith('.html')) {
      const map=/<script type="importmap">([^<]+)<\/script>/.exec(bytes.toString());
      headers['Content-Security-Policy']="default-src 'none'; script-src 'self'"+(map?" 'sha256-"+createHash('sha256').update(map[1]).digest('base64')+"'":'')+"; style-src 'self' 'unsafe-inline'; img-src 'self'; worker-src 'self'; connect-src 'self'; base-uri 'self'; object-src 'none'";
    }
    res.writeHead(200,headers).end(bytes);
  })().catch(error=>{if(!res.headersSent)res.writeHead(500);res.end(String(error));}); });
  await new Promise(resolve=>server.listen(0,host,resolve));
  return {port:server.address().port,origin:'http://127.0.0.1:'+server.address().port,async close(){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}};
}
