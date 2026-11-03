import { createGlassScene } from '@liquid-glass-forge/dom';
import { installRuntime, cardMarkup } from './runtime.mjs';
import './styles.css';
const api = installRuntime('vanilla'); let scene, current, handles = [];
api.subscribe(state => {
  if (!state.shown || state.run !== current) {
    scene?.dispose(); scene = undefined; handles = []; document.querySelector('#app').replaceChildren(); current = state.run;
  }
  if (!state.shown || !state.run) return;
  if (!scene) {
    scene = createGlassScene({ source: current.source, renderer: current.renderer, timeoutMs: 1500, onError: current.report });
    for (let i = 0; i < state.count; i++) {
      const host = document.createElement('section'); host.className = 'test-card'; host.innerHTML = cardMarkup(i);
      document.querySelector('#app').append(host); handles.push(scene.attach(host, { material: state.material }));
    }
  } else for (const handle of handles) handle.update({ material: state.material });
});
