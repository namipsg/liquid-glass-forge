import { createSource } from '/core/index.js';
import { WebGLAtlas, releaseIdleWebGLContexts, webglContextPoolDiagnostics } from '/webgl/index.js';
import { prepareCpuSource, renderCpu, disposeCpuSource } from '/cpu/index.js';
import { oracleRender, oracleGeometry } from '/oracle.js';
import { SourceProvider, createGlassScene, mountGlassHost } from '/dom/index.js';
import { createWebGLRenderer, createOpticalRenderer } from '/webgl/dom.js';
const canvas=(w=0,h=0)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const source=(w,h,fn,revision=0)=>{const data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),(y*w+x)*4);return createSource({contractVersion:1,width:w,height:h,revision,data,ownership:'borrowed',colorSpace:'srgb',alphaMode:'straight'});};
const read=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
const present=(data,w,h)=>{const c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.createImageData(w,h);im.data.set(data);ctx.putImageData(im,0,0);return read(c);};
function error(actual,expected,surface){let max=0,sum=0,edgeMax=0,edgeSum=0,edgeCount=0,interiorMax=0,interiorSum=0,interiorCount=0;for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){const g=oracleGeometry(surface.width,surface.height,surface.radius,surface.bevel,x,y),edge=g.distance>=-surface.bevel-1;for(let c=0;c<4;c++){const i=(y*surface.width+x)*4+c,d=Math.abs(actual[i]-expected[i]);max=Math.max(max,d);sum+=d;if(edge){edgeMax=Math.max(edgeMax,d);edgeSum+=d;edgeCount++;}else{interiorMax=Math.max(interiorMax,d);interiorSum+=d;interiorCount++;}}}return {max,mean:sum/actual.length,edge:{max:edgeMax,mean:edgeCount?edgeSum/edgeCount:0,count:edgeCount},interior:{max:interiorMax,mean:interiorCount?interiorSum/interiorCount:0,count:interiorCount}};}
const ensure=(yes,message)=>{if(!yes)throw new Error(message);};
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn,label){const end=performance.now()+5000;while(!fn()){if(performance.now()>end)throw new Error(label+' timeout');await tick();}}
export async function conformance(){
  const colorful=source(13,9,(x,y)=>[(x*31+y*7)%256,(x*3+y*47)%256,(x*19+y*13)%256,255]);
  const alpha=source(8,8,(x,y)=>[(x*47)%256,(y*59)%256,200,x<2?0:x<4?57:x<6?128:255]);
  const impulse=source(9,7,(x,y)=>[255,70,20,x===4&&y===3?255:0]);
  const constant=source(8,7,()=>[83,147,211,128]);
  const original=source(640,360,(x,y)=>[x%256,y%256,(x+y)%256,255]);
  const shapes=[
    ['orientation',colorful,{width:13,height:9,radius:0,bevel:2,strength:0}],
    ['circle-even',colorful,{width:12,height:12,radius:6,bevel:3,strength:2}],
    ['circle-odd-tie',colorful,{width:13,height:13,radius:6.5,bevel:3,strength:2}],
    ['fractional-radius',colorful,{width:12,height:11,radius:3.75,bevel:2.5,strength:3.25}],
    ['rounded-refraction',colorful,{width:17,height:13,radius:5,bevel:4,strength:3}],
    ['fractional-crop',colorful,{width:15,height:11,radius:4,bevel:3,strength:2,sourceRect:{x:1.25,y:.5,width:10.5,height:7.25}}],
    ['hidden-color-alpha',alpha,{width:13,height:11,radius:4.5,bevel:3,strength:2}],
    ['dispersion-material',alpha,{width:13,height:11,radius:4,bevel:3,strength:2},{model:'rounded-material-v1',dispersion:.5,tint:[.2,.4,.7,.3],rim:.2,specular:.4,light:[-1,-2]}],
    ['blur-impulse',impulse,{width:9,height:7,radius:0,bevel:2,strength:0},{model:'rounded-material-v1',blurRadius:2}],
    ['blur-constant',constant,{width:8,height:7,radius:0,bevel:2,strength:0},{model:'rounded-material-v1',blurRadius:16}],
    ['blur-transparent-edge',alpha,{width:11,height:9,radius:3,bevel:2,strength:3},{model:'rounded-material-v1',blurRadius:1,dispersion:.4,tint:[.1,.6,.2,.2],rim:.1,specular:.3}],
    ['original-half-texel',original,{width:320,height:180,radius:36,bevel:30,strength:12}]
  ];
  const atlas=new WebGLAtlas(),results=[];atlas.initialize();const gl=atlas.context,ext=gl.getExtension('WEBGL_debug_renderer_info');const environment={version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),floatBuffers:!!gl.getExtension('EXT_color_buffer_float')};let blockedReads=0;const originalRead=gl.readPixels;gl.readPixels=()=>{blockedReads++;throw new Error('production readPixels forbidden');};
  try{for(let i=0;i<shapes.length;i++){const [name,s,shape,effects]=shapes[i],surface={id:name,...shape},target=canvas(),before=s.data.slice();atlas.update(s,[{surface,target}],{generation:i,effects});const actual=read(target),expected=present(oracleRender(s,surface,effects),shape.width,shape.height),prepared=prepareCpuSource(s);let cpu;try{cpu=present(renderCpu(prepared,surface,effects),shape.width,shape.height);}finally{disposeCpuSource(prepared);}const oracle=error(actual,expected,surface),parity=error(actual,cpu,surface);results.push({name,oracle,cpu:parity,borrowedIntact:s.data.every((v,i)=>v===before[i]),backend:atlas.diagnostics.backend,diagnostics:atlas.diagnostics});}
  }finally{gl.readPixels=originalRead;atlas.dispose();}
  return {environment,cases:results,blockedReads,pass:results.every(r=>r.borrowedIntact&&r.backend==='webgl'&&r.oracle.max<=3&&r.oracle.mean<=.5&&r.cpu.max<=3&&r.cpu.mean<=.5)};
}
export async function atlasCases(){
  const s=source(16,12,(x,y)=>[x*13,y*17,100,255]),atlas=new WebGLAtlas();atlas.initialize();
  let entries=Array.from({length:4},(_,i)=>({surface:{id:'tile'+i,width:31+i,height:23+i,radius:6,bevel:4,strength:2},target:canvas()}));
  try{atlas.update(s,entries);const before=entries.map(e=>read(e.target).slice()),draws=atlas.diagnostics.renderCount,uploads=atlas.diagnostics.uploadCount;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const idleExact=entries.every((e,i)=>read(e.target).every((v,k)=>v===before[i][k]));
    atlas.update(s,entries,{dirtyIds:[],revision:10});ensure(atlas.diagnostics.lastBatch.gpuSnapshots===0&&atlas.diagnostics.renderCount===draws,'Idle GPU work');
    let stale=false;try{atlas.update(s,entries,{dirtyIds:[],revision:5});}catch(e){stale=e.code==='STALE';}ensure(stale,'Idle revision watermark not advanced');atlas.update(s,entries,{dirtyIds:[]});
    entries[0].surface={...entries[0].surface,strength:5};atlas.update(s,entries,{dirtyIds:['tile0']});ensure(atlas.diagnostics.lastBatch.dirty===1,'Single tile redraw');ensure(atlas.diagnostics.uploadCount===uploads,'Unchanged source reupload');ensure(entries.slice(1).every((e,i)=>read(e.target).every((v,k)=>v===before[i+1][k])),'Unchanged tile modified');
    entries=entries.map((e,i)=>({...e,surface:{...e.surface,width:41+i,height:29+i}}));atlas.update(s,entries,{dirtyIds:[]});ensure(atlas.diagnostics.lastBatch.dirty===4,'Repack did not redraw');
    const transparent=createSource({...s,revision:1,data:new Uint8Array(s.data.length)});atlas.update(transparent,entries,{dirtyIds:[]});ensure(entries.every(e=>read(e.target).every(v=>v===0)),'Opaque replacement left stale pixels');
    return {pass:idleExact,idleExact,staleIdleRejected:stale,implicitAfterExplicit:true,transparentReplacement:true,diagnostics:atlas.diagnostics};
  }finally{atlas.dispose();}
}
function faultCanvas(method,value){const c=canvas(1,1),get=c.getContext.bind(c);let real; c.getContext=(type,attrs)=>{const context=get(type,attrs);if(type!=='webgl2'||!context)return context;real=context;return new Proxy(context,{get(gl,key){if(key===method)return value(gl);const v=Reflect.get(gl,key,gl);return typeof v==='function'?v.bind(gl):v;}});};return {canvas:c,get gl(){return real;}};}
export async function faults(){const results=[];
  for(const [name,method,value] of [['compile','getShaderParameter',()=>()=>false],['link','getProgramParameter',()=>()=>false],['texture','createTexture',()=>()=>null]]){
    const f=faultCanvas(method,value),a=new WebGLAtlas({canvasFactory:()=>f.canvas});let code;try{a.initialize();}catch(e){code=e.code;}ensure(code&&Object.values(a.diagnostics.resources).every(v=>v===0),'Partial init leak '+name);a.dispose();a.dispose();results.push({name,code,resources:a.diagnostics.resources});
  }
  let enabled=true;const f=faultCanvas('checkFramebufferStatus',gl=>()=>enabled?gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:gl.FRAMEBUFFER_COMPLETE),a=new WebGLAtlas({canvasFactory:()=>f.canvas});a.initialize();const s=source(4,4,()=>[90,40,20,255]),entry={surface:{id:'fault',width:7,height:5,radius:1,bevel:1,strength:1},target:canvas()};
  try{for(let i=0;i<12;i++){let code;try{a.update(s,[entry]);}catch(e){code=e.code;}ensure(code==='FRAMEBUFFER_INCOMPLETE','Incomplete FBO not rejected');ensure(a.diagnostics.resources.framebuffers===0&&a.diagnostics.resources.textures===2,'Repeated FBO failure grew resources');}enabled=false;a.update(s,[entry]);results.push({name:'repeated incomplete FBO',attempts:12,recovered:true,resources:a.diagnostics.resources});}finally{a.dispose();}
  const invalid=new WebGLAtlas({maxBytes:65544});invalid.initialize();try{let code;try{invalid.update(s,[entry]);}catch(e){code=e.code;}ensure(code==='BUDGET','Budget not enforced');results.push({name:'budget',code});}finally{invalid.dispose();}
  return {pass:true,cases:results};
}
export async function restoration(){const a=new WebGLAtlas({maxRestores:2});a.initialize();const s=source(6,5,(x,y)=>[x*31,y*41,80,255]),e={surface:{id:'restore',width:13,height:9,radius:3,bevel:2,strength:2},target:canvas()};a.update(s,[e]);const original=read(e.target).slice(),gl=a.context,ext=gl.getExtension('WEBGL_lose_context');ensure(ext,'Loss extension unavailable');const generations=[a.diagnostics.handleGeneration];
  try{for(let i=0;i<2;i++){ext.loseContext();await until(()=>a.diagnostics.state==='lost','lost');ensure(a.diagnostics.resources.textures===0,'Lost handles retained');ext.restoreContext();await until(()=>a.diagnostics.state==='ready','restored');a.update(s,[e]);ensure(read(e.target).every((v,k)=>v===original[k]),'Restoration pixels changed');generations.push(a.diagnostics.handleGeneration);}
    ext.loseContext();await until(()=>a.diagnostics.state==='unavailable','retry limit');let rejected=false;try{a.update(s,[e]);}catch{rejected=true;}ensure(rejected,'Unbounded restore');return {pass:true,generations,restores:a.diagnostics.restores,limit:a.diagnostics.failure};
  }finally{a.dispose();}
}
export async function resources(){const s=source(16,12,(x,y)=>[x*13,y*17,80,255]),records=[];
  for(const count of [1,10,50]){const a=new WebGLAtlas();a.initialize();try{const entries=Array.from({length:count},(_,i)=>({surface:{id:'s'+i,width:64,height:36,radius:8,bevel:6,strength:3},target:canvas()}));a.update(s,entries);const d=a.diagnostics;ensure(d.resources.contexts===1&&d.resources.textures===3&&d.resources.framebuffers===1&&d.resources.programs===2,'Surface-scaled GPU handles');records.push({count,diagnostics:d});}finally{a.dispose();}}
  const contexts=[];for(let i=0;i<20;i++){const a=new WebGLAtlas();a.initialize();contexts.push(a.context);a.update(s,[{surface:{id:'seq',width:9,height:7,radius:2,bevel:2,strength:1},target:canvas()}]);a.dispose();}
  const unique=new Set(contexts).size;ensure(unique===1,'Sequential contexts grew');const pool=webglContextPoolDiagnostics();releaseIdleWebGLContexts();return {pass:true,counts:records,sequentialScenes:20,uniqueContexts:unique,poolBeforeRelease:pool,poolAfterRelease:webglContextPoolDiagnostics()};
}
export async function integration(){
  const p=new SourceProvider({kind:'pixels',width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])}),r=createWebGLRenderer({surface:{radius:0,strength:0}}),errors=[];
  const roots=Array.from({length:2},(_,i)=>{const e=document.createElement('div');e.id='gpu-host-'+i;e.style.cssText='position:relative;width:160px;height:80px;margin:8px';e.innerHTML='<input aria-label="Native GPU input" id="gpu-input-'+i+'"><button id="gpu-button-'+i+'">Native</button>';document.body.append(e);return e;});
  const scene=createGlassScene({source:p,renderer:r,onError:e=>errors.push(String(e))}),attached=roots.map(e=>scene.attach(e));await scene.ready;
  await until(()=>attached.every(e=>e.host.target.width===160*devicePixelRatio),'native batch');
  const targets=attached.map(e=>e.host.target);ensure(targets.every(t=>read(t)[0]===255&&read(t)[(t.width-1)*4+2]===255),'native GPU pixels');
  await new Promise(resolve=>setTimeout(resolve,100));const draws=r.diagnostics.gpu.renderCount,batches=r.diagnostics.gpu.batchCount;await new Promise(resolve=>setTimeout(resolve,80));ensure(r.diagnostics.gpu.renderCount===draws,'idle rendering');
  attached[0].invalidate();await until(()=>r.diagnostics.gpu.batchCount>batches,'single host update');ensure(r.diagnostics.gpu.lastBatch.dirty===1,'native batch dirtied unchanged tile');
  p.replace({kind:'pixels',width:1,height:1,data:new Uint8Array(4)});await until(()=>targets.every(t=>read(t).every(v=>v===0)),'transparent source');
  scene.pause();p.replace({kind:'pixels',width:1,height:1,data:new Uint8Array([0,255,0,255])});scene.resume();await scene.ready;await until(()=>read(targets[0])[1]===255,'resume');ensure(attached.every((a,i)=>a.host.target===targets[i]),'unstable target');
  const native={gpu:r.diagnostics,scene,p,r,roots,attached};window.phase6Native=native;
  // The synchronous adapter must finish copying borrowed bytes before returning.
  const borrowed=source(2,1,x=>x?[0,0,255,255]:[255,0,0,255]),request={snapshot:{source:borrowed,generation:0,revision:0},width:2,height:1,dpr:1,rect:{x:0,y:0,width:2,height:1}},signal=new AbortController().signal;
  const manual=createWebGLRenderer({surface:{radius:0,strength:0}});manual.initialize(signal);const out=manual.render(request,signal);ensure(!(out instanceof Promise),'native render yielded');borrowed.data.fill(0);await tick();ensure([...read(out.canvas)].join(',')==='255,0,0,255,0,0,255,255','borrowed source or GPU drawing buffer retained');manual.dispose();ensure(out.canvas.width===2,'leased frame destroyed');out.release();out.release();ensure(manual.diagnostics.leasedBytes===0,'canvas lease leaked');
  // Invalid dynamic input cannot allocate output or silently downgrade.
  let invalid=0;for(const value of [undefined,null,{extra:1},Promise.resolve({}),{strength:-1}]){const bad=createWebGLRenderer({surface:()=>value});bad.initialize(signal);try{bad.render(request,signal);}catch{invalid++;}finally{ensure(bad.diagnostics.leasedBytes===0,'invalid options leased canvas');bad.dispose();}}ensure(invalid===5,'invalid dynamic surface accepted');
  let glCalls=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(/webgl/i.test(type)){glCalls++;throw new Error('CPU requested GPU');}return get.call(this,type,...args);};
  try{const cpu=createOpticalRenderer({backend:'cpu',cpu:{executor:{worker:'off'}},surface:{radius:0,strength:0}});cpu.initialize(signal);const frame=await cpu.render(request,signal);ensure(cpu.diagnostics.effectiveBackend==='cpu'&&glCalls===0,'forced CPU used GL');frame.release();cpu.dispose();}finally{HTMLCanvasElement.prototype.getContext=get;}
  const fallback=[];for(const policy of ['none','cpu','material']){const factory=()=>{const c=canvas();c.getContext=()=>null;return c;};const a=createOpticalRenderer({backend:'auto',fallback:policy,atlas:{canvasFactory:factory},cpu:{executor:{worker:'off'}}});let rejected=false;try{a.initialize(signal);const f=await a.render(request,signal);f.release?.();}catch{rejected=true;}fallback.push({policy,rejected,diagnostics:a.diagnostics});ensure(policy==='none'?rejected:a.diagnostics.effectiveBackend===policy,'explicit fallback');a.dispose();}
  const auto=createOpticalRenderer({backend:'auto',fallback:'cpu',cpu:{executor:{worker:'off'}}});auto.initialize(signal);auto.atlas.context.getExtension('WEBGL_lose_context').loseContext();await until(()=>auto.atlas.diagnostics.state==='lost','auto loss');const f=await auto.render(request,signal);f.release?.();ensure(auto.diagnostics.effectiveBackend==='cpu'&&auto.diagnostics.fallbackReason==='CONTEXT_LOST','loss did not downgrade');const lossFallback=auto.diagnostics;auto.dispose();
  // Register backing ownership before a synchronous copy can be disposed.
  const e=document.createElement('div'),t=canvas(3,2);e.style.cssText='width:12px;height:8px';document.body.append(e);e.append(t);t.getContext('2d').fillStyle='#123456';t.getContext('2d').fillRect(0,0,3,2);const before=read(t).slice(),host=mountGlassHost(e,{target:t});const pending=createWebGLRenderer({surface:{radius:0,strength:0}});pending.initialize(signal);const frame=pending.render({...request,prepareTarget:(w,h)=>host.prepareCanvas(w,h)},signal);host.dispose();await tick();ensure(t.width===3&&t.height===2&&read(t).every((v,i)=>v===before[i]),'supplied target not restored');pending.dispose();e.remove();
  return {pass:errors.length===0,errors,synchronousBorrowedCopy:true,stableTargets:true,idle:true,invalidDynamic:invalid,forcedCpuGlCalls:glCalls,fallback,lossFallback,suppliedTargetRestored:true,gpu:native.gpu};
}
export function finishIntegration(){const {scene,p,r,roots}=window.phase6Native;const values=roots.map(e=>e.querySelector('input').value);scene.dispose();scene.dispose();p.destroy();r.dispose();ensure(roots.every(e=>!e.querySelector('canvas')),'native target retained');roots.forEach(e=>e.remove());return {values,disposed:true};}
export async function benchmark(repeat){
  const start=performance.now(),provider=new SourceProvider({kind:'image',url:location.origin+'/fixture.svg'}),snapshot=await provider.read(),s=snapshot.source,acquisitionMs=performance.now()-start;
  ensure(s.width===640&&s.height===360,'Original benchmark input dimensions');
  const a=new WebGLAtlas();a.initialize();const count=4,width=640,height=360,frames=90,warmup=15,rawFrames=[];
  const entries=Array.from({length:count},(_,i)=>{const t=canvas(width,height);t.style.cssText='width:320px;height:180px';document.querySelector('#measurements').append(t);return {target:t,surface:{id:'bench'+i,width,height,radius:72,bevel:60,strength:12}};});
  const gl=a.context,ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);let previous;
  const raf=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Benchmark rAF unavailable')),5000);requestAnimationFrame(t=>{clearTimeout(timer);resolve(t);});});
  try{for(let i=0;i<frames+warmup;i++){const timestamp=await raf(),begin=performance.now();entries.forEach((e,j)=>e.surface.strength=12+((i+j)%20)/5);const b=a.update(s,entries,{generation:snapshot.generation,revision:i});const elapsed=performance.now()-begin;if(i>=warmup)rawFrames.push({frame:i-warmup,timestamp,batchMs:elapsed,intervalMs:timestamp-previous,completionAgeMs:b.completedAt.at(-1)-timestamp,oldestSurfaceAgeMs:b.completedAt.at(-1)-b.completedAt[0],uploadMs:b.uploadMs,drawAndBlitMs:b.drawMs,snapshotMs:b.snapshotMs,targetCopyMs:b.copyMs,completedAt:b.completedAt,optics:entries.map(e=>({...e.surface}))});previous=timestamp;}
    const summary=k=>{const values=rawFrames.map(f=>f[k]).sort((a,b)=>a-b);return {p50:values[Math.ceil(frames*.5)-1],p95:values[Math.ceil(frames*.95)-1],max:values.at(-1)};},d=a.diagnostics;
    return {backend:'webgl',repeat,count,width,height,frames,warmup,source:{width:s.width,height:s.height,policy:'decoded once; static source, changing optics'},acquisitionMs,batchMs:summary('batchMs'),frameIntervalMs:summary('intervalMs'),completionAgeMs:summary('completionAgeMs'),components:Object.fromEntries(['uploadMs','drawAndBlitMs','snapshotMs','targetCopyMs','oldestSurfaceAgeMs'].map(k=>[k,summary(k)])),rawFrames,estimatedOwnedBytes:d.ownedImageBytes,targetCanvasBytesLowerBound:count*width*height*4,inputBytes:s.data.byteLength,accountedImageBytes:d.ownedImageBytes+count*width*height*4+s.data.byteLength,gpu:{...d,lastBatch:{...d.lastBatch,targets:count}},environment:{visibility:document.visibilityState,focus:document.hasFocus(),renderer,userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},stageRect:document.querySelector('#measurements').getBoundingClientRect().toJSON(),targetCss:entries.map(e=>({width:e.target.style.width,height:e.target.style.height,rect:e.target.getBoundingClientRect().toJSON()}))},ageDefinition:'rAF optical revision to last synchronous Canvas2D copy; excludes physical scanout',timedWork:'validation, source upload if changed, atlas draw/blit, synchronous Canvas2D snapshot and all target copies; not a GPU timer'};
  }finally{a.dispose();provider.destroy();entries.forEach(e=>{e.target.width=e.target.height=0;e.target.remove();});}
}
