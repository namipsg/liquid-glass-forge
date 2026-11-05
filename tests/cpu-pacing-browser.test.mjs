import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium,firefox,webkit } from '@playwright/test';
import { cpuServer } from './cpu-worker-server.mjs';
for(const [name,engine]of Object.entries({chromium,firefox,webkit}))test(name+': fast CPU work reserves its presentation interval before execution',{timeout:30000},async()=>{
  const server=await cpuServer();let browser;
  try{
    browser=await engine.launch();const page=await browser.newPage();await page.goto(server.origin);
    const result=await page.evaluate(async()=>{
      const core=await import('/core/index.js'),cpu=await import('/cpu/index.js'),dom=await import('/dom/index.js');
      const source=core.createSource({contractVersion:1,width:1,height:1,revision:0,data:new Uint8Array([255,0,0,255]),ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'});
      const original=cpu.CpuExecutor.prototype.render,requests=[];
      cpu.CpuExecutor.prototype.render=function(source,frame,options){requests.push({deadline:options.notBefore,calledAt:performance.now()});return original.call(this,source,frame,options).then(batch=>({...batch,timings:{...batch.timings,roundTripMs:2}}));};
      const renderer=dom.createCpuRenderer({executor:{worker:'off'},surface:{radius:0,strength:0}}),controller=new AbortController(),cleanup=renderer.initialize(controller.signal);
      try{let previous;const outputs=[];for(let i=0;i<3;i++){const f=await renderer.render({snapshot:{source,generation:0,revision:0},width:8,height:8,dpr:1,rect:{x:0,y:0,width:8,height:8}},controller.signal);outputs.push({pixel:[...f.data.subarray(0,4)],returnedAt:performance.now()});f.release();}
        previous=outputs[1].returnedAt;return{outputs,reservedAfterReady:requests[2].deadline-previous};
      }finally{cleanup();renderer.dispose();cpu.CpuExecutor.prototype.render=original;}
    });
    assert.ok(result.reservedAfterReady>=1000/30-8,'fast work started too early and left pacing to the presentation path');
    assert.ok(result.outputs.every(f=>f.pixel.join(',')==='255,0,0,255'));
  }finally{await browser?.close();await server.close();}
});
