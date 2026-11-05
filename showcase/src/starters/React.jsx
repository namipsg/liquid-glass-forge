'use client';

import { GlassSurface } from '@liquid-glass-forge/react';
import '@liquid-glass-forge/dom/styles.css';

export default function App() {
  return (
    <main style={{ padding: 48, background: 'linear-gradient(130deg, #bde7ff, #8495ea)' }}>
      <GlassSurface style={{ display: 'inline-block', padding: 16, borderRadius: 24 }}>
        <button type="button">Continue</button>
      </GlassSurface>
    </main>
  );
}
