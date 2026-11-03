import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GlassSceneProvider, GlassSurface } from '@liquid-glass-forge/react';
import { installRuntime, cardMarkup } from './runtime.mjs';
import './styles.css';
const api = installRuntime('React');
function App() {
  const [state, setState] = useState(api.state); useEffect(() => api.subscribe(setState), []);
  if (!state.shown || !state.run) return null;
  const run = state.run;
  return <GlassSceneProvider source={run.source} renderer={run.renderer} timeoutMs={1500} onError={run.report}>
    {[0, 1].map(i => <GlassSurface key={i} className="test-card" material={state.material}>
      <div dangerouslySetInnerHTML={{ __html: cardMarkup(i) }} />
    </GlassSurface>)}
  </GlassSceneProvider>;
}
createRoot(document.querySelector('#app')).render(<App />);
