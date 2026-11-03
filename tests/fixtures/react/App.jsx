'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SourceProvider, createCpuRenderer } from '@liquid-glass-forge/dom';
import { GlassSceneProvider, GlassSurface, useGlassSurface } from '@liquid-glass-forge/react';
export const stats = { initialized:0, cleaned:0, active:0, released:0, subscriptions:0, refA:0, refB:0, refCleanups:0, aborts:0, initPending:[], renderPending:[] };
function monitored(mode) {
  const cpu=createCpuRenderer({executor:{worker:'off'},surface:{radius:0,strength:0}});
  return {
    initialize(signal) {stats.initialized++;stats.active++;let done=false;const clean=()=>{if(done)return;done=true;stats.active--;stats.cleaned++;};signal.addEventListener('abort',()=>stats.aborts++,{once:true});
      if(mode==='init'){stats.lastInitSignal=signal;return new Promise(resolve=>stats.initPending.push(()=>resolve(clean)));}
      const end=cpu.initialize(signal);return ()=>{end();clean();};
    },
    render(request,signal){if(mode==='held'){stats.lastRenderSignal=signal;return new Promise(resolve=>stats.renderPending.push(()=>resolve({width:request.width,height:request.height,data:new Uint8Array(request.width*request.height*4).fill(255),release(){stats.released++;}})));}return cpu.render(request,signal);}
  };
}
function HookCard({swap}){const binding=useGlassSurface();return React.createElement(swap?'section':'article',{id:'hook',ref:binding.ref,style:{width:160,height:70,position:'relative'}},<canvas className="lgf-surface" data-lgf-material="glass" aria-hidden="true" role="presentation" tabIndex={-1} ref={binding.targetRef}/>,<span>Hook content</span>);}
export default function App(){
  const [mounted,setMounted]=useState(true),[mode,setMode]=useState('cpu'),[material,setMaterial]=useState('glass'),[swap,setSwap]=useState(false),[refSwap,setRefSwap]=useState(false),[paused,setPaused]=useState(false),[clicks,setClicks]=useState(0),[error,setError]=useState('');
  const source=useMemo(()=>{const p=new SourceProvider({kind:'pixels',width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])}),subscribe=p.subscribe.bind(p);p.subscribe=fn=>{stats.subscriptions++;const off=subscribe(fn);let done=false;return ()=>{if(!done){done=true;stats.subscriptions--;off();}};};return p;},[]);
  const renderer=useMemo(()=>monitored(mode),[mode]);
  const refA=useCallback(node=>{if(node){stats.refA++;return ()=>stats.refCleanups++;}},[]),refB=useCallback(node=>{if(node){stats.refB++;return ()=>stats.refCleanups++;}},[]);
  useEffect(()=>{window.phase7={stats,source};return()=>{delete window.phase7;};},[source]);
  const onError=useCallback(cause=>setError(String(cause)),[]);
  return <main><h1>React packed consumer</h1><p id="error">{error}</p>
    <button id="toggle" onClick={()=>setMounted(v=>!v)}>Mount/unmount</button>
    <button id="replace" onClick={()=>source.replace({kind:'pixels',width:1,height:1,data:new Uint8Array([0,255,0,255])})}>Replace source</button>
    <button id="material" onClick={()=>setMaterial(v=>v==='glass'?'opaque':'glass')}>Material</button>
    <button id="swap" onClick={()=>setSwap(v=>!v)}>Replace hook node</button>
    <button id="ref" onClick={()=>setRefSwap(v=>!v)}>Replace forwarded ref</button>
    <button id="pause" onClick={()=>setPaused(v=>!v)}>Pause/resume</button>
    <button id="switch" onClick={()=>setMode(v=>v==='cpu'?'second':'cpu')}>Switch renderer</button>
    <button id="held" onClick={()=>setMode('held')}>Pending render</button>
    <button id="init" onClick={()=>setMode('init')}>Pending init</button>
    {mounted&&<GlassSceneProvider source={source} renderer={renderer} paused={paused} onError={onError}>
      <GlassSurface id="surface" material={material} ref={refSwap?refB:refA} style={{width:160,height:70}}>
        <label>Native <input id="native-input" defaultValue=""/></label><button id="native-button" onClick={()=>setClicks(v=>v+1)}>Native click</button><output id="clicks">{clicks}</output>
      </GlassSurface><HookCard swap={swap}/>
    </GlassSceneProvider>}
  </main>;
}
