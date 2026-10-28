import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlassScene, SceneError, SourceProvider } from '../packages/dom/dist/index.js';
const source = () => new SourceProvider({kind:'pixels',width:1,height:1,data:new Uint8Array([255,0,0,255])});
const renderer = {render(){throw new Error('No DOM host should render in a Node initialization test');}};
const turn = () => new Promise(resolve=>setImmediate(resolve));
test('material scene settles without rAF or source; options and ownership are explicit', async()=>{
  const p=createGlassScene();await p.ready;assert.equal(p.state,'ready');p.update();p.pause();assert.equal(p.state,'paused');p.resume();await p.ready;p.dispose();p.dispose();assert.equal(p.state,'destroyed');assert.throws(()=>p.resume(),{code:'DESTROYED'});
  for(const o of [{source:source()},{renderer},{ownsSource:true},{timeoutMs:0},{timeoutMs:Infinity}]) assert.throws(()=>createGlassScene(o),SceneError);
});
test('hung provider and renderer initialization have deadlines and abort signals',async()=>{
  for(const stage of ['provider','renderer']) {
    let signal;
    const p=createGlassScene({source:stage==='provider'?{read(o){signal=o.signal;return new Promise(()=>{});}}:source(),
      renderer:stage==='renderer'?{...renderer,initialize(s){signal=s;return new Promise(()=>{});}}:renderer,timeoutMs:8});
    await assert.rejects(p.ready,{code:'TIMEOUT'});assert.equal(p.state,'failed');assert.equal(signal.aborted,true);p.dispose();
  }
});
test('failure and non-Error rejection settle honestly; owned source destroyed once',async()=>{
  for(const rejection of [new Error('source failed'),undefined]) {
    let destroyed=0;const p=createGlassScene({source:{read(){return Promise.reject(rejection);},destroy(){destroyed++;}},ownsSource:true,renderer});
    await assert.rejects(p.ready);assert.equal(p.state,'failed');assert.equal(destroyed,1);p.dispose();p.dispose();assert.equal(destroyed,1);
  }
});
test('destroy during initialize releases late allocation exactly once and rejects readiness',async()=>{
  let resolve, cleaned=0;const input=source();const p=createGlassScene({source:input,renderer:{...renderer,initialize(){return new Promise(r=>resolve=r);}}});
  const rejected=assert.rejects(p.ready,{code:'DESTROYED'});p.dispose();p.dispose();await rejected;
  resolve(()=>cleaned++);await turn();assert.equal(cleaned,1);assert.equal(input.state,'ready');input.destroy();
});
test('timeout releases late initialize cleanup; cleanup errors do not strand owned source',async()=>{
  let resolve, cleaned=0,destroyed=0,errors=0;const input=source();
  const p=createGlassScene({source:{read:o=>input.read(o),destroy(){destroyed++;}},ownsSource:true,timeoutMs:8,onError(){errors++;throw new Error('consumer');},
    renderer:{...renderer,initialize(){return new Promise(r=>resolve=r);}}});
  await assert.rejects(p.ready,{code:'TIMEOUT'});resolve(()=>{cleaned++;throw new Error('cleanup');});await turn();p.dispose();
  assert.equal(cleaned,1);assert.equal(destroyed,1);assert.ok(errors>=2);input.destroy();
});
test('abort before creation, during first read, and after ready all terminate with cleanup',async()=>{
  for(const stage of ['before','read','ready']) {
    const c=new AbortController();let cleaned=0,readSignal;
    if(stage==='before')c.abort();
    const p=createGlassScene({signal:c.signal,source:stage==='read'?{read(o){readSignal=o.signal;return new Promise(()=>{});}}:source(),
      renderer:{...renderer,initialize(){return ()=>cleaned++;}}});
    if(stage==='ready'){await p.ready;c.abort();assert.equal(p.state,'failed');assert.equal(cleaned,1);}
    else {const rejected=assert.rejects(p.ready,{code:'ABORTED'});if(stage==='read'){await turn();c.abort();}await rejected;if(readSignal)assert.equal(readSignal.aborted,true);}
    p.dispose();
  }
});
test('pause during init rejects that attempt; resume starts a fresh bounded attempt',async()=>{
  let resolve, calls=0,cleaned=0;const p=createGlassScene({source:source(),renderer:{...renderer,initialize(){if(++calls===1)return new Promise(r=>resolve=r);return ()=>cleaned++;}}});
  const first=assert.rejects(p.ready,{code:'PAUSED'});p.pause();await first;p.resume();await p.ready;
  resolve(()=>cleaned++);await turn();assert.equal(p.state,'ready');assert.equal(calls,2);assert.equal(cleaned,1);p.dispose();assert.equal(cleaned,2);
});
