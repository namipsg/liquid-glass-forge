import { createCpuRenderer, SourceProvider } from '@liquid-glass-forge/dom';
import type { GlassRenderer, FrameOutput, RenderRequest } from '@liquid-glass-forge/dom';
export const stats = { active: 0, initialized: 0, cleaned: 0, subscriptions: 0, renders: 0, completed: 0, released: 0, angularRenders: 0, initPending: [] as Array<()=>void>, renderPending: [] as Array<()=>void>, lastInitSignal: undefined as AbortSignal|undefined, lastRenderSignal: undefined as AbortSignal|undefined };
export function sourceProvider() {
 const source=new SourceProvider({kind:'pixels',width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])}),subscribe=source.subscribe.bind(source);
 source.subscribe=listener=>{stats.subscriptions++;const off=subscribe(listener);let done=false;return()=>{if(!done){done=true;stats.subscriptions--;off();}};};return source;
}
export function renderer(mode:string):GlassRenderer {
 const cpu=createCpuRenderer({executor:{worker:'off'},surface:{radius:0,strength:0}});
 return {
  initialize(signal:AbortSignal){if(typeof window==='undefined')throw Error('Renderer initialized during SSR');stats.initialized++;stats.active++;let done=false;const clean=()=>{if(done)return;done=true;stats.active--;stats.cleaned++;};
   if(mode==='init'){stats.lastInitSignal=signal;return new Promise<()=>void>(resolve=>stats.initPending.push(()=>resolve(clean)));}
   const end=cpu.initialize(signal);return()=>{end();clean();};
  },
  render(request:RenderRequest,signal:AbortSignal):FrameOutput|Promise<FrameOutput>{stats.renders++;if(mode==='held'){stats.lastRenderSignal=signal;return new Promise(resolve=>stats.renderPending.push(()=>resolve({width:request.width,height:request.height,data:new Uint8Array(request.width*request.height*4).fill(255),release(){stats.released++;}})));}return cpu.render(request,signal).then(frame=>{stats.completed++;return frame;});}
 };
}
