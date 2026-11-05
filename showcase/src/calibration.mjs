import {SourceProvider,createGlassScene} from '@liquid-glass-forge/dom';
import {createOpticalRenderer} from '@liquid-glass-forge/webgl/dom';
import './calibration.css';
const release=await fetch(new URL('./release.json',document.baseURI)).then(r=>r.ok?r.json():null).catch(()=>null),localCandidate=release?.localCandidate===true;
const $=s=>document.querySelector(s),stage=$('#comparison-stage'),host=$('#comparison-glass'),image=$('#comparison-backdrop');
await image.decode();
const source=new SourceProvider({kind:'image',url:image.src});
const names=['strength','bevel','dispersion','blur','tint','rim','specular'];
const read=()=>Object.fromEntries(names.map(name=>[name,Number($('#'+name).value)]));
let scene,renderer,attachment,generation=0,busy=false,dirty=false,raf=0,timer,drag,referenceRecord,disposed=false,sweep=0;
function invalidate(){dirty=true;if(raf||disposed)return;const flush=()=>{raf=0;if(busy){raf=requestAnimationFrame(flush);return;}if(dirty){dirty=false;attachment?.invalidate();}};raf=requestAnimationFrame(flush);}
function move(x,y){host.style.left=Math.max(0,Math.min(120,x))+'px';host.style.top=Math.max(0,Math.min(200,y))+'px';invalidate();}
async function mount(){
 const current=++generation;busy=false;scene?.dispose();renderer?.dispose();
 const p=read(),backend=$('#backend').value,quality=backend==='cpu'?(localCandidate?{maxWidth:256,maxHeight:160,maxPixels:40960}:{maxWidth:320,maxHeight:180,maxPixels:57600}):{maxWidth:900,maxHeight:600,maxPixels:540000};
 renderer=createOpticalRenderer({backend,quality,surface:r=>{const scale=Math.min(1,quality.maxWidth/r.width,quality.maxHeight/r.height,Math.sqrt(quality.maxPixels/r.width/r.height));const density=Math.min(Math.max(1,Math.floor(r.width*scale))/r.rect.width,Math.max(1,Math.floor(r.height*scale))/r.rect.height);return{radius:Math.min(60*density,Math.max(1,Math.floor(r.width*scale))/2,Math.max(1,Math.floor(r.height*scale))/2),bevel:p.bevel*density,strength:p.strength*density};},sourceRect:r=>{const b=stage.getBoundingClientRect();return{x:(r.rect.x-b.x)*1.5,y:(r.rect.y-b.y)*1.5,width:r.rect.width*1.5,height:r.rect.height*1.5};},effects:{model:localCandidate&&$('#profile').value==='v2'&&$('#preset').value==='clear'?'refractive-lens-v2':'rounded-material-v1',blurRadius:p.blur,dispersion:p.dispersion/100,tint:[1,1,1,p.tint/100],rim:p.rim/100,specular:p.specular/100},...(backend==='cpu'?{cpu:{quality:{...quality,...(localCandidate?{cadence:'interactive',maxUpdatesPerSecond:60}:{})},executor:{worker:'auto'}}}:{})});
 const raw=renderer,renderBatch=async(requests,signal)=>{if(current===generation)busy=true;try{return await raw.renderBatch(requests,signal);}finally{if(current===generation)busy=false;}};
 scene=createGlassScene({source,renderer:{initialize:s=>raw.initialize(s),render:(r,s)=>renderBatch([r],s).then(f=>f[0]),renderBatch,releaseSurface:id=>raw.releaseSurface(id)},onError:e=>{$('#renderer-status').textContent=String(e);}});
 attachment=scene.attach(host);await scene.ready;if(current===generation)$('#renderer-status').textContent=backend==='cpu'?(localCandidate?'CPU interactive candidate · target up to 60 Hz':'CPU worker when available · bounded 30 Hz optics'):'WebGL candidate · native calibration pending';
}
function update(){for(const name of names)$('#'+name+'-value').value=$('#'+name).value;clearTimeout(timer);timer=setTimeout(()=>void mount(),180);}
for(const name of names){$('#'+name).addEventListener('input',update);$('#'+name).addEventListener('change',()=>{clearTimeout(timer);void mount();});}
$('#backend').addEventListener('change',()=>void mount());
function preset(){const v2=localCandidate&&$('#profile').value==='v2';const values=$('#preset').value==='clear'?(v2?[72,16,3,2,8,4,0]:[72,58,8,0,2,14,30]):[0,80,4,8,55,10,0];names.forEach((name,i)=>$('#'+name).value=values[i]);update();}
$('#preset').addEventListener('change',preset);$('#profile').addEventListener('change',preset);$('#profile-choice').hidden=!localCandidate;if(localCandidate)preset();
const handle=$('#comparison-handle');handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;handle.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:host.offsetLeft,top:host.offsetTop};});handle.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)move(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,()=>drag=undefined);
handle.addEventListener('keydown',e=>{const step=e.shiftKey?20:5,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];if(delta){e.preventDefault();move(host.offsetLeft+delta[0],host.offsetTop+delta[1]);}});
$('#center').addEventListener('click',()=>{cancelAnimationFrame(sweep);move(60,100);});
$('#sweep').addEventListener('click',()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;cancelAnimationFrame(sweep);move(10,100);const start=performance.now()+200;const tick=now=>{if(disposed)return;move(10+100*Math.min(1,Math.max(0,(now-start)/2000)),100);if(now<start+2000)sweep=requestAnimationFrame(tick);};sweep=requestAnimationFrame(tick);});
const reference=$('#reference'),overlay=$('#reference-overlay');
async function loadReference(file,provenance){
 if(!file)return;
 try{
  const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('Image is larger than the 40-megapixel local limit.');}
  const full=document.createElement('canvas');full.width=bitmap.width;full.height=bitmap.height;const c=full.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0);bitmap.close();const bytes=c.getImageData(0,0,full.width,full.height).data;
  let x0=full.width,y0=full.height,x1=-1,y1=-1,count=0;
  for(let y=0;y<full.height;y++)for(let x=0;x<full.width;x++){const i=(y*full.width+x)*4;if(bytes[i]>235&&bytes[i+1]<35&&bytes[i+2]>235){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);count++;}}
  const w=x1-x0+1,h=y1-y0+1;if(count<16||w<200||h<200||Math.abs(w/h-1)>.025)throw Error('Four-corner registration was not found. Use a screenshot from the native reference app.');
  // Reject scattered magenta pixels unless all four source corners are present.
  for(const [x,y]of [[x0,y0],[x1,y0],[x0,y1],[x1,y1]]){let found=false;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const px=x+dx,py=y+dy;if(px<0||py<0||px>=full.width||py>=full.height)continue;const i=(py*full.width+px)*4;if(bytes[i]>235&&bytes[i+1]<35&&bytes[i+2]>235)found=true;}if(!found)throw Error('A registration corner is missing.');}
  for(const canvas of [reference,overlay])canvas.getContext('2d').drawImage(full,x0,y0,w,h,0,0,960,960);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
  referenceRecord={fileName:file.name,sha256:hash,pixelWidth:full.width,pixelHeight:full.height,crop:{x:x0,y:y0,width:w,height:h},registered:true,captureProvenance:provenance?.provenance??'unverified-import',physical:provenance?.physical??null,runtime:provenance?.runtime??null,simulatorUDID:provenance?.simulatorUDID??null};
  $('#overlay').disabled=$('#difference').disabled=false;$('#reference-status').textContent=provenance?.physical===false?(provenance.runtime??'iOS')+' Simulator capture registered. The Forge candidate still differs; review the rim and center separately.':'Reference image registered. Confirm native capture provenance, then match material, appearance and lens position.';full.width=full.height=0;
 }catch(error){referenceRecord=undefined;overlay.hidden=true;$('#overlay').disabled=$('#difference').disabled=true;$('#reference-status').textContent=String(error.message??error);}
}
$('#reference-file').addEventListener('change',e=>void loadReference(e.target.files[0]));
function blend(){overlay.hidden=!referenceRecord||Number($('#overlay').value)===0;overlay.style.opacity=Number($('#overlay').value)/100;overlay.style.mixBlendMode=$('#difference').checked?'difference':'normal';}
$('#overlay').addEventListener('input',blend);$('#difference').addEventListener('change',blend);
$('#export').addEventListener('click',async()=>{const sourceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(image.src)).arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');const record={schemaVersion:1,status:'candidate-awaiting-manual-review',createdAt:new Date().toISOString(),nativeReference:referenceRecord??null,reportedIOS:$('#ios-version').value||null,referenceAppearance:$('#reference-appearance').value,sourceSha256:sourceHash,stageCSS:{width:320,height:320},surfaceCSS:{width:200,height:120,radius:60,x:host.offsetLeft,y:host.offsetTop},devicePixelRatio,backend:$('#backend').value,parameters:read(),profile:localCandidate?$('#profile').value:'v1',localCandidate,renderer:renderer?.diagnostics,qualified:false};const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='forge-material-candidate.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#export-status').textContent='Candidate saved. This does not mark the material as calibrated.';});
if(localCandidate)$('#backend option[value=cpu]').textContent='CPU · interactive candidate';
try{await mount();}catch(error){$('#renderer-status').textContent=String(error);}
window.lgfCalibration={get diagnostics(){return{generation,busy,backend:$('#backend').value,renderer:renderer?.diagnostics,reference:referenceRecord,parameters:read()};}};
window.addEventListener('pagehide',()=>{disposed=true;generation++;clearTimeout(timer);cancelAnimationFrame(raf);cancelAnimationFrame(sweep);scene?.dispose();renderer?.dispose();source.destroy();});

// Optional local captures are installed into ignored dist output, never public
// source or npm packages. Their receipt explicitly identifies Simulator origin.
if(!release?.publicShowcase)fetch(new URL('./calibration/references/index.json',document.baseURI),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(async manifest=>{
 if(!manifest?.references)return;
 const registered=manifest.references.filter(r=>r.kind==='registered'&&r.physical===false);
 const choice=$('#reference-choice');
 for(const ref of registered){const option=document.createElement('option');option.value=ref.id;option.textContent=ref.label+' · Simulator';choice.append(option);}
 const select=async()=>{try{const ref=registered.find(r=>r.id===choice.value);if(!ref)return;const response=await fetch(new URL('./calibration/references/'+ref.file,document.baseURI),{cache:'no-store'});if(!response.ok)throw Error('Reference capture unavailable');const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==ref.sha256)throw Error('Reference receipt does not match image bytes');await loadReference(new File([bytes],ref.file,{type:'image/png'}),ref);$('#ios-version').value=ref.runtime.match(/(?:iOS|iPadOS) ([\d.]+)/)?.[1]??ref.runtime;$('#reference-appearance').value='Light';$('#preset').value=ref.material;$('#preset').dispatchEvent(new Event('change'));$('#center').click();}catch(error){$('#reference-status').textContent=String(error);}};
 choice.addEventListener('change',()=>void select());$('#capture-choice').hidden=!registered.length;if(registered.length)await select();
 for(const ref of manifest.references.filter(r=>r.kind==='context')){const figure=document.createElement('figure'),crop=document.createElement('div'),img=document.createElement('img'),caption=document.createElement('figcaption'),link=document.createElement('a');crop.className='native-crop'+(ref.preview==='full'?' native-full':'');img.src=new URL('./calibration/references/'+ref.file,document.baseURI);img.alt=ref.label+' · '+ref.runtime+' Simulator';crop.append(img);caption.textContent=ref.label+' · '+ref.runtime+' ';link.href=img.src;link.textContent='Full capture ↗';caption.append(link);figure.append(crop,caption);$('#context-captures').append(figure);}
 $('#native-contexts').hidden=false;
}).catch(()=>{});

// Small, on-demand readback for local calibration. It compares premultiplied
// bytes so antialiased edge storage does not inflate straight-alpha errors.
window.lgfCalibration.compareBackends=async(radii=[60])=>{
 if(!Array.isArray(radii)||!radii.length||radii.length>8||radii.some(r=>!Number.isFinite(r)||r<0||r>60))throw Error('Expected up to eight radii in [0,60]');
 const controller=new AbortController(),snapshot=await source.read({signal:controller.signal}),reports=[];
 for(const model of ['rounded-material-v1',...(localCandidate?['refractive-lens-v2']:[])])for(const radius of radii){
  const frames=[];
  for(const backend of ['cpu','webgl']){
   const engine=createOpticalRenderer({backend,surface:{radius,bevel:16,strength:72},sourceRect:{x:90,y:150,width:300,height:180},effects:{model,blurRadius:2,dispersion:.03,tint:[1,1,1,.08],rim:.04,specular:0},...(backend==='cpu'?{cpu:{executor:{worker:'off'}}}:{})});
   let frame;
   try{engine.initialize(controller.signal);frame=await engine.render({snapshot,width:200,height:120,dpr:1,rect:{x:0,y:0,width:200,height:120}},controller.signal);frames.push('canvas'in frame?frame.canvas.getContext('2d').getImageData(0,0,frame.width,frame.height).data.slice():frame.data.slice());}
   finally{frame?.release?.();engine.dispose();}
  }
  let maxPremultipliedDifference=0,total=0,overTwo=0;
  for(let i=0;i<frames[0].length;i++){const k=i%4,alpha=i-k+3,a=k===3?frames[0][i]:Math.round(frames[0][i]*frames[0][alpha]/255),b=k===3?frames[1][i]:Math.round(frames[1][i]*frames[1][alpha]/255),difference=Math.abs(a-b);maxPremultipliedDifference=Math.max(maxPremultipliedDifference,difference);total+=difference;if(difference>2)overTwo++;}
  reports.push({model,radius,pixels:24000,maxPremultipliedDifference,meanPremultipliedDifference:total/frames[0].length,channelsOverTwo:overTwo});
 }
 return{reports,physical:false};
};
