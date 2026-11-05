import{SourceProvider,createGlassScene}from'@liquid-glass-forge/dom';
import{createOpticalRenderer}from'@liquid-glass-forge/webgl/dom';
import { clearGlass } from './glass-material.mjs';
// The application owns the explicit source. All optical output uses public Forge APIs.
export async function attachOptics(root, canvas, {
 signal, localCandidate = true, regular = false,
 refractionScale = clearGlass.refractionScale, tint = clearGlass.tint, rim = clearGlass.rim,
 bevel = clearGlass.bevel, blurRadius = clearGlass.blurRadius, dispersion = clearGlass.dispersion,
 onStatus = () => {}, onError = () => {},
} = {}) {
 const [red,green,blue,alpha]=tint;
 const linear=n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4;
 const tintLuminance=.2126*linear(red)+.7152*linear(green)+.0722*linear(blue);
 root.style.setProperty('--example-tint',`rgb(${red*255} ${green*255} ${blue*255} / ${alpha})`);
 const source=new SourceProvider({kind:'canvas',value:canvas});
 const preferences=['(prefers-reduced-transparency: reduce)','(prefers-contrast: more)','(forced-colors: active)'].map(q=>matchMedia(q));
 const surfaces=new Set([...root.querySelectorAll('[data-glass]')].filter(h=>h.getBoundingClientRect().width&&h.getBoundingClientRect().height)),attachments=new Map();
 let scene,renderer,disposed=false,generation=0,presentations=0,mode='preparing';
 const quality={maxWidth:900,maxHeight:600,maxPixels:360000};
 const sampler=document.createElement('canvas');sampler.width=sampler.height=8;const sample=sampler.getContext('2d',{willReadFrequently:true});
 function adaptInk(){const b=root.getBoundingClientRect();if(!b.width||!b.height||!sample)return;
  for(const h of surfaces){const r=h.getBoundingClientRect(),x=Math.max(0,(r.x-b.x)/b.width*canvas.width),y=Math.max(0,(r.y-b.y)/b.height*canvas.height),w=Math.min(canvas.width-x,r.width/b.width*canvas.width),hh=Math.min(canvas.height-y,r.height/b.height*canvas.height);if(w<=0||hh<=0)continue;
   sample.clearRect(0,0,8,8);sample.drawImage(canvas,x,y,w,hh,0,0,8,8);const d=sample.getImageData(0,0,8,8).data;let luminance=0;
   for(let i=0;i<d.length;i+=4)luminance+=.2126*linear(d[i]/255)+.7152*linear(d[i+1]/255)+.0722*linear(d[i+2]/255);
   const dark=(luminance/64*(1-alpha)+tintLuminance*alpha)>.2,tone=dark?'dark':'light';if(h.dataset.glassTone!==tone){h.dataset.glassTone=tone;h.style.setProperty('--glass-ink',dark?'#09182b':'#f7fbff');h.style.setProperty('--glass-shadow',dark?'0 1px 1px #ffffff50':'0 1px 3px #07122060');}
  }
 }
 const attachRegistered=(h)=>{if(!scene||attachments.has(h))return;attachments.set(h,scene.attach(h,{material:mode==='opaque'?'opaque':'glass'}));};
 function clear(){scene?.dispose();renderer?.dispose();scene=renderer=undefined;attachments.clear();}
 function fallback(){clear();mode=preferences.some(m=>m.matches)?'opaque':'css';scene=createGlassScene({signal});surfaces.forEach(attachRegistered);root.dataset.glassMode=mode;onStatus(mode);}
 async function mount(){
  const current=++generation;clear();if(disposed||signal?.aborted)return;
  if(preferences.some(m=>m.matches)){fallback();return;}
  try{
   renderer=createOpticalRenderer({backend:'webgl',fallback:'none',quality,
    surface:r=>{const scale=Math.min(1,quality.maxWidth/r.width,quality.maxHeight/r.height,Math.sqrt(quality.maxPixels/r.width/r.height)),w=Math.max(1,Math.floor(r.width*scale)),h=Math.max(1,Math.floor(r.height*scale)),density=Math.min(w/r.rect.width,h/r.rect.height);
     const host=[...surfaces].find(e=>{const b=e.getBoundingClientRect();return Math.abs(b.x-r.rect.x)<.6&&Math.abs(b.y-r.rect.y)<.6&&Math.abs(b.width-r.rect.width)<.6&&Math.abs(b.height-r.rect.height)<.6;});
     const b=host?.getBoundingClientRect(),worldScale=host?b.width/host.offsetWidth:1,radius=parseFloat(host?getComputedStyle(host).borderTopLeftRadius:'24')||24;
     return{radius:Math.min(radius*worldScale*density,w/2,h/2),bevel:Math.max(.5,Math.min(radius,bevel)*worldScale*density),strength:Number(host?.dataset.refraction??(regular?18:24))*refractionScale*worldScale*density};},
    sourceRect:r=>{const b=root.getBoundingClientRect(),sw=r.snapshot.source.width,sh=r.snapshot.source.height,x=Math.max(0,(r.rect.x-b.x)/b.width*sw),y=Math.max(0,(r.rect.y-b.y)/b.height*sh);return{x,y,width:Math.min(sw-x,r.rect.width/b.width*sw),height:Math.min(sh-y,r.rect.height/b.height*sh)};},
    effects:{model:localCandidate?'refractive-lens-v2':'rounded-material-v1',blurRadius,dispersion,tint,rim,specular:0}});
   const raw=renderer,batch=(requests,s)=>{const frames=raw.renderBatch(requests,s);presentations++;return frames;};
   scene=createGlassScene({source,signal,renderer:{initialize:s=>raw.initialize(s),render:(r,s)=>{const f=batch([r],s);return f instanceof Promise?f.then(v=>v[0]):f[0];},renderBatch:batch,releaseSurface:id=>raw.releaseSurface(id)},onError:error=>{if(current!==generation||disposed||signal?.aborted)return;onError(error);fallback();}});
   mode='preparing';surfaces.forEach(attachRegistered);const mounted=scene;await mounted.ready;
   if(current!==generation||disposed||scene!==mounted||!renderer)return;mode='webgl';root.dataset.glassMode=mode;adaptInk();onStatus(mode);
  }catch(error){if(current!==generation||disposed||signal?.aborted)return;onError(error);fallback();}
 }
 const change=()=>void mount();preferences.forEach(m=>m.addEventListener('change',change));
 const dispose=()=>{if(disposed)return;disposed=true;generation++;preferences.forEach(m=>m.removeEventListener('change',change));clear();source.destroy();surfaces.clear();};
 signal?.addEventListener('abort',dispose,{once:true});await mount();
 return{invalidate(){if(!disposed){adaptInk();source.invalidate();}},attach(element){if(disposed||!root.contains(element))return()=>{};if(!surfaces.has(element)){surfaces.add(element);attachRegistered(element);adaptInk();source.invalidate();}let done=false;return()=>{if(done)return;done=true;attachments.get(element)?.dispose();attachments.delete(element);surfaces.delete(element);};},pause(){scene?.pause();},resume(){if(!disposed)scene?.resume();},dispose,get diagnostics(){return{mode,refractionScale,clearPreset:{tint,blurRadius,dispersion,rim,bevel},surfaceCount:surfaces.size,presentations,disposed,renderer:renderer?.diagnostics};}};
}
