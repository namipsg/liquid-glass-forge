import {createServer} from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';

const root=path.resolve('showcase/dist'),port=Number(process.env.PORT??4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.jpg':'image/jpeg','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8','.wav':'audio/wav'};
const server=createServer((req,res)=>{void(async()=>{
  const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname).slice(1)||'index.html';
  if(relative.split('/').includes('..')||relative.includes('\\')){res.writeHead(404).end();return;}
  try{const file=path.join(root,relative),info=await stat(file),headers={'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
    if(!info.isFile()){res.writeHead(404).end();return;}
    if(req.method==='HEAD'){res.writeHead(200,{...headers,'Content-Length':info.size}).end();return;}
    const range=req.headers.range;
    if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start,end;
      if(match&&(match[1]||match[2])){if(!match[1]){start=Math.max(0,info.size-Number(match[2]));end=info.size-1;}else{start=Number(match[1]);end=match[2]?Math.min(info.size-1,Number(match[2])):info.size-1;}}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start> end||start>=info.size){res.writeHead(416,{...headers,'Content-Range':'bytes */'+info.size}).end();return;}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});
      await pipeline(createReadStream(file,{start,end}),res);return;
    }
    res.writeHead(200,{...headers,'Content-Length':info.size});await pipeline(createReadStream(file),res);}
  catch{if(!res.headersSent&&!res.destroyed)res.writeHead(404).end('Not found');else res.destroy();}
})().catch(()=>res.writeHead(400).end());});
server.listen(port,'127.0.0.1',()=>console.log('Material Studio: http://127.0.0.1:'+server.address().port));
