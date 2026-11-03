import { MAX_PIXELS } from '@liquid-glass-forge/core';
import type { SurfaceInput, SourceRect } from '@liquid-glass-forge/core';
import { createCpuRenderer } from '@liquid-glass-forge/dom';
import type { GlassRenderer, RenderRequest, FrameOutput, CpuRendererOptions } from '@liquid-glass-forge/dom';
import { WebGLAtlas, WebGLError, type WebGLAtlasOptions, type WebGLTile } from './atlas.js';
import { effects, type WebGLEffects } from './effects.js';
export interface OpticalRendererOptions {
  readonly backend?: 'webgl'|'cpu'|'auto'; readonly fallback?: 'none'|'cpu'|'material';
  readonly atlas?: WebGLAtlasOptions; readonly cpu?: CpuRendererOptions;
  readonly effects?: WebGLEffects;
  readonly surface?: Readonly<{radius?:number;bevel?:number;strength?:number}> | ((request: RenderRequest)=>Readonly<{radius?:number;bevel?:number;strength?:number}>);
  readonly sourceRect?: SourceRect | ((request:RenderRequest)=>SourceRect);
  readonly quality?: Readonly<{maxWidth?:number;maxHeight?:number;maxPixels?:number}>;
}
function dataObject(value: unknown, keys: readonly string[], name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'then' in value || Reflect.ownKeys(value).some(k=>typeof k!=='string'||!keys.includes(k))) throw new WebGLError('INVALID_OPTIONS','Invalid '+name);
}
function surfaceData(value: unknown) {
  dataObject(value,['radius','bevel','strength'],'surface');
  for (const [k,v] of Object.entries(value)) if (v!==undefined && (typeof v!=='number'||!Number.isFinite(v)||v<(k==='bevel'?Number.MIN_VALUE:0)||v>1_000_000)) throw new WebGLError('INVALID_OPTIONS','Invalid surface '+k);
  return Object.freeze({...value}) as Readonly<{radius?:number;bevel?:number;strength?:number}>;
}
function rectData(value: unknown): SourceRect {
  dataObject(value,['x','y','width','height'],'sourceRect');
  for (const k of ['x','y','width','height']) {const v=value[k];if(typeof v!=='number'||!Number.isFinite(v)||v<(k==='x'||k==='y'?0:Number.MIN_VALUE)||v>MAX_PIXELS)throw new WebGLError('INVALID_OPTIONS','Invalid sourceRect '+k);}
  return Object.freeze({...value}) as unknown as SourceRect;
}
/** Optional DOM integration. Core pixel-frame callers and forced CPU retain their
 * old contract. Native scene batches present to prepared stable targets before
 * yielding; standalone canvas frames retain owned backing until release(). */
export class OpticalRenderer implements GlassRenderer {
  readonly #options: OpticalRendererOptions; readonly #backend: 'webgl'|'cpu'|'auto'; readonly #fallback: 'none'|'cpu'|'material';
  readonly #quality: {maxWidth:number;maxHeight:number;maxPixels:number};
  #atlas: WebGLAtlas | undefined; #cpu: ReturnType<typeof createCpuRenderer> | undefined;
  #cleanup: (()=>void) | undefined; #signal: AbortSignal | undefined; #disposed=false; #generation=0; #revision=0;
  #effective: 'webgl'|'cpu'|'material'='material'; #reason: string | undefined; #lastGPU: WebGLAtlas['diagnostics'] | undefined;
  #tiles=new Map<string,WebGLTile>(); #leased=new Set<HTMLCanvasElement>(); #pool:HTMLCanvasElement[]=[]; #leasedBytes=0;
  #mode:'scene'|'manual'|undefined; #size:Readonly<{requestedWidth:number;requestedHeight:number;width:number;height:number}>|undefined;
  constructor(options:OpticalRendererOptions={}) {
    if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).some(k=>typeof k!=='string'||!['backend','fallback','atlas','cpu','effects','surface','sourceRect','quality'].includes(k)))throw new WebGLError('INVALID_OPTIONS','Invalid optical renderer options');
    const backend=options.backend===undefined?'webgl':options.backend,fallback=options.fallback===undefined?'none':options.fallback;
    if(!['webgl','cpu','auto'].includes(backend)||!['none','cpu','material'].includes(fallback)||(backend==='auto'&&options.fallback===undefined)||(backend!=='auto'&&fallback!=='none'))throw new WebGLError('INVALID_OPTIONS','Auto policy requires explicit fallback; forced backends never downgrade');
    effects(options.effects);new WebGLAtlas(options.atlas);
    const quality=options.quality===undefined?{}:options.quality;dataObject(quality,['maxWidth','maxHeight','maxPixels'],'quality');
    const q={maxWidth:quality.maxWidth===undefined?2048:quality.maxWidth as number,maxHeight:quality.maxHeight===undefined?2048:quality.maxHeight as number,maxPixels:quality.maxPixels===undefined?MAX_PIXELS:quality.maxPixels as number};
    if(!Object.values(q).every(v=>Number.isSafeInteger(v)&&v>=1&&v<=MAX_PIXELS))throw new WebGLError('INVALID_OPTIONS','Invalid quality limits');
    // Use the existing data-only CPU validator, including exact fallback settings.
    if(options.cpu!==undefined){const validator=createCpuRenderer(options.cpu);validator.dispose();}
    const cpu=options.cpu===undefined?undefined:Object.freeze({...options.cpu,...(options.cpu.effects?{effects:Object.freeze({...options.cpu.effects,...(options.cpu.effects.tint?{tint:Object.freeze([...options.cpu.effects.tint]) as readonly[number,number,number,number]}:{}),...(options.cpu.effects.light?{light:Object.freeze([...options.cpu.effects.light]) as readonly[number,number]}:{})})}:{}),...(options.cpu.executor?{executor:Object.freeze({...options.cpu.executor})}:{}),...(options.cpu.quality?{quality:Object.freeze({...options.cpu.quality})}:{}),...(options.cpu.surface&&typeof options.cpu.surface!=='function'?{surface:surfaceData(options.cpu.surface)}:{}),...(options.cpu.sourceRect&&typeof options.cpu.sourceRect!=='function'?{sourceRect:rectData(options.cpu.sourceRect)}:{})});
    this.#options={...options,...(cpu?{cpu}:{}),...(options.atlas?{atlas:Object.freeze({...options.atlas})}:{}),...(options.surface===undefined?{}:{surface:typeof options.surface==='function'?options.surface:surfaceData(options.surface)}),...(options.sourceRect===undefined?{}:{sourceRect:typeof options.sourceRect==='function'?options.sourceRect:rectData(options.sourceRect)}),...(options.effects?{effects:Object.freeze({...options.effects,...(options.effects.tint?{tint:Object.freeze([...options.effects.tint]) as readonly[number,number,number,number]}:{}),...(options.effects.light?{light:Object.freeze([...options.effects.light]) as readonly[number,number]}:{})})}:{})};
    this.#quality=Object.freeze(q);this.#backend=backend;this.#fallback=fallback;
  }
  get atlas():WebGLAtlas|undefined{return this.#atlas;}
  get diagnostics(){return Object.freeze({requestedBackend:this.#backend,effectiveBackend:this.#effective,fallbackReason:this.#reason,disposed:this.#disposed,initialized:!!this.#cleanup,gpu:this.#atlas?.diagnostics??this.#lastGPU,cpu:this.#cpu?.diagnostics,quality:this.#quality,size:this.#size,leasedBytes:this.#leasedBytes,leasedCanvases:this.#leased.size,pooledCanvases:this.#pool.length});}
  #makeCPU(){return createCpuRenderer({...this.#options.cpu,...(this.#options.surface?{surface:this.#options.surface}:{}),...(this.#options.effects?{effects:this.#options.effects}:{}),...(this.#options.sourceRect?{sourceRect:this.#options.sourceRect}:{})});}
  initialize(signal:AbortSignal):()=>void{
    if(this.#disposed)throw new WebGLError('DISPOSED','Renderer disposed');if(signal.aborted)throw new WebGLError('ABORTED','Initialization aborted');this.#cleanup?.();
    const generation=++this.#generation;this.#signal=signal;this.#mode=undefined;this.#reason=undefined;
    let cpuCleanup:(()=>void)|undefined,done=false;
    const fallback=(cause:unknown)=>{this.#reason=cause instanceof WebGLError?cause.code:'WEBGL_FAILED';if(this.#atlas){this.#atlas.dispose();this.#lastGPU=this.#atlas.diagnostics;this.#atlas=undefined;}if(this.#fallback==='none')throw cause;if(this.#fallback==='cpu'){this.#cpu=this.#makeCPU();cpuCleanup=this.#cpu.initialize(signal);this.#effective='cpu';}else this.#effective='material';};
    try{if(this.#backend==='cpu'){this.#cpu=this.#makeCPU();cpuCleanup=this.#cpu.initialize(signal);this.#effective='cpu';}else{this.#atlas=new WebGLAtlas(this.#options.atlas);try{this.#atlas.initialize();this.#effective='webgl';}catch(cause){fallback(cause);}}}
    catch(cause){this.#atlas?.dispose();this.#atlas=undefined;this.#cpu?.dispose();this.#cpu=undefined;this.#signal=undefined;throw cause;}
    const cleanup=()=>{if(done)return;done=true;signal.removeEventListener('abort',cleanup);if(generation!==this.#generation)return;this.#generation++;cpuCleanup?.();this.#cpu?.dispose();this.#cpu=undefined;if(this.#atlas){this.#atlas.dispose();this.#lastGPU=this.#atlas.diagnostics;this.#atlas=undefined;}this.#tiles.clear();for(const c of this.#pool)c.width=c.height=0;this.#pool=[];this.#signal=undefined;this.#cleanup=undefined;};
    this.#cleanup=cleanup;signal.addEventListener('abort',cleanup,{once:true});if(signal.aborted)cleanup();return cleanup;
  }
  #current(signal:AbortSignal){if(this.#disposed)throw new WebGLError('DISPOSED','Renderer disposed');if(!this.#cleanup)throw new WebGLError('NOT_INITIALIZED','Initialize renderer');if(signal.aborted||this.#signal?.aborted)throw new WebGLError('ABORTED','Render aborted');}
  #bounded(request:RenderRequest){if(!Number.isSafeInteger(request.width)||!Number.isSafeInteger(request.height)||request.width<1||request.height<1||request.width*request.height>MAX_PIXELS)throw new WebGLError('SIZE_UNSUPPORTED','Invalid requested size');const q=this.#quality,s=Math.min(1,q.maxWidth/request.width,q.maxHeight/request.height,Math.sqrt(q.maxPixels/request.width/request.height));let w=Math.max(1,Math.floor(request.width*s)),h=Math.max(1,Math.floor(request.height*s));if(w*h>q.maxPixels){if(w>=h)w=Math.max(1,Math.floor(q.maxPixels/h));else h=Math.max(1,Math.floor(q.maxPixels/w));}this.#size=Object.freeze({requestedWidth:request.width,requestedHeight:request.height,width:w,height:h});return {width:w,height:h};}
  #canvas(width:number,height:number){const bytes=width*height*4;if(this.#leasedBytes+bytes>16*1024**2||this.#leased.size>=16)throw new WebGLError('LEASE_LIMIT','Outstanding canvas frames exceed bounds');const c=this.#pool.pop()??document.createElement('canvas');c.width=width;c.height=height;this.#leased.add(c);this.#leasedBytes+=bytes;const generation=this.#generation;let released=false;return {canvas:c,release:()=>{if(released)return;released=true;this.#leased.delete(c);this.#leasedBytes-=bytes;if(!this.#disposed&&generation===this.#generation&&this.#pool.length<2)this.#pool.push(c);else c.width=c.height=0;}};}
  render(request:RenderRequest,signal:AbortSignal):FrameOutput|Promise<FrameOutput>{const result=this.renderBatch([request],signal);return result instanceof Promise?result.then(values=>values[0]!):result[0]!;}
  renderBatch(requests:readonly RenderRequest[],signal:AbortSignal):readonly FrameOutput[]|Promise<readonly FrameOutput[]>{
    this.#current(signal);if(!Array.isArray(requests)||!requests.length||requests.length>16||requests.reduce((n,r)=>n+r.width*r.height,0)>MAX_PIXELS)throw new WebGLError('BATCH_LIMIT','Core scene frame bounds apply');
    if(this.#effective==='cpu')return this.#cpuBatch(requests,signal);
    if(this.#effective==='material')return requests.map(r=>{const size=this.#bounded(r);return {...size,data:new Uint8ClampedArray(size.width*size.height*4)};});
    const first=requests[0]!,source=first.snapshot.source,tiles=new Map(this.#tiles),leases:Array<{release:()=>void}>=[];
    try{
      const frames:FrameOutput[]=requests.map((r,i)=>{if(r.snapshot.source!==source||r.snapshot.generation!==first.snapshot.generation)throw new WebGLError('INVALID_BATCH','A batch shares one source snapshot');const mode=r.prepareTarget?'scene':'manual';if(this.#mode&&this.#mode!==mode)throw new WebGLError('INVALID_OPTIONS','One renderer belongs to one scene or standalone owner');this.#mode=mode;if(mode==='manual'&&i===0)tiles.clear();const size=this.#bounded(r),id=r.id??'manual_'+i;
        const surfaceOptions=surfaceData(typeof this.#options.surface==='function'?this.#options.surface(r):(this.#options.surface??{}));
        const rect=this.#options.sourceRect===undefined?undefined:rectData(typeof this.#options.sourceRect==='function'?this.#options.sourceRect(r):this.#options.sourceRect);
        const surface:SurfaceInput={id,...size,...surfaceOptions,...(rect?{sourceRect:rect}:{})};
        const lease=r.prepareTarget?undefined:this.#canvas(size.width,size.height);if(lease)leases.push(lease);const target=r.prepareTarget?r.prepareTarget(size.width,size.height):lease!.canvas;
        tiles.set(id,{surface,target});return r.prepareTarget?{...size,presentedTarget:target}:{...size,canvas:target,release:lease!.release};});
      this.#current(signal);this.#atlas!.update(source,[...tiles.values()],{generation:first.snapshot.generation,revision:++this.#revision,dirtyIds:requests.map((r,i)=>r.id??'manual_'+i),...(this.#options.effects?{effects:this.#options.effects}:{}),signal});this.#tiles=tiles;return frames;
    }catch(cause){leases.forEach(l=>l.release());if(this.#backend!=='auto'||this.#fallback==='none'||signal.aborted||!(cause instanceof WebGLError)||['INVALID_OPTIONS','INVALID_BATCH','INVALID_TARGET','BATCH_LIMIT','LEASE_LIMIT','STALE'].includes(cause.code))throw cause;this.#reason=cause instanceof WebGLError?cause.code:'WEBGL_FAILED';if(this.#atlas){this.#atlas.dispose();this.#lastGPU=this.#atlas.diagnostics;this.#atlas=undefined;}this.#tiles.clear();if(this.#fallback==='cpu'){this.#cpu=this.#makeCPU();this.#cpu.initialize(this.#signal!);this.#effective='cpu';return this.#cpuBatch(requests,signal);}this.#effective='material';return this.renderBatch(requests,signal);}
  }
  async #cpuBatch(requests:readonly RenderRequest[],signal:AbortSignal):Promise<readonly FrameOutput[]>{const frames:FrameOutput[]=[];try{for(const r of requests)frames.push(await this.#cpu!.render(r,signal));return frames;}catch(cause){frames.forEach(f=>f.release?.());throw cause;}}
  releaseSurface(id:string):void{this.#tiles.delete(id);}
  dispose():void{if(this.#disposed)return;this.#disposed=true;this.#cleanup?.();}
}
export const createWebGLRenderer=(options:Omit<OpticalRendererOptions,'backend'|'fallback'>={})=>new OpticalRenderer({...options,backend:'webgl'});
export const createOpticalRenderer=(options:OpticalRendererOptions)=>new OpticalRenderer(options);
