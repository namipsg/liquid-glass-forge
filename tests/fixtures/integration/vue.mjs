import { createApp, defineComponent, h, shallowRef, onBeforeUnmount } from 'vue';
import { GlassSceneProvider, GlassSurface } from '@liquid-glass-forge/vue';
import { installRuntime, cardMarkup } from './runtime.mjs';
import './styles.css';
const api = installRuntime('Vue');
createApp(defineComponent({ setup() {
  const state = shallowRef(api.state), off = api.subscribe(value => { state.value = value; }); onBeforeUnmount(off);
  return () => {
    const value = state.value, run = value.run;
    if (!value.shown || !run) return null;
    return h(GlassSceneProvider, { source: run.source, renderer: run.renderer, timeoutMs: 1500, onError: run.report },
      { default: () => Array.from({ length: value.count }, (_, i) => h(GlassSurface, { key: i, class: 'test-card', material: value.material },
        { default: () => h('div', { innerHTML: cardMarkup(i) }) })) });
  };
} })).mount('#app');
