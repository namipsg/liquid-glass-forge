import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from '@playwright/test';
import {sourceServers} from './source-server.mjs';
for(const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  test(`${name}: stable host keeps native controls, selection, image drag and restores ownership`,{timeout:60000},async()=>{
    const servers=await sourceServers();let browser;const receipt={browser:name,checks:[]};
    try {
      browser=await engine.launch();receipt.version=browser.version();const page=await browser.newPage();await page.goto(servers.origin);
      await page.setContent(`<link rel="stylesheet" href="${servers.origin}/styles.css"><div id="host" style="width:280px;height:180px;left:20px"><a id="link" href="#clicked">Native link</a><input id="input" value="native"><p><span id="text">Selectable native text here</span></p><img id="image" draggable="true" src="${servers.origin}/fixture.png" width="30" height="30"></div>`);
      await page.waitForFunction(()=>document.querySelector('#image').complete);
      const initial=await page.evaluate(async origin=>{
        const {mountGlassHost}=await import(`${origin}/dom.js`);const element=document.querySelector('#host'),children=[...element.children];
        const before=element.getBoundingClientRect().toJSON();window.beforeHostHTML=element.outerHTML;
        window.host=mountGlassHost(element);window.dragCount=0;document.querySelector('#image').addEventListener('dragstart',()=>window.dragCount++);
        const after=element.getBoundingClientRect().toJSON();const canvas=window.host.target;
        return {before,after,unchanged:children.every((c,i)=>element.children[i+1]===c),aria:canvas.getAttribute('aria-hidden'),pointer:getComputedStyle(canvas).pointerEvents};
      },servers.origin);
      assert.deepEqual(initial.before,initial.after);assert.equal(initial.unchanged,true);assert.equal(initial.aria,'true');assert.equal(initial.pointer,'none');
      await page.click('#link');assert.ok(page.url().endsWith('#clicked'));
      await page.fill('#input','keyboard');await page.focus('#input');await page.keyboard.press('ControlOrMeta+A');
      assert.deepEqual(await page.$eval('#input',e=>[document.activeElement===e,e.selectionStart,e.selectionEnd]),[true,0,8]);
      const box=await page.locator('#text').boundingBox();await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:8});await page.mouse.up();
      assert.ok((await page.evaluate(()=>getSelection().toString())).length>5);
      const image=await page.locator('#image').boundingBox();await page.mouse.move(image.x+12,image.y+12);await page.mouse.down();await page.mouse.move(image.x+90,image.y+60,{steps:12});await page.mouse.up();assert.ok(await page.evaluate(()=>window.dragCount>0));
      // Isolate native capture from the preceding OS/browser image-drag sequence.
      const pointerPage=await browser.newPage();await pointerPage.goto(servers.origin);
      await pointerPage.evaluate(async()=>{const {mountGlassHost}=await import('/dom.js');document.body.innerHTML='<div id="capture-host" style="width:240px;height:120px"><input id="capture-input" value="native"></div>';window.captureHost=mountGlassHost(document.querySelector('#capture-host'));window.captureEvents=[];const e=document.querySelector('#capture-input');e.addEventListener('pointerdown',event=>{window.capturePointer=event.pointerId;e.setPointerCapture(event.pointerId);},{once:true});for(const type of ['gotpointercapture','lostpointercapture','pointercancel'])e.addEventListener(type,event=>window.captureEvents.push({type,trusted:event.isTrusted}));});
      const control=await pointerPage.locator('#capture-input').boundingBox();await pointerPage.mouse.move(control.x+8,control.y+8);await pointerPage.mouse.down();await pointerPage.mouse.move(control.x+10,control.y+8);
      await pointerPage.evaluate(()=>{const e=document.querySelector('#capture-input');e.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:window.capturePointer}));if(e.hasPointerCapture(window.capturePointer))e.releasePointerCapture(window.capturePointer);});
      await pointerPage.mouse.move(control.x+12,control.y+8);await pointerPage.mouse.up();await pointerPage.waitForFunction(()=>window.captureEvents.some(e=>e.type==='lostpointercapture'),undefined,{timeout:5000});
      receipt.capture=await pointerPage.evaluate(()=>window.captureEvents);assert.deepEqual(receipt.capture.map(e=>e.type).sort(),['gotpointercapture','lostpointercapture','pointercancel']);assert.ok(receipt.capture.filter(e=>e.type!=='pointercancel').every(e=>e.trusted));
      await pointerPage.fill('#capture-input','after cancel');assert.equal(await pointerPage.inputValue('#capture-input'),'after cancel');await pointerPage.evaluate(()=>captureHost.dispose());await pointerPage.close();await page.bringToFront();
      await page.fill('#input','still usable');assert.equal(await page.inputValue('#input'),'still usable');
      receipt.checks.push('native click/focus/keyboard/text selection/image drag and cancel/capture events; no layout shift or canvas interception');
      const restored=await page.evaluate(()=>{const element=document.querySelector('#host');document.querySelector('#input').value='native';host.present({width:1,height:1,data:new Uint8Array([255,0,0,255])});const pixel=[...host.target.getContext('2d').getImageData(0,0,1,1).data];host.dispose();host.dispose();return {pixel,html:element.outerHTML,before:window.beforeHostHTML};});
      assert.deepEqual(restored.pixel,[255,0,0,255]);assert.equal(restored.html,restored.before);
      receipt.checks.push('generated target pixels and exact original host markup/style restoration');
      const supplied=await page.evaluate(async origin=>{
        const {mountGlassHost}=await import(`${origin}/dom.js`);const root=document.querySelector('#host'),c=document.createElement('canvas');c.width=2;c.height=1;c.className='application';c.style.cssText='width:11px;height:12px;pointer-events:auto;position:relative';c.setAttribute('aria-hidden','false');c.tabIndex=3;root.append(c);
        const ctx=c.getContext('2d');ctx.putImageData(new ImageData(new Uint8ClampedArray([10,20,30,255,40,50,60,255]),2,1),0,0);const before=c.outerHTML;
        const h=mountGlassHost(root,{target:c,material:'opaque'});let invalid=false,duplicate=false;
        try{h.present({width:4000001,height:1,data:new Uint8Array(4)});}catch(e){invalid=e.code==='INVALID_PIXELS';}
        try{mountGlassHost(root);}catch(e){duplicate=e.code==='INVALID_HOST';}
        h.present({width:1,height:1,data:new Uint8Array([0,255,0,255])});h.clear();h.dispose();
        const attrs=[...c.attributes].filter(a=>a.name!=='style').map(a=>[a.name,a.value]).sort();
        const copy=document.createElement('div');copy.innerHTML=before;const original=copy.firstChild;
        const expectedAttrs=[...original.attributes].filter(a=>a.name!=='style').map(a=>[a.name,a.value]).sort();
        const keys=new Set([...c.style,...original.style]);const styles=[...keys].every(k=>c.style.getPropertyValue(k)===original.style.getPropertyValue(k)&&c.style.getPropertyPriority(k)===original.style.getPropertyPriority(k));
        const pixels=[...c.getContext('2d').getImageData(0,0,2,1).data];c.remove();
        const previous=root.outerHTML,prepend=root.prepend;root.prepend=()=>{throw new Error('allocation fault');};let rolled=false;try{mountGlassHost(root);}catch{rolled=true;}root.prepend=prepend;
        const rollback=previous===root.outerHTML;
        const app=mountGlassHost(root);root.style.width='300px';app.dispose();const appWidth=root.style.width;root.style.width='280px';
        return {invalid,duplicate,attrs,expectedAttrs,styles,pixels,rolled,rollback,appWidth};
      },servers.origin);
      assert.equal(supplied.invalid,true);assert.equal(supplied.duplicate,true);assert.deepEqual(supplied.attrs,supplied.expectedAttrs);assert.equal(supplied.styles,true);assert.deepEqual(supplied.pixels,[10,20,30,255,40,50,60,255]);assert.equal(supplied.rolled,true);assert.equal(supplied.rollback,true);assert.equal(supplied.appWidth,'300px');
      receipt.checks.push('supplied backing/style/attributes restored, bounds/duplicate/partial allocation rollback and later application style changes preserved');
      const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(servers.origin);
      await nojs.setContent(`<link rel="stylesheet" href="${servers.origin}/styles.css"><div class="lgf-host" style="width:260px;height:100px"><canvas class="lgf-surface" data-lgf-material="opaque" aria-hidden="true" role="presentation" tabindex="-1"></canvas><label>Native baseline <input id="plain"></label></div>`);
      await nojs.locator('link').evaluate(e=>e.sheet!==null);await nojs.fill('#plain','without JS');assert.equal(await nojs.inputValue('#plain'),'without JS');
      const baseline=await nojs.$eval('canvas',c=>({pointer:getComputedStyle(c).pointerEvents,filter:getComputedStyle(c).backdropFilter,bg:getComputedStyle(c).backgroundColor}));assert.equal(baseline.pointer,'none');assert.equal(baseline.filter,'none');assert.notEqual(baseline.bg,'rgba(0, 0, 0, 0)');
      await nojs.close();receipt.checks.push('packed-style declarative opaque baseline and native input work with page JavaScript disabled');receipt.status='passed';
    }catch(e){receipt.status='failed';receipt.error=e.stack;throw e;}finally{await browser?.close();await servers.close();const base=new URL('../private/phase-4/host/',import.meta.url);await mkdir(base,{recursive:true});const dir=await mkdtemp(new URL(`run-${name}-`,base));await writeFile(`${dir}/receipt.json`,JSON.stringify(receipt,null,2));}
  });
}
