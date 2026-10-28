import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from '@playwright/test';
import {sourceServers} from './source-server.mjs';
for(const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  test(`${name}: shared dirty/visibility scheduling, bounded faults and late-result cleanup`,{timeout:60000},async()=>{
    const servers=await sourceServers();let browser;const receipt={browser:name};
    try {
      browser=await engine.launch();receipt.version=browser.version();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(servers.origin);
      receipt.result=await page.evaluate(async()=>{
        const {createGlassScene,SourceProvider}=await import('/dom.js');
        const assert=(v,m)=>{if(!v)throw new Error(m);};
        const original={setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,setInterval:window.setInterval,requestAnimationFrame:window.requestAnimationFrame,queueMicrotask:window.queueMicrotask};
        const sleep=ms=>new Promise(r=>original.setTimeout.call(window,r,ms));
        const until=async(fn,label)=>{const end=performance.now()+5000;while(!fn()){if(performance.now()>end)throw new Error(`timeout: ${label}`);await sleep(10);}};
        const timers=new Set();let raf=0,microtasks=0,reads=0,renders=0,released=0,subscribed=0,initialized=0,cleaned=0,paints=0,pending,mode='normal';const rects=[];
        window.setTimeout=(fn,ms,...args)=>{let id=original.setTimeout.call(window,()=>{timers.delete(id);fn(...args);},ms);timers.add(id);return id;};
        window.clearTimeout=id=>{timers.delete(id);original.clearTimeout.call(window,id);};
        window.setInterval=()=>{throw new Error('Unexpected production interval');};
        window.requestAnimationFrame=fn=>{raf++;return original.requestAnimationFrame.call(window,fn);};
        window.queueMicrotask=fn=>{microtasks++;original.queueMicrotask.call(window,fn);};
        const roots=[];const root=()=>{const e=document.createElement('div');e.style.cssText='display:block;width:40px;height:24px;margin:8px;';e.innerHTML='<button>native</button>';document.body.append(e);roots.push(e);return e;};
        const p=new SourceProvider({kind:'pixels',width:1,height:1,data:new Uint8Array([255,0,0,255])});
        const source={read:o=>{reads++;return p.read(o);},subscribe:fn=>{subscribed++;const off=p.subscribe(fn);return()=>{subscribed--;off();};}};
        const makeFrame=req=>{const data=new Uint8ClampedArray(req.width*req.height*4);for(let i=0;i<data.length;i+=4)data.set(req.snapshot.source.data.subarray(0,4),i);return {width:req.width,height:req.height,data,release(){released++;}};};
        const renderer={initialize(){initialized++;return()=>cleaned++;},render(req){renders++;rects.push(req.rect);const frame=makeFrame(req);if(mode==='defer'){mode='normal';return new Promise(r=>pending=()=>r(frame));}return frame;}};
        let scene;
        try {
          scene=createGlassScene({source,renderer,timeoutMs:1000});const a=scene.attach(root()),b=scene.attach(root());
          for(const attachment of [a,b]){const ctx=attachment.host.target.getContext('2d'),put=ctx.putImageData.bind(ctx);ctx.putImageData=(...args)=>{paints++;return put(...args);};}
          await scene.ready;await until(()=>renders===2&&released===2,'initial two hosts');await sleep(100);
          assert(reads===1&&subscribed===1,'one initialized source read and shared subscription');
          assert([...a.host.target.getContext('2d').getImageData(0,0,1,1).data].join(',')==='255,0,0,255','actual red target pixel');
          const idle={reads,renders,raf,microtasks};assert(timers.size===0,'zero deadline timers after settle');await sleep(100);
          assert(JSON.stringify(idle)===JSON.stringify({reads,renders,raf,microtasks})&&raf===0&&timers.size===0,'zero idle polling/rAF/microtasks');
          for(let i=0;i<20;i++)scene.invalidate();await until(()=>renders===4&&released===4,'coalesced20 revisions');await sleep(30);assert(reads===2,'one shared read for coalesced batch');
          const beforePaint=paints,beforeRelease=released;mode='defer';scene.invalidate();await until(()=>!!pending,'pending renderer');
          p.replace({kind:'pixels',width:1,height:1,data:new Uint8Array([0,0,255,255])});const finish=pending;pending=undefined;finish();
          await until(()=>released===beforeRelease+3,'stale release then latest two frames');assert(paints===beforePaint+2,'stale result never presented');
          assert([...a.host.target.getContext('2d').getImageData(0,0,1,1).data].join(',')==='0,0,255,255','latest blue frame');
          scene.pause();assert(subscribed===0,'pause unsubscribes source');const pausedReads=reads;p.invalidate();scene.invalidate();await sleep(50);assert(reads===pausedReads&&timers.size===0,'paused no work');
          scene.resume();await scene.ready;await until(()=>subscribed===1&&renders>=8,'resume current frame');await sleep(30);
          let hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'));assert(subscribed===0,'hidden unsubscribes');
          const hiddenReads=reads;scene.invalidate();p.invalidate();await sleep(50);assert(reads===hiddenReads&&timers.size===0,'hidden scene stops');
          hidden=false;document.dispatchEvent(new Event('visibilitychange'));await until(()=>reads===hiddenReads+1,'visibility wakeup one shared read');await sleep(30);delete document.hidden;
          const beforeResize=reads;a.host.element.style.width='72px';await until(()=>a.host.target.width===Math.round(72*devicePixelRatio),'element-only ResizeObserver');assert(reads===beforeResize+1,'element-only resize one batch');
          document.body.style.height='2200px';const previousY=rects.findLast(r=>r.width===72).y,rectIndex=rects.length;const beforeScroll=reads;scrollTo(0,4);await until(()=>reads>beforeScroll,'actual scroll event wakeup');await sleep(30);assert(rects.slice(rectIndex).some(r=>r.width===72&&Math.abs(r.y-(previousY-4))<0.01),'fresh viewport geometry on scroll');scrollTo(0,0);await sleep(30);
          b.dispose();b.dispose();const beforeDetach=renders;scene.invalidate();await until(()=>renders===beforeDetach+1,'remaining host only');
          a.dispose();assert(subscribed===0,'last detach unsubscribes');const emptyReads=reads;scene.invalidate();await sleep(30);assert(reads===emptyReads,'empty scene idle');
          scene.dispose();scene.dispose();assert(initialized===cleaned,'renderer allocation cleanup per init');assert(p.state==='ready','borrowed source intact');assert(timers.size===0,'no owned timer after dispose');
          const faultChecks=[];
          for(const action of ['dispose','abort','timeout','detach']) {
            const c=new AbortController();let complete,release=0,cleanup=0;const el=root();const before=el.outerHTML;
            const s=createGlassScene({source:{read:o=>p.read(o)},renderer:{initialize(){return()=>cleanup++;},render(req){return new Promise(resolve=>complete=()=>resolve({...makeFrame(req),release(){release++;}}));}},signal:c.signal,timeoutMs:action==='timeout'?20:1000});
            const h=s.attach(el);await s.ready;await until(()=>!!complete,`render pending ${action}`);
            if(action==='dispose')s.dispose();if(action==='abort')c.abort();if(action==='detach')h.dispose();if(action==='timeout')await until(()=>s.state==='failed','render timeout');
            complete();await sleep(20);assert(release===1,`late output release ${action}`);assert(el.querySelector('canvas')===null||h.host.target.width===0,`late output never paints ${action}`);
            s.dispose();assert(cleanup===1&&el.outerHTML===before,`allocation/style restoration ${action}`);faultChecks.push(action);
          }
          let immediateOff=0;const sync=createGlassScene({source:{read:o=>p.read(o),subscribe(fn){fn();return()=>immediateOff++;}},renderer});const syncHost=sync.attach(root());await sync.ready;await sleep(30);sync.dispose();assert(immediateOff===1,'synchronous subscription wakeup has one cleanup');
          let backgroundHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>backgroundHidden});let backgroundReads=0;
          const background=createGlassScene({source:{read:o=>{backgroundReads++;return p.read(o);}},renderer});background.attach(root());await background.ready;assert(backgroundReads===0,'hidden initialization leaves readable baseline without acquiring source');
          backgroundHidden=false;document.dispatchEvent(new Event('visibilitychange'));await until(()=>backgroundReads===1,'first visible acquisition');background.dispose();delete document.hidden;
          const revealRoot=root();revealRoot.style.display='none';let revealFrames=0;
          const reveal=createGlassScene({source:{read:o=>p.read(o)},renderer:{render(req){revealFrames++;return makeFrame(req);}}});const revealed=reveal.attach(revealRoot);await reveal.ready;await sleep(30);assert(revealFrames===0,'display-none host stays idle');revealRoot.style.display='block';await until(()=>revealed.host.target.width>0,'display-none host ResizeObserver wakeup');reveal.dispose();
          const capped=createGlassScene();const handles=[];for(let i=0;i<16;i++)handles.push(capped.attach(root()));let countBound=false;try{capped.attach(root());}catch(e){countBound=e.code==='INVALID_OPTIONS';}assert(countBound,'sixteen-surface core bound');capped.dispose();
          const budget=createGlassScene({source:{read:o=>p.read(o)},renderer});for(let i=0;i<3;i++){const el=root();el.style.cssText='position:absolute;top:0;left:0;width:2000px;height:1000px';budget.attach(el);}await budget.ready;await until(()=>budget.state==='failed','aggregate pixel guard');budget.dispose();
          let transition='unavailable';
          if(typeof document.startViewTransition==='function') {
            const t=document.startViewTransition(async()=>{const s=createGlassScene();s.attach(root());await s.ready;s.dispose();});void t.ready.catch(()=>{});
            await t.updateCallbackDone;t.skipTransition();await t.finished.catch(()=>{});transition='native update callback awaited readiness without rAF';
          }
          return {checks:['shared source/actual pixels/coalescing/stale release','zero idle clock and hidden/pause subscriptions','native element resize and scroll viewport wakeup','abort/dispose/timeout/detach late output and style restoration','synchronous subscription and hidden initialization'],faultChecks,transition,raf,activeTimers:timers.size};
        } finally {
          scene?.dispose();p.destroy();delete document.hidden;for(const e of roots)e.remove();Object.assign(window,original);
        }
      });
      assert.equal(receipt.result.activeTimers,0);assert.equal(receipt.result.raf,0);assert.deepEqual(errors,[]);receipt.status='passed';
    }catch(e){receipt.status='failed';receipt.error=e.stack;throw e;}finally{await browser?.close();await servers.close();const base=new URL('../private/phase-4/scene/',import.meta.url);await mkdir(base,{recursive:true});const dir=await mkdtemp(new URL(`run-${name}-`,base));await writeFile(`${dir}/receipt.json`,JSON.stringify(receipt,null,2));}
  });
}
