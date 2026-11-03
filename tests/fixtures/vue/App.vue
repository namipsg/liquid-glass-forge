<script setup>
import { ref,shallowRef,markRaw,watch,onMounted,onBeforeUnmount } from 'vue';
import { SourceProvider } from '@liquid-glass-forge/dom';
import { GlassSurface } from '@liquid-glass-forge/vue';
import SceneBlock from './SceneBlock.vue';
import { stats, monitored } from './state.mjs';
const mounted=ref(true),localShown=ref(true),shown=ref(true),paused=ref(false),material=ref('glass'),swap=ref(false),label=ref('Native'),clicks=ref(0),error=ref(''),mode=ref('cpu');
const source=markRaw(new SourceProvider({kind:'pixels',width:2,height:1,data:new Uint8Array([255,0,0,255,0,0,255,255])}));
const read=source.read.bind(source);source.read=options=>{if(mode.value==='source'){stats.lastSourceSignal=options?.signal;return new Promise(resolve=>stats.sourcePending.push(async()=>resolve(await read())));}return read(options);};
const subscribe=source.subscribe.bind(source);source.subscribe=fn=>{stats.subscriptions++;const off=subscribe(fn);let done=false;return()=>{if(!done){done=true;stats.subscriptions--;off();}};};
const renderer=shallowRef(markRaw(monitored(mode.value)));watch(mode,value=>{renderer.value=markRaw(monitored(value));});
onMounted(()=>{window.phase8={stats,source};});onBeforeUnmount(()=>{delete window.phase8;});
function replace(){source.replace({kind:'pixels',width:1,height:1,data:new Uint8Array([0,255,0,255])});}
</script>
<template><main><h1>Vue packed consumer</h1><p id="error">{{error}}</p>
 <button id="toggle" @click="mounted=!mounted">Mount/unmount cache</button><button id="cache" @click="shown=!shown">KeepAlive</button>
 <button id="local-cache" @click="localShown=!localShown">Cache one shared child</button><button id="replace" @click="replace">Replace source</button><button id="material" @click="material=material==='glass'?'opaque':'glass'">Material</button>
 <button id="slot" @click="label=label==='Native'?'Updated slot':'Native'">Slot update</button><button id="swap" @click="swap=!swap">Replace composable node</button>
 <button id="pause" @click="paused=!paused">Pause/resume</button><button id="switch" @click="mode=mode==='cpu'?'second':'cpu'">Switch renderer</button>
 <button id="worker" @click="mode='worker'">Pending real worker</button><button id="source" @click="mode='source'">Pending source read</button><button id="held" @click="mode='held'">Pending render</button><button id="init" @click="mode='init'">Pending init</button><output id="clicks">{{clicks}}</output>
 <KeepAlive v-if="mounted"><SceneBlock v-if="shown" :source="source" :renderer="renderer" :material="material" :paused="paused" :swap="swap" :local-shown="localShown" :label="label" @clicked="clicks++" @error="e=>error=String(e)"/></KeepAlive>
 <GlassSurface id="standalone" material="opaque" style="width:160px;height:40px"><input id="local-input" aria-label="Material input"/></GlassSurface>
</main></template>
