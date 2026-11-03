import { AngularNodeAppEngine,createNodeRequestHandler,isMainModule,writeResponseToNodeResponse } from '@angular/ssr/node';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const angularApp=new AngularNodeAppEngine();
const browser=join(import.meta.dirname,'../browser');
const handler=createNodeRequestHandler((req,res)=>{void(async()=>{
 const url=new URL(req.url??'/','http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 const relative=decodeURIComponent(url.pathname).slice(1);if(relative.includes('..')){res.writeHead(404).end();return;}
 if(/\.(js|css|map|svg|ico)$/.test(relative)){try{const bytes=await readFile(join(browser,relative));res.writeHead(200,{'Content-Type':relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':'application/octet-stream'}).end(bytes);return;}catch{res.writeHead(404).end();return;}}
 const response=await angularApp.handle(req);if(response)await writeResponseToNodeResponse(response,res);else res.writeHead(404).end();
 })().catch(error=>{console.error(error);if(!res.headersSent)res.writeHead(500);res.end('SSR error');});});
if(isMainModule(import.meta.url))createServer(handler).listen(Number(process.env['PORT']??4000),'127.0.0.1');
export const reqHandler=handler;
