import { SourceProvider,createGlassScene } from '@liquid-glass-forge/dom';
import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
import '@liquid-glass-forge/dom/styles.css';
import './style.css';
import './sections.css';
import './code-editor.css';
import { renderCodeEditor } from './code-editor.mjs';
import { frameworkGuide, integrations } from './integration-examples.mjs';
import { filmTime, getShowcaseFilm } from './showcase-film.mjs';
import{mountSiteComponents}from'./site-components.mjs';
import{mountEnuiAnnouncement}from'./enui-announcement.mjs';
import { clearGlass } from './glass-material.mjs';
const siteComponents=mountSiteComponents(document);
const release=await fetch(new URL('./release.json',document.baseURI)).then(r=>r.ok?r.json():null).catch(()=>null),localCandidate=release?.localCandidate===true;
const enuiAnnouncement=mountEnuiAnnouncement({localCandidate});
void getShowcaseFilm(localCandidate&&!release?.publicShowcase).then(film => {
  const poster = document.querySelector('#video-card-poster');
  poster.src = film.poster;
  poster.alt = film.title + ' preview';
  document.querySelector('#video-card-duration').textContent = filmTime(film.duration);
});
const $=selector=>document.querySelector(selector),stage=$('#stage'),art=$('#source-art'),host=$('#glass-tool'),toolbar=$('#glass-toolbar');
const ctx=art.getContext('2d',{alpha:false}),backdrop=document.createElement('canvas'),backdropCtx=backdrop.getContext('2d',{alpha:false}),motion=matchMedia('(prefers-reduced-motion: reduce)'),transparency=matchMedia('(prefers-reduced-transparency: reduce)'),contrast=matchMedia('(prefers-contrast: more)'),forced=matchMedia('(forced-colors: active)');
const palettes={tidal:{base:'#18365d',light:'#e0f0ff',mid:'#84b9ed',deep:'#174b83',warm:'#c8dcfb'},bloom:{base:'#6b2647',light:'#ffe5b8',mid:'#e49983',deep:'#8e3c68',warm:'#ffd4a1'},dusk:{base:'#20295b',light:'#c8d6f9',mid:'#8999d4',deep:'#362565',warm:'#dfc9ea'}};
let palette='tidal',material='clear',backend='webgl',scene,toolbarScene,renderer,attachment,playing=false,animationFrame=0,lastDraw=0,phase=0,disposed=false,generation=0,pendingFrame=0;
let rendering=false,needsPaint=false,needsOptics=false,pendingPosition,materialTimer,cpuWorkTask;
const source=new SourceProvider({kind:'canvas',value:backdrop});
const diagnostics={errors:[],sourcePaints:0,completedRenders:0};
const whiteTint = () => material === 'regular' ? .55 : localCandidate ? clearGlass.tint[3] : .015;
function refreshInk(){
 const bounds=stage.getBoundingClientRect();if(!bounds.width||!bounds.height||!backdrop.width)return;
 for(const element of [document.querySelector('.lens-label'),document.querySelector('.lens-grip'),...toolbar.querySelectorAll('button')]){
  if(!element)continue;const r=element.getBoundingClientRect(),x=Math.max(0,Math.min(backdrop.width-1,Math.round((r.x+r.width/2-bounds.x)/bounds.width*backdrop.width))),y=Math.max(0,Math.min(backdrop.height-1,Math.round((r.y+r.height/2-bounds.y)/bounds.height*backdrop.height))),d=backdropCtx.getImageData(x,y,1,1).data;
  const linear=n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},l=.2126*linear(d[0])+.7152*linear(d[1])+.0722*linear(d[2]);
  const tint=whiteTint(),inkDark=l*(1-tint)+tint>.2;
  element.style.setProperty('--surface-ink',inkDark?'#09182b':'#f7fbff');element.style.setProperty('--surface-shadow',inkDark?'0 1px 1px #ffffff50':'0 1px 3px #07122060');
 }
}
function paint(time=0){
  const p=palettes[palette],width=stage.clientWidth,height=stage.clientHeight;
  // The explicit source composites the visible art and these known text nodes.
  // Native text remains sharp outside the lens; CPU capture stays bounded.
  const density=Math.min(1,960/width,Math.sqrt(230400/width/height));
  const w=Math.max(1,Math.floor(width*density)),h=Math.max(1,Math.floor(height*density));
  if(art.width!==w||art.height!==h){art.width=w;art.height=h;}
  ctx.setTransform(w/640,0,0,h/360,0,0);
  ctx.fillStyle=p.base;ctx.fillRect(0,0,640,360);
  const base=ctx.createLinearGradient(0,360,610,0);base.addColorStop(0,p.deep);base.addColorStop(.43,p.mid);base.addColorStop(.74,p.light);base.addColorStop(1,p.warm);ctx.fillStyle=base;
  ctx.beginPath();ctx.moveTo(-80,350);ctx.bezierCurveTo(80,190+Math.sin(time)*18,400,380,700,-120);ctx.lineTo(720,440);ctx.lineTo(-80,440);ctx.fill();
  const top=ctx.createLinearGradient(0,0,560,300);top.addColorStop(0,p.light);top.addColorStop(.52,p.mid);top.addColorStop(1,p.base);ctx.fillStyle=top;
  ctx.beginPath();ctx.moveTo(-90,-60);ctx.lineTo(750,-60);ctx.bezierCurveTo(540,80,450,60+Math.cos(time)*22,240,225);ctx.bezierCurveTo(80,350,-70,280,-90,150);ctx.closePath();ctx.fill();
  ctx.save();ctx.globalAlpha=.35;ctx.strokeStyle=p.light;ctx.lineWidth=.8;
  for(let i=0;i<16;i++){ctx.beginPath();ctx.moveTo(-70,85+i*7);ctx.bezierCurveTo(150,390,390,-10+i*8,730,-90+i*13);ctx.stroke();}ctx.restore();
  const glow=ctx.createRadialGradient(490+Math.sin(time)*35,110,0,490,110,260);glow.addColorStop(0,p.light+'5e');glow.addColorStop(1,p.light+'00');ctx.fillStyle=glow;ctx.fillRect(0,0,640,360);
  ctx.setTransform(1,0,0,1,0,0);
  if(backdrop.width!==w||backdrop.height!==h){backdrop.width=w;backdrop.height=h;}
  backdropCtx.setTransform(1,0,0,1,0,0);backdropCtx.drawImage(art,0,0);
  backdropCtx.setTransform(w/width,0,0,h/height,0,0);
  stage.style.setProperty('--source-type-size',Math.min(112,width*.15)+'px');
  const bounds=stage.getBoundingClientRect();
  for(const node of document.querySelectorAll('.backdrop-title span,.backdrop-note')){
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    backdropCtx.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
    backdropCtx.fillStyle=style.color;backdropCtx.textBaseline='alphabetic';
    backdropCtx.letterSpacing=style.letterSpacing==='normal'?'0px':style.letterSpacing;
    const metrics=backdropCtx.measureText(node.textContent),size=parseFloat(style.fontSize);
    const ascent=metrics.fontBoundingBoxAscent??size*.8,descent=metrics.fontBoundingBoxDescent??size*.2;
    const baseline=(parseFloat(style.lineHeight)-ascent-descent)/2+ascent;
    backdropCtx.fillText(node.textContent,rect.left-bounds.left,rect.top-bounds.top+baseline);
  }
  backdropCtx.setTransform(1,0,0,1,0,0);
  refreshInk();source.invalidate();diagnostics.sourcePaints++;
}
function reduced(){return transparency.matches||contrast.matches||forced.matches;}
function stopAnimation(){clearTimeout(cpuWorkTask);cpuWorkTask=undefined;cancelAnimationFrame(animationFrame);animationFrame=0;playing=false;$('#play-light').setAttribute('aria-pressed','false');$('#play-light').innerHTML='<span aria-hidden="true">▶</span> Animate backdrop';}
function animate(timestamp){
  if(disposed||!playing||document.hidden||motion.matches)return;
  // RAF seeds motion; the local interactive CPU path continues after completed
  // work so an almost-ready frame does not miss a full display callback.
  if(!rendering&&!pendingFrame&&!cpuWorkTask)advanceAnimation(timestamp);
  animationFrame=requestAnimationFrame(animate);
}
function advanceAnimation(timestamp){phase+=Math.min(.05,(timestamp-(lastDraw||timestamp))/1000)*.7;lastDraw=timestamp;paint(phase);}
function flushInvalidation(){
  pendingFrame=0;if(disposed)return false;
  // Pointer geometry follows the display even while CPU optics are pending.
  if(pendingPosition){host.style.left=pendingPosition.x+'px';host.style.top=pendingPosition.y+'px';pendingPosition=undefined;refreshInk();}
  if(rendering){pendingFrame=requestAnimationFrame(flushInvalidation);return false;}
  let changed=false;
  if(needsPaint){needsPaint=false;paint(phase);changed=true;}else if(needsOptics){attachment?.invalidate();changed=true;}
  needsOptics=false;return changed;
}
function scheduleInvalidation(repaint=false){
  needsPaint||=repaint;needsOptics=true;
  if(!pendingFrame&&!disposed)pendingFrame=requestAnimationFrame(flushInvalidation);
}
function scheduleCpuWork(current){
  if(!localCandidate||backend!=='cpu'||disposed||document.hidden||current!==generation||cpuWorkTask||(!needsOptics&&!needsPaint&&!playing))return;
  // A task boundary lets the scene present/release the completed frame first.
  cpuWorkTask=setTimeout(()=>{
    cpuWorkTask=undefined;
    if(disposed||document.hidden||current!==generation||rendering)return;
    if(pendingFrame){cancelAnimationFrame(pendingFrame);pendingFrame=0;}
    const changed=flushInvalidation();
    if(!changed&&playing&&!motion.matches)advanceAnimation(performance.now());
  },0);
}
function position(x,y){const maxX=Math.max(18,stage.clientWidth-host.offsetWidth-18),maxY=Math.max(18,stage.clientHeight-host.offsetHeight-90);pendingPosition={x:Math.max(18,Math.min(x,maxX)),y:Math.max(18,Math.min(y,maxY))};scheduleInvalidation();}
function center(){position(stage.clientWidth*.55-host.offsetWidth/2,stage.clientHeight*.48-host.offsetHeight/2);}
function observedRenderer(optical,current){
  const batch=async(requests,signal)=>{
    if(current===generation)rendering=true;
    try{const frames=await optical.renderBatch(requests,signal);if(current===generation)diagnostics.completedRenders++;return frames;}
    finally{if(current===generation){rendering=false;scheduleCpuWork(current);}}
  };
  return{initialize:signal=>optical.initialize(signal),render:(request,signal)=>batch([request],signal).then(frames=>frames[0]),renderBatch:batch,releaseSurface:id=>optical.releaseSurface(id)};
}
async function mount(){
  const current=++generation;rendering=false;scene?.dispose();toolbarScene?.dispose();renderer?.dispose();scene=toolbarScene=renderer=attachment=undefined;
  const opaque=backend==='opaque'||reduced();host.dataset.opaque=String(opaque);host.dataset.material=material;toolbar.dataset.opaque=String(opaque);
  try{
    if(opaque){scene=createGlassScene();attachment=scene.attach(host,{material:'opaque'});scene.attach(toolbar,{material:'opaque'});await scene.ready;$('#engine-status').textContent=reduced()?'OPAQUE / ACCESSIBILITY PREFERENCE':'OPAQUE MATERIAL';return;}
    const quality=backend==='cpu'?(localCandidate?{maxWidth:256,maxHeight:160,maxPixels:40960}:{maxWidth:320,maxHeight:180,maxPixels:57600}):{maxWidth:900,maxHeight:600,maxPixels:540000};
    renderer=createOpticalRenderer({backend,quality,
      surface:request=>{
        const scale=Math.min(1,quality.maxWidth/request.width,quality.maxHeight/request.height,Math.sqrt(quality.maxPixels/request.width/request.height));
        const width=Math.max(1,Math.floor(request.width*scale)),height=Math.max(1,Math.floor(request.height*scale)),pixelsPerCss=Math.min(width/request.rect.width,height/request.rect.height);
        // Match public request geometry to the known toolbar rather than relying
        // on scene-generated IDs. Both surfaces share one source and renderer.
        const box=toolbar.getBoundingClientRect(),isToolbar=Math.abs(request.rect.x-box.x)<.5&&Math.abs(request.rect.y-box.y)<.5&&Math.abs(request.rect.width-box.width)<.5&&Math.abs(request.rect.height-box.height)<.5;
        return{radius:Math.min((isToolbar?box.height/2:Number($('#rounding').value))*pixelsPerCss,width/2,height/2),bevel:(isToolbar?8:material==='regular'?request.rect.height*2/3:localCandidate?request.rect.height*(clearGlass.bevel/120):Math.min(request.rect.width,request.rect.height)*.48)*pixelsPerCss,strength:(isToolbar?12:Number($('#refraction').value))*pixelsPerCss};
      },
      sourceRect: request => {
        const bounds = stage.getBoundingClientRect();
        const { width, height } = request.snapshot.source;
        const x = Math.max(0, Math.min(width - 1, (request.rect.x - bounds.x) / bounds.width * width));
        const y = Math.max(0, Math.min(height - 1, (request.rect.y - bounds.y) / bounds.height * height));
        return {
          x, y,
          width: Math.min(width - x, request.rect.width / bounds.width * width),
          height: Math.min(height - y, request.rect.height / bounds.height * height),
        };
      },
      effects:{model:localCandidate&&material==='clear'?'refractive-lens-v2':'rounded-material-v1',blurRadius:material==='regular'?Math.min(16,Math.max(1,Math.round(8/1.5*backdrop.width/stage.clientWidth))):localCandidate?Math.max(0,Math.round(clearGlass.blurRadius/1.5*backdrop.width/stage.clientWidth)):0,dispersion:Number($('#dispersion').value)/100,tint:[1,1,1,whiteTint()],rim:material==='regular'?.1:localCandidate?clearGlass.rim:.14,specular:material==='regular'||localCandidate?0:.3},
      ...(backend==='cpu'?{cpu:{quality:{...quality,...(localCandidate?{cadence:'interactive',maxUpdatesPerSecond:60}:{})},executor:{worker:'auto'}}}:{})});
    scene=createGlassScene({source,renderer:observedRenderer(renderer,current),onError:error=>{if(current!==generation)return;stopAnimation();diagnostics.errors.push({code:error.code,message:String(error)});$('#engine-status').textContent='OPTICAL RENDERER UNAVAILABLE — TRY OPAQUE';}});
    attachment=scene.attach(host);
    // The current CPU adapter paces each surface separately. Use Forge's CSS
    // material for the controls so the lens keeps its explicit 60 Hz budget.
    if(backend==='cpu'){toolbarScene=createGlassScene();toolbarScene.attach(toolbar);await toolbarScene.ready;}else scene.attach(toolbar);
    await scene.ready;if(current!==generation)return;
    $('#engine-status').textContent=backend==='webgl'?'LIVE / WEBGL2 OPTICS':(localCandidate?'CPU LENS / CSS GLASS CONTROLS':'LIVE / CPU · UP TO 30 FPS');
  }catch(error){if(current!==generation)return;stopAnimation();diagnostics.errors.push({code:error.code,message:String(error)});scene?.dispose();toolbarScene?.dispose();toolbarScene=undefined;renderer?.dispose();scene=createGlassScene();attachment=scene.attach(host,{material:'opaque'});scene.attach(toolbar,{material:'opaque'});host.dataset.opaque=toolbar.dataset.opaque='true';$('#engine-status').textContent='OPTICS UNAVAILABLE / OPAQUE FALLBACK';}
}
for(const button of document.querySelectorAll('[data-scene]'))button.addEventListener('click',()=>{palette=button.dataset.scene;for(const b of document.querySelectorAll('[data-scene]'))b.setAttribute('aria-pressed',String(b===button));$('#scene-name').textContent=palette.toUpperCase();scheduleInvalidation(true);});
$('#material').addEventListener('change',()=>{material=$('#material').value;$('#material-description').textContent=material==='regular'?'Softened color. Crisp controls. Explore the regular material.':'Clear center. Deep edges. A live lens and working glass toolbar.';$('#refraction').value=material==='regular'?0:72;$('#refraction-value').value=$('#refraction').value;$('#dispersion').value=material==='regular'?4:localCandidate?3:8;$('#dispersion-value').value=$('#dispersion').value;void mount();});
for(const button of document.querySelectorAll('[data-backend]'))button.addEventListener('click',()=>{backend=button.dataset.backend;for(const b of document.querySelectorAll('[data-backend]'))b.setAttribute('aria-pressed',String(b===button));void mount();});
for(const id of ['refraction','rounding'])$('#'+id).addEventListener('input',event=>{$('#'+id+'-value').value=event.target.value;host.style.borderRadius=$('#rounding').value+'px';scheduleInvalidation();});
function applyDispersion(){clearTimeout(materialTimer);materialTimer=undefined;if(!disposed)void mount();}
$('#dispersion').addEventListener('input',event=>{$('#dispersion-value').value=event.target.value;clearTimeout(materialTimer);materialTimer=setTimeout(applyDispersion,150);});
$('#dispersion').addEventListener('change',applyDispersion);
$('#reset-position').addEventListener('click',center);
$('#play-light').addEventListener('click',()=>{if(playing){stopAnimation();return;}if(motion.matches)return;playing=true;$('#play-light').setAttribute('aria-pressed','true');$('#play-light').innerHTML='<span aria-hidden="true">Ⅱ</span> Pause backdrop';lastDraw=0;animationFrame=requestAnimationFrame(animate);});
const handle=$('#drag-handle');let drag;
handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;handle.setPointerCapture(event.pointerId);drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:host.offsetLeft,top:host.offsetTop};});
handle.addEventListener('pointermove',event=>{if(drag?.pointer!==event.pointerId)return;position(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,()=>{drag=undefined;});
handle.addEventListener('keydown',event=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},vector=directions[event.key];if(!vector)return;event.preventDefault();const step=event.shiftKey?20:5;position((pendingPosition?.x??host.offsetLeft)+vector[0]*step,(pendingPosition?.y??host.offsetTop)+vector[1]*step);});
function preferences(){if(motion.matches)stopAnimation();$('#play-light').disabled=motion.matches;$('#preference-note').textContent=motion.matches?'Reduced motion respected · Keyboard friendly':'Keyboard friendly · Motion is optional';void mount();}
for(const preference of [motion,transparency,contrast,forced])preference.addEventListener('change',preferences);
document.addEventListener('visibilitychange',()=>{if(disposed)return;if(document.hidden){stopAnimation();scene?.pause();toolbarScene?.pause();}else{scene?.resume();toolbarScene?.resume();}});
const resize=new ResizeObserver(()=>{position(host.offsetLeft,host.offsetTop);scheduleInvalidation(true);});resize.observe(stage);
const intersection=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){if(!document.hidden){scene?.resume();toolbarScene?.resume();}}else{stopAnimation();scene?.pause();toolbarScene?.pause();}},{threshold:.05});intersection.observe(stage);
const integrationNames = Object.keys(integrations);
const version = release?.installVersion ?? release?.version;
const installable = release?.installable && /^\d+\.\d+\.\d+-rc\.\d+$/.test(version);
let example;
let installCommand = '';
let webglCommand = '';

function installPackages(packages) {
  return 'npm install ' + packages.map(name => '@liquid-glass-forge/' + name + '@' + version).join(' ');
}

function selectCode(name, focus = false) {
  example = name;
  const integration = integrations[name];
  for (const button of document.querySelectorAll('[data-code]')) {
    const active = button.dataset.code === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }
  $('#framework-setup').setAttribute('aria-labelledby', 'tab-' + name);
  $('#framework-install-title').textContent = '1. Install for ' + integration.label;
  const requirements = $('#framework-requirements');
  requirements.hidden = !integration.requirements;
  requirements.textContent = integration.requirements ? 'Requires ' + integration.requirements + '.' : '';
  $('#framework-setup-note').textContent = integration.setup;
  $('#framework-guide').href = frameworkGuide + '#' + name;
  $('#webgl-guide').href = frameworkGuide + (name === 'react' ? '#react-with-webgl-refraction' : '#add-webgl-refraction');
  renderCodeEditor(integration.filename, integration.source.trimEnd());
  if (installable) {
    installCommand = installPackages(integration.packages);
    $('#install-command').textContent = installCommand;
    webglCommand = installPackages([...integration.packages, 'webgl']);
    $('#webgl-command').textContent = webglCommand;
  }
  $('#copy-status').textContent = '';
}

for (const button of document.querySelectorAll('[data-code]')) {
  button.addEventListener('click', () => selectCode(button.dataset.code));
  button.addEventListener('keydown', event => {
    const i = integrationNames.indexOf(example);
    const next = {
      ArrowRight: integrationNames[(i + 1) % integrationNames.length],
      ArrowLeft: integrationNames[(i + integrationNames.length - 1) % integrationNames.length],
      Home: integrationNames[0],
      End: integrationNames.at(-1),
    }[event.key];
    if (!next) return;
    event.preventDefault();
    selectCode(next, true);
  });
}

for (const link of document.querySelectorAll('[data-select-code]')) {
  link.addEventListener('click', () => selectCode(link.dataset.selectCode));
}

async function copySetup(text, success, fallback) {
  try {
    await navigator.clipboard.writeText(text);
    $('#copy-status').textContent = success;
  } catch {
    $('#copy-status').textContent = 'Select and copy the text with your keyboard.';
    $(fallback).focus();
  }
}

$('#copy-code').addEventListener('click', () => copySetup(integrations[example].source.trimEnd(), 'Starter copied.', '#code-example'));
$('#copy-install').addEventListener('click', () => copySetup(installCommand, 'Install command copied.', '#install-command'));
$('#copy-webgl').addEventListener('click', () => copySetup(webglCommand, 'WebGL install command copied.', '#webgl-command'));
const initialFramework = new URL(location.href).searchParams.get('framework');
selectCode(integrationNames.includes(initialFramework) ? initialFramework : 'vanilla');

if (installable) {
  $('#install-preview').hidden = $('#webgl-preview').hidden = false;
  $('#release-status').textContent = 'Experimental ' + version + ' is on npm. ' + (release.publicShowcase ? 'This showcase includes newer renderer work. ' : '') + 'Device and performance qualification remain open.';
  for (const name of ['core', 'cpu', 'dom', 'webgl', 'react', 'vue', 'angular']) {
    const link = document.createElement('a');
    link.href = 'https://www.npmjs.com/package/@liquid-glass-forge/' + name + '/v/' + version;
    link.textContent = '@liquid-glass-forge/' + name;
    $('#package-links').append(link);
  }
} else if (localCandidate) {
  $('#release-status').textContent = 'Local material candidate. Find the published install commands in the quick start guide.';
}

if (localCandidate) { $('#dispersion').value = 3; $('#dispersion-value').value = 3; }
paint();
center();
preferences();
window.lgfShowcase={get diagnostics(){return{...diagnostics,localCandidate,material,backend,toolbarBackend:toolbar.dataset.opaque==='true'?'opaque':backend==='cpu'?'css':'webgl',renderer:renderer?.diagnostics,playing,disposed};},center,dispose(){if(disposed)return;disposed=true;generation++;stopAnimation();clearTimeout(materialTimer);cancelAnimationFrame(pendingFrame);resize.disconnect();intersection.disconnect();siteComponents.dispose();enuiAnnouncement.dispose();scene?.dispose();toolbarScene?.dispose();renderer?.dispose();source.destroy();}};
window.addEventListener('pagehide',event=>{if(event.persisted){stopAnimation();scene?.pause();toolbarScene?.pause();}else window.lgfShowcase.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!disposed){scene?.resume();toolbarScene?.resume();}});
