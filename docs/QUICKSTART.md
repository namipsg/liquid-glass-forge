# Install Liquid Glass Forge

[Open the interactive installer](https://namipsg.github.io/liquid-glass-forge/#developers)

[React](#react) · [Vue](#vue) · [Angular](#angular) · [Vanilla JS](#vanilla) · [WebGL refraction](#add-webgl-refraction)

The commands below use the published `0.1.0-rc.1` preview. Run them in an
existing app with compatible framework peers. Keep all Forge packages at the
same version.

## React

```sh
npm install @liquid-glass-forge/react@0.1.0-rc.1 @liquid-glass-forge/dom@0.1.0-rc.1
```

Use [App.jsx](../showcase/src/starters/React.jsx) as your app component. The preview expects React and React DOM **19.3.1**. In Next.js App Router, keep the client directive and move the global CSS import to your root layout if it is managed there.

## Vue

```sh
npm install @liquid-glass-forge/vue@0.1.0-rc.1 @liquid-glass-forge/dom@0.1.0-rc.1
```

Use [App.vue](../showcase/src/starters/Scene.vue) in your app. The preview expects Vue **3.5.44**.

## Angular

```sh
npm install @liquid-glass-forge/angular@0.1.0-rc.1 @liquid-glass-forge/dom@0.1.0-rc.1
```

Add [GlassDemoComponent](../showcase/src/starters/scene.ts) to your app and render `<app-glass-demo />`. Add `@import '@liquid-glass-forge/dom/styles.css';` to `src/styles.css`. The preview expects Angular core/common **22.2.4** and RxJS **7.8.2**.

## Vanilla

```sh
npm install @liquid-glass-forge/dom@0.1.0-rc.1
```

Use the [HTML starter](../showcase/src/starters/index.html) in a project with an ESM bundler such as Vite.

## Add WebGL refraction

Keep the CSS starter packages installed and add the renderer.

```sh
npm install @liquid-glass-forge/webgl@0.1.0-rc.1
```

Provide an explicit, readable source and map the surface to the corresponding
region. The examples below use a canvas displayed at its backing size. Use
[source mapping](SOURCES.md) for responsive layouts and media cropping.

### React with WebGL refraction

Replace your app component with the following. The renderer and source are
created in an effect and disposed when the component unmounts.

```jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { GlassSceneProvider, GlassSurface } from '@liquid-glass-forge/react';
import { SourceProvider } from '@liquid-glass-forge/dom';
import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
import '@liquid-glass-forge/dom/styles.css';

export default function App() {
  const artwork = useRef(null);
  const [optics, setOptics] = useState(null);

  useEffect(() => {
    const canvas = artwork.current;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 480, 240);
    gradient.addColorStop(0, '#bde7ff');
    gradient.addColorStop(1, '#8495ea');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 480, 240);
    ctx.fillStyle = '#14243f';
    ctx.font = 'bold 64px system-ui';
    ctx.fillText('Liquid glass', 24, 134);

    const source = new SourceProvider({ kind: 'canvas', value: canvas });
    const renderer = createOpticalRenderer({
      backend: 'auto',
      fallback: 'material',
      surface: { radius: 32, bevel: 14, strength: 24 },
      sourceRect: { x: 40, y: 80, width: 240, height: 64 },
    });
    setOptics({ source, renderer });
    return () => {
      renderer.dispose();
      source.destroy();
    };
  }, []);

  return (
    <main style={{ position: 'relative', width: 480, height: 240 }}>
      <canvas ref={artwork} width={480} height={240} aria-hidden="true" />
      {optics && (
        <GlassSceneProvider {...optics}>
          <GlassSurface style={{
            position: 'absolute', left: 40, top: 80, width: 240, height: 64,
            borderRadius: 32, display: 'grid', placeItems: 'center',
          }}>
            <button type="button">Continue</button>
          </GlassSurface>
        </GlassSceneProvider>
      )}
    </main>
  );
}
```

### Vue and Angular with WebGL refraction

Create the same `SourceProvider` and `createOpticalRenderer` pair from a readable
source. Pass it to Vue’s `GlassSceneProvider` as `:source` and `:renderer`, or
to Angular’s `lgfScene` directive as `[lgfSource]` and `[lgfRenderer]`. See the
[Vue integration guide](PHASE-8.md) or [Angular integration guide](PHASE-9.md) for
the component and scene lifetime.

### Vanilla JS with WebGL refraction

Give the artwork and the glass control explicit positions. In this example, the
canvas displays at its backing size and the toolbar starts at source coordinates
`(40, 80)`.

```html
<div style="position:relative;width:480px;height:240px">
  <canvas id="artwork" width="480" height="240"></canvas>
  <div id="toolbar" style="position:absolute;left:40px;top:80px;width:240px;
       height:64px;border-radius:32px;display:grid;place-items:center">
    <button type="button">Continue</button>
  </div>
</div>
```

```js
import { SourceProvider, createGlassScene } from '@liquid-glass-forge/dom';
import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
import '@liquid-glass-forge/dom/styles.css';

const artwork = document.querySelector('#artwork');
const context = artwork.getContext('2d');
const color = context.createLinearGradient(0, 0, 480, 240);
color.addColorStop(0, '#91caff');
color.addColorStop(1, '#293c84');
context.fillStyle = color;
context.fillRect(0, 0, 480, 240);
context.fillStyle = '#14243f';
context.font = 'bold 64px system-ui';
context.fillText('Liquid glass', 24, 134);

const source = new SourceProvider({ kind: 'canvas', value: artwork });
const renderer = createOpticalRenderer({
  backend: 'auto',
  fallback: 'material',
  surface: { radius: 32, bevel: 14, strength: 24 },
  sourceRect: { x: 40, y: 80, width: 240, height: 64 },
});
const scene = createGlassScene({ source, renderer });
scene.attach(document.querySelector('#toolbar'));
await scene.ready;

// Call source.invalidate() after repainting the canvas.
// On unmount, release the scene and its caller-owned inputs.
function dispose() {
  scene.dispose();
  renderer.dispose();
  source.destroy();
}
```

Use [source mapping](SOURCES.md) for responsive layouts, crop and fit rules,
and display scaling. Readable canvas or media sources must be origin-clean.
The renderer samples that explicit source. The CSS material can use the browser’s
live backdrop without a pixel provider.
