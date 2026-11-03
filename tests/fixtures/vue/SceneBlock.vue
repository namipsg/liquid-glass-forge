<script setup>
import { ref, onMounted } from 'vue';
import { GlassSceneProvider,GlassSurface } from '@liquid-glass-forge/vue';
import HookCard from './HookCard.vue';
import {stats} from './state.mjs';
defineProps({source:Object,renderer:Object,material:String,paused:Boolean,swap:Boolean,localShown:Boolean,label:String});
const emit=defineEmits(['clicked','error']);
const surface=ref(null),text=ref('');
onMounted(()=>{stats.handle=surface.value;});
</script>
<template><GlassSceneProvider :source="source" :renderer="renderer" :paused="paused" :on-error="e=>emit('error',e)">
 <GlassSurface ref="surface" id="surface" :material="material" style="width:160px;height:70px"><label>{{label}} <input id="native-input" v-model="text"/></label><button id="native-button" @click="emit('clicked')">Native click</button></GlassSurface>
 <HookCard :swap="swap"/><KeepAlive><GlassSurface v-if="localShown" id="cached-child" style="width:160px;height:40px"><input id="cached-input" aria-label="Cached child input"/></GlassSurface></KeepAlive>
</GlassSceneProvider></template>
