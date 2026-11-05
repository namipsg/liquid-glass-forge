import{createGlassScene}from'@liquid-glass-forge/dom';
import'./site-components.css';
import'./site-theme.css';

// Safari can evaluate the entry module before linked stylesheets are applied.
// Glass hosts need their styled display type before they can be attached.
if (document.readyState !== 'complete' &&
    [...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.sheet)) {
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
}

function animateDisclosures(root, signal) {
 const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
 for (const details of root.querySelectorAll('.project-questions > details, details.support-records')) {
  const summary = details.querySelector(':scope > summary');
  const body = details.querySelector(':scope > .disclosure-body');
  let animation, opening;

  function settle() {
   if (!animation) return;
   details.open = opening;
   animation.cancel();
   animation = undefined;
   delete details.dataset.disclosureMotion;
  }

  summary.addEventListener('click', event => {
   if (reducedMotion.matches || event.defaultPrevented) return;
   event.preventDefault();
   const from = details.open ? body.getBoundingClientRect().height : 0;
   opening = animation ? !opening : !details.open;
   animation?.cancel();

   // Keep the answer rendered until the closing transition reaches zero.
   details.open = true;
   const to = opening ? body.getBoundingClientRect().height : 0;
   details.dataset.disclosureMotion = opening ? 'opening' : 'closing';
   const current = body.animate([{ height: from + 'px' }, { height: to + 'px' }], {
    duration: 220,
    easing: 'cubic-bezier(.2, .7, .25, 1)',
   });
   animation = current;
   current.onfinish = () => { if (animation === current) settle(); };
  }, { signal });

  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) settle(); }, { signal });
  signal.addEventListener('abort', settle, { once: true });
 }
}

// No DOM capture: ordinary site controls use Forge's native CSS material.
// Optical examples keep their own explicit sources and renderer ownership.
export function mountSiteComponents(root=document){
 const selected=[...root.querySelectorAll('[data-site-glass]')].filter(e=>!e.parentElement?.closest('[data-site-glass]')),scenes=[],attachments=[],errors=[],controller=new AbortController();let disposed=false;
 animateDisclosures(root, controller.signal);
 const preferences=['(prefers-reduced-transparency: reduce)','(prefers-contrast: more)','(forced-colors: active)'].map(q=>matchMedia(q));
 const material=()=>preferences.some(m=>m.matches)?'opaque':'glass';
 for(let start=0;start<selected.length;start+=16){const scene=createGlassScene({onError:e=>errors.push(String(e))});scenes.push(scene);for(const element of selected.slice(start,start+16)){element.classList.add('site-glass');element.dataset.siteMaterial=material();attachments.push({element,attachment:scene.attach(element,{material:material()})});}scene.ready.catch(e=>errors.push(String(e)));}
 const apply=()=>{if(disposed)return;for(const{element,attachment}of attachments){element.dataset.siteMaterial=material();attachment.update({material:material()});}};
 preferences.forEach(p=>p.addEventListener('change',apply));
 const toggle=root.querySelector('#site-menu-toggle'),nav=root.querySelector('#site-navigation'),header=toggle?.closest('header');
 function closeMenu(){if(!toggle)return;toggle.setAttribute('aria-expanded','false');header.dataset.menuOpen='false';}
 if(toggle&&nav){toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));header.dataset.menuOpen=String(open);},{signal:controller.signal});nav.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();},{signal:controller.signal});header.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();toggle.focus();}},{signal:controller.signal});}
 const api={dispose(){if(disposed)return;disposed=true;controller.abort();preferences.forEach(p=>p.removeEventListener('change',apply));scenes.forEach(s=>s.dispose());},get diagnostics(){return{backend:'Forge CSS material',hosts:attachments.length,scenes:scenes.length,maxHostsPerScene:16,material:material(),errors:[...errors],disposed,targets:attachments.map(({element})=>({tag:element.tagName,id:element.id||null,label:element.getAttribute('aria-label')||element.textContent.trim().slice(0,60)}))};}};
 window.lgfSite=api;window.addEventListener('pagehide',e=>{if(e.persisted)scenes.forEach(s=>s.pause());else api.dispose();},{signal:controller.signal});window.addEventListener('pageshow',e=>{if(e.persisted&&!disposed)scenes.forEach(s=>s.resume());},{signal:controller.signal});return api;
}
