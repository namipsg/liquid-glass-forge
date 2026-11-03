import { createCpuRenderer } from '@liquid-glass-forge/dom';
export const stats={active:0,initialized:0,cleaned:0,subscriptions:0,released:0,initPending:[],renderPending:[],sourcePending:[],workerPending:[],workerCreated:0,workerTerminated:0,workerReleased:0,aborts:0};
export function monitored(mode){
  const cpu=createCpuRenderer({executor:mode==='worker'?{worker:'required',workerFactory(){stats.workerCreated++;const worker=new Worker(new URL('./cpu.worker.mjs',import.meta.url),{type:'module'}),terminate=worker.terminate.bind(worker);worker.terminate=()=>{stats.workerTerminated++;terminate();};return worker;}}:{worker:'off'},surface:{radius:0,strength:0}});
  return {
    initialize(signal){stats.active++;stats.initialized++;let done=false;const clean=()=>{if(done)return;done=true;stats.active--;stats.cleaned++;};signal.addEventListener('abort',()=>stats.aborts++,{once:true});
      if(mode==='init'){stats.lastInitSignal=signal;return new Promise(resolve=>stats.initPending.push(()=>resolve(clean)));}
      const end=cpu.initialize(signal);return()=>{end();clean();};
    },
    render(request,signal){if(mode==='held'){stats.lastRenderSignal=signal;return new Promise(resolve=>stats.renderPending.push(()=>resolve({width:request.width,height:request.height,data:new Uint8Array(request.width*request.height*4).fill(255),release(){stats.released++;}})));}if(mode==='worker')return cpu.render(request,signal).then(frame=>{stats.workerExecution=cpu.diagnostics.execution;stats.lastWorkerSignal=signal;return new Promise(resolve=>stats.workerPending.push(()=>resolve({...frame,release(){stats.workerReleased++;frame.release();}})));});return cpu.render(request,signal);}
  };
}
