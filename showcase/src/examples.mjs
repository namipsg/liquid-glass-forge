import'@liquid-glass-forge/dom/styles.css';
import'./examples.css';
import{mountSiteComponents}from'./site-components.mjs';
const siteComponents=mountSiteComponents(document);
import{attachOptics}from'./example-optics.mjs';
import{createSafariDemo}from'./safari-demo.mjs';
import { createVideoDemo } from './video-demo.mjs';
import { cover } from './example-art.mjs';
import { landscapePhotos, loadLandscapePhotos } from './example-photos.mjs';
const $=s=>document.querySelector(s),stage=$('#example-stage'),release=await fetch(new URL('./release.json',document.baseURI)).then(r=>r.json()).catch(()=>null),localCandidate=release?.localCandidate===true,localMedia=localCandidate&&!release?.publicShowcase;
const paths={
 'player-play':'M7 4.5a.8.8 0 0 1 1.2-.7l12.2 7.5a.8.8 0 0 1 0 1.4L8.2 20.2A.8.8 0 0 1 7 19.5z',
 'player-pause':'M6.3 4.5h3.4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6.3a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zm8 0h3.4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-3.4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z',
 display:'M8 17H4.5A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5H16M12 15l4 5H8z',
 speaker:'M10 5L6 9H3v6h3l4 4zM14 9a4 4 0 0 1 0 6M17 6a8 8 0 0 1 0 12M20 3a12 12 0 0 1 0 18',
 'speaker-muted':'M10 5L6 9H3v6h3l4 4zM15 9l6 6M21 9l-6 6',
 close:'M5 5l14 14M19 5L5 19',pip:'M3 4h18v15H3zM12 12h8v6h-8zM6 7l4 4M10 7v4H6',rewind:'M11.7 4.1a8.9 8.9 0 1 1-5.4 1.9M12.1 1.2 8.3 4.1l3.8 2.9z',speed:'M5 17a8 8 0 1 1 14 0M12 13l4-4M7 12h.01M12 7h.01M17 12h.01',captions:'M3 4h18v13H11l-4 4v-4H3zM6 9h4m2 0h6M6 13h6m2 0h4',play:'M8 5l11 7-11 7z',pause:'M8 5v14M16 5v14',back:'M15 5l-7 7 7 7',forward:'M9 5l7 7-7 7',reload:'M20 9a8 8 0 1 0 0 6M20 3v6h-6',menu:'M3 12h.01M12 12h.01M21 12h.01',tabs:'M7 3h13v13H7zM4 8H3v13h13v-1',page:'M5 4h14v11H5zM5 19h14M5 22h8','page-actions':'M4 6h16M4 12h12M4 18h8',volume:'M11 5L6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',muted:'M11 5L6 9H3v6h3l5 4zM16 9l6 6M22 9l-6 6',fullscreen:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',heart:'M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13z',zoom:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l7 7M10 7v6M7 10h6',minus:'M5 12h14',plus:'M12 5v14M5 12h14',route:'M3 19l8-8-4-4 12-3-3 12-4-4-8 8z',next:'M5 5l10 7-10 7zM19 5v14',previous:'M19 5L9 12l10 7zM5 5v14',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l7 7',share:'M12 16V2M8 6l4-4 4 4M6 10H3v12h18V10h-3',sidebar:'M3 4h18v16H3zM9 4v16M5 8h1M5 11h1',wifi:'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0M12 20h.01'};
const icon=(name,cls='')=>`<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}"><path d="${paths[name]}"/></svg>`;
const button=(id,label,name,extra='')=>`<button id="${id}" aria-label="${label}" title="${label}" ${extra}>${icon(name)}</button>`;
const time=s=>`${Math.floor((s||0)/60)}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;
const metadata={safari:{title:'Safari on iPhone and iPad',eyebrow:'BROWSER STUDY',description:'Browse original sample pages on iPhone or iPad and see the glass toolbar react as you scroll.',instructions:['Scroll the page and watch the content through the address bar.','Choose a sample page from Favorites, or choose Apple.com and open the official site in a new tab.','Switch to iPad for a different browser layout. Use 100% to inspect at logical device size.'],caption:'Apple, Safari, iPhone and iPad are trademarks of Apple Inc. The browser mockup uses original sample content.'},video:{title:'Landscape video player',eyebrow:'VIDEO PLAYER',description:'A landscape phone player with live optical controls over the current frame.',instructions:['Play the film or jump ten seconds in either direction.','Scrub the timeline, adjust volume or change playback speed.','Playback pauses when you leave this example.'],caption:'The glass samples the video as it plays. Select Play to start.'},photos:{title:'Landscape photo gallery',eyebrow:'PHOTO VIEWER',description:'A photographic landscape collection with glass controls that leave the scenery visible.',instructions:['Choose a thumbnail or use the previous and next controls.','Favorite a study, or zoom into the artwork.','The toolbar samples the selected, zoomed image.'],caption:'Three original generated photographs. Try the gallery controls to see how the glass responds.'},music:{title:'Music player',eyebrow:'MUSIC PLAYER',description:'An original ambient sketch, with an honest playhead and a quiet glass player.',instructions:['Press play to hear Slow Light. Sound starts only after your click.','Seek, adjust volume or save the track.','The small audio-reactive background stops moving when paused.'],caption:'Slow Light / Forge Sessions. Original sixteen-second ambient loop.'},maps:{title:'Port Meridian map',eyebrow:'MAP EXPLORER',description:'Explore the streets and parks of a fictional waterfront, with searchable places, walking routes and refractive controls.',instructions:['Drag the map or use the zoom controls.','Search for a place and select it.','Show a walking route from the blue starting point.'],caption:'Port Meridian is an original fictional street map. Routes are for demonstration.'}};
let currentKind='',device='iphone',fullSize=false,active,scope,epoch=0,errors=[],disposedCount=0;
const onStatus=mode=>$('#demo-status').textContent=mode==='webgl'?'LIVE / FORGE WEBGL OPTICS':mode==='opaque'?'FORGE / OPAQUE PREFERENCE':'FORGE / CSS MATERIAL FALLBACK';
function lifecycle(){const controller=new AbortController(),cleanups=[];let dead=false;return{signal:controller.signal,on(target,name,fn,options={}){target.addEventListener(name,fn,{...options,signal:controller.signal});},own(fn){if(dead)fn();else cleanups.push(fn);},dispose(){if(dead)return;dead=true;controller.abort();for(const fn of cleanups.reverse())try{fn();}catch{}disposedCount++;}};}
function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function fitCanvas(c,root){const w=root.clientWidth,h=root.clientHeight,d=Math.min(1,1200/w,Math.sqrt(1000000/w/h));const cw=Math.max(1,Math.round(w*d)),ch=Math.max(1,Math.round(h*d));if(c.width!==cw||c.height!==ch){c.width=cw;c.height=ch;}}
function optical(root,source,s,material={}){return attachOptics(root,source,{signal:s.signal,localCandidate,...material,onStatus,onError:e=>errors.push(String(e))});}
async function browserDemo(s){return createSafariDemo({stage,scope:s,device,fullSize:()=>fullSize,localCandidate,onStatus,onError:e=>errors.push(String(e)),icon,button});}
function videoDemo(scope) {
  return createVideoDemo({ stage, scope, localMedia, optical, icon, button });
}
async function photosDemo(s){
 stage.innerHTML=`<div class="photo-stage demo-root"><canvas class="composite" role="img" aria-label="Surf around dark rocks on a Pacific coastline"></canvas><div class="photo-heading"><p>THE LANDSCAPE COLLECTION</p><h3 id="photo-title">Pacific coast</h3></div><div class="glass photo-top" data-glass>${button('photo-favorite','Favorite this study','heart','aria-pressed="false"')}${button('photo-zoom','Zoom into the artwork','zoom','aria-pressed="false"')}</div><div class="photo-thumbs">${landscapePhotos.map((photo,i)=>`<button data-photo="${i}" aria-label="View ${photo.name}" aria-pressed="${i===0}"><img src="${photo.file}" alt=""></button>`).join('')}</div><div class="glass photo-bottom" data-glass>${button('photo-previous','Previous image','back')}<span class="photo-counter" id="photo-counter">1 / 3</span>${button('photo-next','Next image','forward')}</div></div>`;
 const root=stage.querySelector('.demo-root'),c=root.querySelector('canvas'),ctx=c.getContext('2d',{alpha:false});c.width=900;c.height=1000;let index=0,zoom=false,layer;const saved=new Set(),images=await loadLandscapePhotos();
 const paint=()=>{fitCanvas(c,root);ctx.save();ctx.clearRect(0,0,c.width,c.height);if(zoom){ctx.translate(c.width/2,c.height/2);ctx.scale(1.8,1.8);ctx.translate(-c.width/2,-c.height/2);}cover(ctx,images[index],c.width,c.height);ctx.restore();$('#photo-title').textContent=landscapePhotos[index].name;$('#photo-counter').textContent=(index+1)+' / 3';$('#photo-favorite').setAttribute('aria-pressed',String(saved.has(index)));$('#photo-favorite').setAttribute('aria-label',saved.has(index)?'Remove favorite':'Favorite this study');$('#photo-favorite').innerHTML=icon('heart',saved.has(index)?'favorite-heart':'');$('#photo-zoom').setAttribute('aria-pressed',String(zoom));$('#photo-zoom').setAttribute('aria-label',zoom?'Return to full image':'Zoom into the artwork');root.querySelectorAll('[data-photo]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.photo)===index)));c.setAttribute('aria-label',landscapePhotos[index].description+(zoom?', zoomed':''));layer?.invalidate();};
 s.on(root,'click',e=>{const b=e.target.closest('[data-photo]');if(b){index=Number(b.dataset.photo);zoom=false;paint();}});s.on($('#photo-next'),'click',()=>{index=(index+1)%3;zoom=false;paint();});s.on($('#photo-previous'),'click',()=>{index=(index+2)%3;zoom=false;paint();});s.on($('#photo-zoom'),'click',()=>{zoom=!zoom;paint();});s.on($('#photo-favorite'),'click',()=>{if(saved.has(index))saved.delete(index);else saved.add(index);paint();});const resize=new ResizeObserver(paint);resize.observe(root);s.own(()=>resize.disconnect());paint();layer=await optical(root,c,s);s.own(()=>layer.dispose());
 return{root,sourceImage:()=>c.toDataURL('image/png'),pause:()=>layer.pause(),resume:()=>layer.resume(),get diagnostics(){return{index,zoom,favorites:[...saved],layer:layer.diagnostics};}};
}
async function musicDemo(s){
 stage.innerHTML=`<div class="music-stage demo-root"><canvas class="composite" aria-hidden="true"></canvas><div class="music-top"><span>FORGE SESSIONS</span><span>ORIGINAL RECORDING</span></div><img class="album-art" src="./media/slow-light-studio.jpg" alt="A vinyl record and frosted lamp in a recording studio"><audio id="demo-audio" preload="metadata" src="./media/slow-light.wav"></audio><div class="glass music-controls" data-glass><div class="music-title-row"><div><h3>Slow Light</h3><p>Forge Sessions · Ambient study</p></div>${button('music-save','Save track','heart','aria-pressed="false"')}</div><input id="music-seek" class="transport-seek" aria-label="Track position" type="range" min="0" max="16" step="0.05" value="0"><div class="music-time"><span id="music-current">0:00</span><span id="music-duration">0:16</span></div><div class="transport-row music-main">${button('music-back','Back five seconds','previous')}${button('music-play','Play Slow Light','play','class="music-play"')}${button('music-next','Forward five seconds','next')}</div><label class="music-volume">${icon('volume')}<span class="sr-only">Volume</span><input id="music-volume" type="range" min="0" max="1" step="0.01" value="0.35"></label><p id="music-message" class="sr-only" role="status"></p></div></div>`;
 const root=stage.querySelector('.demo-root'),a=$('#demo-audio'),c=root.querySelector('canvas'),ctx=c.getContext('2d',{alpha:false});c.width=620;c.height=775;a.volume=.35;let layer,raf=0,last=0,audioContext,analyser,bins,saved=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const album=root.querySelector('.album-art');await album.decode();const tile=canvas(500,500);cover(tile.getContext('2d'),album,500,500);
 const seek=$('#music-seek'),volume=$('#music-volume');
 const fillRange=element=>element.style.setProperty('--music-range-fill',`${100*Number(element.value)/Number(element.max)}%`);
 fillRange(volume);
 const paint=()=>{fitCanvas(c,root);cover(ctx,album,c.width,c.height);ctx.fillStyle="#10182b73";ctx.fillRect(0,0,c.width,c.height);const artBounds=album.getBoundingClientRect(),rootBounds=root.getBoundingClientRect();ctx.drawImage(tile,(artBounds.x-rootBounds.x)/rootBounds.width*c.width,(artBounds.y-rootBounds.y)/rootBounds.height*c.height,artBounds.width/rootBounds.width*c.width,artBounds.height/rootBounds.height*c.height);if(analyser&&!a.paused&&!reduced.matches){analyser.getByteFrequencyData(bins);ctx.fillStyle='#f1e6d658';for(let i=0;i<24;i++){const n=bins[i]/255;ctx.fillRect(36+i*23,c.height*.5,7,-n*70);}}layer?.invalidate();seek.value=a.currentTime;fillRange(seek);$('#music-current').textContent=time(a.currentTime);};
 const stop=()=>{cancelAnimationFrame(raf);raf=0;};const tick=now=>{raf=0;if(a.paused||s.signal.aborted)return;if(now-last>1000/24){paint();last=now;}raf=requestAnimationFrame(tick);};
 s.on($('#music-play'),'click',async()=>{try{if(!a.paused){a.pause();return;}if(!audioContext){const C=window.AudioContext||window.webkitAudioContext;if(C){audioContext=new C();analyser=audioContext.createAnalyser();analyser.fftSize=128;bins=new Uint8Array(analyser.frequencyBinCount);audioContext.createMediaElementSource(a).connect(analyser);analyser.connect(audioContext.destination);}}await audioContext?.resume();await a.play();}catch(e){$('#music-message').textContent='Playback unavailable: '+e.message;}});
 s.on(a,'play',()=>{$('#music-play').innerHTML=icon('pause');$('#music-play').setAttribute('aria-label','Pause Slow Light');stop();raf=requestAnimationFrame(tick);});s.on(a,'pause',()=>{stop();$('#music-play').innerHTML=icon('play');$('#music-play').setAttribute('aria-label','Play Slow Light');paint();});s.on(a,'ended',()=>{stop();$('#music-play').innerHTML=icon('play');$('#music-play').setAttribute('aria-label','Play Slow Light');paint();});s.on(a,'loadedmetadata',()=>{seek.max=a.duration;$('#music-duration').textContent=time(a.duration);});s.on(a,'seeked',paint);
 s.on(seek,'input',()=>{a.currentTime=Number(seek.value);fillRange(seek);});s.on(volume,'input',()=>{a.volume=Number(volume.value);fillRange(volume);});s.on($('#music-back'),'click',()=>a.currentTime=Math.max(0,a.currentTime-5));s.on($('#music-next'),'click',()=>a.currentTime=Math.min(a.duration||16,a.currentTime+5));s.on($('#music-save'),'click',()=>{saved=!saved;$('#music-save').setAttribute('aria-pressed',String(saved));$('#music-save').innerHTML=icon('heart',saved?'favorite-heart':'');$('#music-message').textContent=saved?'Track saved in this session.':'Track removed from saved.';});s.on(a,'error',()=>$('#music-message').textContent='The local audio could not load.');
 const resize=new ResizeObserver(paint);resize.observe(root);s.own(()=>resize.disconnect());paint();layer=await optical(root,c,s,{tint:[.42,.42,.42,.12],blurRadius:3,refractionScale:1.55});s.own(()=>{stop();a.pause();a.removeAttribute('src');a.load();audioContext?.close().catch(()=>{});layer.dispose();});
 return{root,sourceImage:()=>c.toDataURL('image/png'),pause(){a.pause();layer.pause();},resume:()=>layer.resume(),get diagnostics(){return{playing:!a.paused,time:a.currentTime,volume:a.volume,saved,frameCallback:!!raf,layer:layer.diagnostics};}};
}
async function mapsDemo(scope) {
  const basemap = new Image();
  basemap.src = './media/port-meridian-streets.svg';
  await basemap.decode();
  if (scope.signal.aborted) return;

  const places = [
    { name: 'Glasshouse Garden', kind: 'Botanical garden', x: 218, y: 240, via: [[345, 328], [292, 328], [292, 270], [242, 270]] },
    { name: 'Meridian Gallery', kind: 'Art gallery', x: 568, y: 193, via: [[394, 475], [491, 475], [491, 193]] },
    { name: 'The Reading Room', kind: 'Bookshop and café', x: 445, y: 351, via: [[345, 351]] },
    { name: 'Harbor Steps', kind: 'Riverside lookout', x: 603, y: 496, via: [[394, 475], [590, 475], [590, 506]] },
  ];
  stage.innerHTML = `<div class="map-stage demo-root">
    <canvas class="composite" role="img" tabindex="0" aria-label="Street map of fictional Port Meridian. Drag or use arrow keys to pan."></canvas>
    <label class="glass map-search" data-glass>${icon('search')}<input id="map-search" type="search" placeholder="Search Port Meridian" aria-label="Search places on the sample map" autocomplete="off"></label>
    <div class="map-results" hidden></div>
    <div class="glass map-zoom" data-glass>${button('map-in','Zoom in','plus')}${button('map-out','Zoom out','minus')}</div>
    <div class="glass map-place" data-glass>
      <div><h3 id="map-place-name"></h3><p id="map-place-kind"></p><p id="map-route-status" role="status"></p></div>
      <button id="map-route">${icon('route')}<span>Show walking route</span></button>
    </div>
  </div>`;
  const root = stage.querySelector('.map-stage');
  const c = root.querySelector('canvas');
  const ctx = c.getContext('2d', { alpha: false });
  const results = root.querySelector('.map-results');
  const search = root.querySelector('#map-search');
  const routeButton = root.querySelector('#map-route');
  const start = { x: 345, y: 475 };
  let layer, selected = 0, route = false, zoom = 1.16, drag, frame = 0, scale = 1;
  let offset = { x: 92, y: 12 }, visibleOffset = { x: 0, y: 0 };

  function point(x, y) {
    return { x: (x - 480 + visibleOffset.x) * scale + c.width / 2, y: (y - 360 + visibleOffset.y) * scale + c.height / 2 };
  }

  function paint() {
    frame = 0;
    fitCanvas(c, root);
    scale = Math.max(c.width / 960, c.height / 720) * zoom;
    const maxX = 480 - c.width / (2 * scale), maxY = 360 - c.height / (2 * scale);
    visibleOffset = { x: Math.max(-maxX, Math.min(maxX, offset.x)), y: Math.max(-maxY, Math.min(maxY, offset.y)) };
    const origin = point(0, 0);
    ctx.drawImage(basemap, origin.x, origin.y, 960 * scale, 720 * scale);
    if (route) {
      const place = places[selected], from = point(start.x, start.y);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      for (const [x, y] of [...place.via, [place.x, place.y]]) {
        const to = point(x, y);
        ctx.lineTo(to.x, to.y);
      }
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#0074ef';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    places.forEach((place, index) => {
      const at = point(place.x, place.y), isSelected = index === selected;
      ctx.beginPath();
      ctx.arc(at.x, at.y, isSelected ? 10 : 7, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#1678d4' : '#294763';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '600 12px system-ui';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(place.name, at.x + 14, at.y + 4);
      ctx.fillStyle = isSelected ? '#1264aa' : '#354957';
      ctx.fillText(place.name, at.x + 14, at.y + 4);
    });
    const from = point(start.x, start.y);
    ctx.beginPath();
    ctx.arc(from.x, from.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4296ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    layer?.invalidate();
  }

  function update() {
    root.querySelector('#map-place-name').textContent = places[selected].name;
    root.querySelector('#map-place-kind').textContent = places[selected].kind + ' · Port Meridian';
    root.querySelector('#map-route-status').textContent = route ? 'Sample route from the blue starting point.' : 'Fictional neighborhood · drag to explore';
    routeButton.setAttribute('aria-pressed', String(route));
    routeButton.querySelector('span').textContent = route ? 'Hide walking route' : 'Show walking route';
    paint();
  }

  scope.on(c, 'pointerdown', event => {
    if (event.button !== 0) return;
    c.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: { ...visibleOffset } };
  });
  scope.on(c, 'pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const bounds = c.getBoundingClientRect();
    offset = {
      x: drag.offset.x + (event.clientX - drag.x) * c.width / bounds.width / scale,
      y: drag.offset.y + (event.clientY - drag.y) * c.height / bounds.height / scale,
    };
    if (!frame) frame = requestAnimationFrame(paint);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) scope.on(c, event, () => { drag = undefined; });
  scope.on(c, 'keydown', event => {
    const direction = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] }[event.key];
    if (!direction) return;
    event.preventDefault();
    offset = { x: visibleOffset.x + direction[0] / scale, y: visibleOffset.y + direction[1] / scale };
    paint();
  });
  scope.on(root.querySelector('#map-in'), 'click', () => { zoom = Math.min(2.4, zoom + .2); paint(); });
  scope.on(root.querySelector('#map-out'), 'click', () => { zoom = Math.max(1, zoom - .2); paint(); });
  scope.on(routeButton, 'click', () => { route = !route; update(); });
  scope.on(search, 'input', () => {
    const query = search.value.trim().toLowerCase();
    results.replaceChildren();
    results.hidden = !query;
    if (!query) return;
    places.forEach((place, index) => {
      if (!place.name.toLowerCase().includes(query)) return;
      const option = document.createElement('button');
      option.dataset.place = index;
      option.textContent = place.name;
      results.append(option);
    });
    if (!results.childElementCount) results.textContent = 'No matching places.';
  });
  scope.on(results, 'click', event => {
    const option = event.target.closest('[data-place]');
    if (!option) return;
    selected = Number(option.dataset.place);
    offset = { x: 480 - places[selected].x, y: 360 - places[selected].y };
    search.value = places[selected].name;
    results.hidden = true;
    route = false;
    update();
  });
  scope.on(search, 'keydown', event => { if (event.key === 'Escape') results.hidden = true; });
  const resize = new ResizeObserver(paint);
  resize.observe(root);
  scope.own(() => { resize.disconnect(); cancelAnimationFrame(frame); layer?.dispose(); });
  update();
  layer = await optical(root, c, scope, { regular: true });
  return {
    root, sourceImage: () => c.toDataURL('image/png'), pause: () => layer.pause(), resume: () => layer.resume(),
    get diagnostics() { return { place: places[selected].name, zoom, offset: visibleOffset, route, frameCallback: !!frame, layer: layer.diagnostics }; },
  };
}
const constructors={safari:browserDemo,video:videoDemo,photos:photosDemo,music:musicDemo,maps:mapsDemo};
async function select(kind){
 if(!constructors[kind])kind='safari';const current=++epoch;scope?.dispose();scope=lifecycle();active=undefined;currentKind=kind;errors=[];$('#demo-status').textContent='Preparing glass…';stage.dataset.example=kind;const m=metadata[kind];$('#example-title').textContent=m.title;$('#example-eyebrow').textContent=m.eyebrow;$('#example-description').textContent=m.description;$('#example-caption').textContent=m.caption;$('#example-instructions').replaceChildren(...m.instructions.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));document.querySelectorAll('[data-example]').forEach(b=>{if(b.tagName==='BUTTON'){if(b.dataset.example===kind)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}});$('#device-controls').hidden=kind!=='safari';$('#native-review').hidden=true;const url=new URL(location.href);url.searchParams.set('example',kind);if(kind==='safari')url.searchParams.set('device',device);else url.searchParams.delete('device');history.replaceState(null,'',url);
 try{const instance=await constructors[kind](scope);if(current!==epoch){instance.root?.remove();return;}active=instance;await referenceControls();}catch(error){if(current!==epoch)return;errors.push(String(error));$('#demo-status').textContent='This example could not load. Try another example.';console.error(error);}
}
$('#example-chooser').addEventListener('click',e=>{const b=e.target.closest('[data-example]');if(b&&b.dataset.example!==currentKind)void select(b.dataset.example);});
$('#phone-view').addEventListener('click',()=>setDevice('iphone'));$('#tablet-view').addEventListener('click',()=>setDevice('ipad'));
function setDevice(next){device=next;$('#phone-view').setAttribute('aria-pressed',String(next==='iphone'));$('#tablet-view').setAttribute('aria-pressed',String(next==='ipad'));void select('safari');}
$('#device-scale').addEventListener('click',()=>{fullSize=!fullSize;$('#device-scale').setAttribute('aria-pressed',String(fullSize));$('#device-scale').textContent=fullSize?'Fit to view':'100% size';active?.fit?.();});
let referenceManifest;if(localMedia)try{referenceManifest=await fetch(new URL('./examples/references/index.json',document.baseURI)).then(r=>r.ok?r.json():null);}catch{}
async function referenceControls(){if(currentKind!=='safari'||!active||!localCandidate)return;const ref=referenceManifest?.references?.find(r=>r.deviceClass===device);if(!ref)return;const img=active.root.querySelector('.native-reference');img.src=new URL('./examples/references/'+ref.file,document.baseURI);img.hidden=false;img.style.opacity='0';$('#native-opacity').value=0;$('#native-opacity-value').value='0%';$('#native-review').hidden=false;$('#native-original').href=img.src;$('#native-reference-status').textContent=ref.runtime+' / '+ref.device+' / Simulator, not physical. Initial Safari state; material and icon differences remain open.';}
$('#native-opacity').addEventListener('input',e=>{const img=active?.root.querySelector('.native-reference');if(img)img.style.opacity=Number(e.target.value)/100;$('#native-opacity-value').value=e.target.value+'%';});$('#reference-backdrop').addEventListener('click',()=>active?.useReference?.());
document.addEventListener('visibilitychange',()=>{if(document.hidden)active?.pause();else active?.resume();});
window.lgfExamples={select,captureSource(){return localCandidate?active?.sourceImage?.():null;},get diagnostics(){return{kind:currentKind,device,localCandidate,errors:[...errors],disposedCount,active:active?.diagnostics??null};},dispose(){epoch++;scope?.dispose();siteComponents.dispose();active=undefined;}};
window.addEventListener('pagehide',e=>{if(e.persisted)active?.pause();else window.lgfExamples.dispose();});window.addEventListener('pageshow',e=>{if(e.persisted)active?.resume();});
const initial=new URL(location.href).searchParams;device=initial.get('device')==='ipad'?'ipad':'iphone';$('#phone-view').setAttribute('aria-pressed',String(device==='iphone'));$('#tablet-view').setAttribute('aria-pressed',String(device==='ipad'));await select(initial.get('example')||'safari');
