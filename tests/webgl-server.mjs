import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { packageFiles } from '../scripts/pack-smoke.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function webglServer(dir) {
  await mkdir(dir,{recursive:true});const consumer=await mkdtemp(path.join(tmpdir(),'lgf-webgl-installed-'));const tarballs=[],artifacts=[];
  const run=(c,a,cwd=root)=>execFileSync(c,a,{cwd,encoding:'utf8',timeout:30000,maxBuffer:4*1024**2});
  let server;
  try{
    await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
    for(const name of ['core','cpu','dom','webgl']){
      const pack=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',path.resolve(dir)],path.join(root,'packages',name)))[0];const file=path.resolve(dir,pack.filename);tarballs.push(file);
      const files=run('tar',['-tzf',file]).trim().split('\n').map(f=>f.replace(/^package\//,'' )).sort();if(JSON.stringify(files)!==JSON.stringify(packageFiles[name]))throw new Error('Package inventory '+name);
      artifacts.push({name,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),files});
    }
    await writeFile(path.join(dir,'install.txt'),run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false','--save=false',...tarballs],consumer));
    if((await realpath(consumer)).startsWith(await realpath(root)))throw new Error('Consumer must be external');
    for(const a of artifacts){const packageRoot=path.join(consumer,'node_modules/@liquid-glass-forge',a.name);if((await lstat(packageRoot)).isSymbolicLink())throw new Error('Workspace alias');for(const f of a.files){const expected=run('tar',['-xOf',tarballs[artifacts.indexOf(a)],'package/'+f]);if(!(await readFile(path.join(packageRoot,f))).equals(Buffer.from(expected)))throw new Error('Installed byte mismatch');}}
    const modules=Object.fromEntries(await Promise.all(['packages/core/src/index.ts','packages/cpu/src/kernel.ts','packages/dom/src/scene.ts','packages/dom/src/host.ts','packages/webgl/src/index.ts','packages/webgl/src/atlas.ts','packages/webgl/src/shaders.ts','packages/webgl/src/effects.ts','packages/webgl/src/dom.ts','tests/webgl-fixtures.mjs','tests/webgl-server.mjs','tests/cpu-oracle.mjs','spikes/phase-1/fixture.svg','spikes/phase-1/index.html','tests/device-connection.mjs','scripts/bench-webgl.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')])));
    server=createServer((req,res)=>{void(async()=>{
      const u=new URL(req.url,'http://localhost');
      if(u.pathname==='/benchmark'){const html=await readFile(path.join(root,'spikes/phase-1/index.html'),'utf8');res.writeHead(200,{'Content-Type':'text/html'}).end(html.replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','</head>')+'<script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core/index.js","@liquid-glass-forge/cpu":"/cpu/index.js","@liquid-glass-forge/dom":"/dom/index.js"}}</script>');return;}
      if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Liquid Glass Forge Phase6 fixture</title><link rel="stylesheet" href="/dom/styles.css"><script type="importmap">{"imports":{"@liquid-glass-forge/core":"/core/index.js","@liquid-glass-forge/cpu":"/cpu/index.js","@liquid-glass-forge/dom":"/dom/index.js","@liquid-glass-forge/webgl":"/webgl/index.js","@liquid-glass-forge/webgl/dom":"/webgl/dom.js"}}</script>');return;}
      let file;if(u.pathname==='/fixture.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'}).end(await readFile(path.join(root,'spikes/phase-1/fixture.svg')));return;}
      if(u.pathname==='/fixtures.js')file=path.join(root,'tests/webgl-fixtures.mjs');else if(u.pathname==='/oracle.js')file=path.join(root,'tests/cpu-oracle.mjs');else{const m=/^\/(core|cpu|dom|webgl)\/([a-z-]+\.(js|css))$/.exec(u.pathname);if(m)file=path.join(consumer,'node_modules/@liquid-glass-forge',m[1],'dist',m[2]);}
      if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'text/javascript'}).end(await readFile(file));
    })().catch(e=>{res.writeHead(500).end(String(e));});});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    return {consumer,artifacts,sourceSha256:modules,origin:'http://127.0.0.1:'+server.address().port,port:server.address().port,async close(){await new Promise(r=>{server.close(r);server.closeAllConnections();});await rm(consumer,{recursive:true,force:true});}};
  }catch(e){if(server)await new Promise(r=>server.close(r));await rm(consumer,{recursive:true,force:true});throw e;}
}
