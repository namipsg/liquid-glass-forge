# <img src="https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/showcase/public/frameworks/react.svg" width="20" height="20" alt=""> @liquid-glass-forge/react

Integrate Forge scenes and glass surfaces into React.

[Live showcase](https://namipsg.github.io/liquid-glass-forge/?framework=react#developers) · [Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) · [Documentation](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-7.md) · [Support](https://namipsg.github.io/liquid-glass-forge/support.html)

## Install in React

```sh
npm install @liquid-glass-forge/react@next @liquid-glass-forge/dom@next
```

The starter uses CSS glass and expects React and React DOM 19.3.1. Keep the Forge packages at matching versions.
The [live installer](https://namipsg.github.io/liquid-glass-forge/?framework=react#developers)
shows verified exact versions and has a copy button.

[Open the React starter](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/QUICKSTART.md#react) · [Add WebGL refraction](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/QUICKSTART.md#react-with-webgl-refraction)

### App.jsx

```jsx
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
```

[![A live glass lens bends the lettering beneath it](https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/?framework=react#developers)

## Usage

Experimental preview `0.1.0-rc.2`. Pinned peers: React and React DOM **19.3.1**.
Framework peers are imported, never bundled into this package. The ESM entry
retains `use client` for Next.js client boundaries and has public JSX declarations.

Import `GlassSurface`, `GlassSceneProvider` and `useGlassSurface` from
`@liquid-glass-forge/react`. Import `@liquid-glass-forge/dom/styles.css` in the
application for the server/no-JavaScript material baseline. No stylesheet is
injected by JavaScript.

`GlassSurface` renders a stable div, decorative canvas and ordinary children.
It forwards the div ref, including callback-ref cleanup. Without a provider it
uses CSS material. A provider accepts an explicit `source`/`renderer` pair,
`paused`, `timeoutMs` and `onError`; multiple children share one scene.
Source or renderer identity changes replace the scene. Keep these objects stable
between intentional replacements. The caller owns these reusable objects;
effect cleanup releases scene resources without terminally disposing them.

`useGlassSurface({material})` returns `ref`, `targetRef` and `invalidate`. Render
the target as a dedicated direct canvas child with the decorative CSS class,
material data attribute, `aria-hidden`, presentation role and negative tab index.
React owns both DOM nodes. Do not concurrently control canvas backing dimensions
or draw into its context while mounted.

See the [integration guide](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-7.md) for usage, Strict Mode ownership, exact Vite/Next
consumer evidence and remaining integration limits.
