<script setup>
import { useGlassSurface } from '@liquid-glass-forge/vue';
defineProps({swap:Boolean});
const {element,target}=useGlassSurface();
</script>
<template><component :is="swap?'section':'article'" id="hook" class="lgf-host" ref="element" style="width:160px;height:70px"><canvas ref="target" class="lgf-surface" data-lgf-material="glass" aria-hidden="true" role="presentation" tabindex="-1"/><span>Composable content</span></component></template>
