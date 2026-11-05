# Install Liquid Glass Forge

[Open the interactive installer](https://namipsg.github.io/liquid-glass-forge/#developers)

[React](#react) · [Vue](#vue) · [Angular](#angular) · [Vanilla JS](#vanilla) · [WebGL refraction](#add-webgl-refraction) · [Video refraction](#vanilla-js-with-video-refraction)

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

### Vanilla JS with video refraction

In a vanilla Vite project, install the published preview and generate a small
same-origin MP4 next to `index.html`.

```sh
npm install @liquid-glass-forge/dom@0.1.0-rc.1 @liquid-glass-forge/webgl@0.1.0-rc.1
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=24 -t 4 -c:v libx264 \
  -pix_fmt yuv420p -movflags +faststart sample.mp4
```

Use this as `index.html`. Press Play in the native video controls. The glass
surface samples the playing video at its own position. The Restart button seeks
to the first frame.

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Forge video refraction</title>
<body style="margin: 0">
  <main style="position: relative; width: 320px; height: 180px">
    <video id="clip" src="./sample.mp4" width="320" height="180"
      controls loop muted playsinline preload="auto" aria-label="Generated test pattern"></video>
    <div id="glass" style="position: absolute; left: 80px; top: 42px;
      width: 160px; height: 56px; border-radius: 28px; display: grid;
      place-items: center; background: #203653">
      <button id="restart" type="button" disabled>Restart</button>
    </div>
  </main>
  <p id="status" role="status"></p>

  <script type="module">
    import { SourceProvider, createGlassScene } from '@liquid-glass-forge/dom';
    import { createOpticalRenderer } from '@liquid-glass-forge/webgl/dom';
    import '@liquid-glass-forge/dom/styles.css';

    const video = document.querySelector('#clip');
    const restart = document.querySelector('#restart');
    const status = document.querySelector('#status');
    const frame = document.createElement('canvas');
    frame.width = 320;
    frame.height = 180;
    const context = frame.getContext('2d');
    const source = new SourceProvider({ kind: 'canvas', value: frame });
    const renderer = createOpticalRenderer({
      backend: 'auto',
      fallback: 'material',
      surface: { radius: 28, bevel: 12, strength: 20 },
      sourceRect: { x: 80, y: 42, width: 160, height: 56 },
    });
    const scene = createGlassScene({ source, renderer, onError: error => {
      status.textContent = `Optics are unavailable (${error.code}).`;
    } });
    scene.attach(document.querySelector('#glass'));
    let animation = 0;
    let lastFrameTime = -1;

    function paint() {
      if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.currentTime === lastFrameTime) return;
      context.drawImage(video, 0, 0, frame.width, frame.height);
      lastFrameTime = video.currentTime;
      source.invalidate();
      restart.disabled = false;
    }

    function trackPlayback() {
      if (animation || video.paused || video.ended) return;
      animation = requestAnimationFrame(() => {
        animation = 0;
        paint();
        trackPlayback();
      });
    }

    function stopTracking() {
      cancelAnimationFrame(animation);
      animation = 0;
    }

    function rewind() {
      video.currentTime = 0;
    }

    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    video.addEventListener('loadeddata', paint, options);
    video.addEventListener('seeked', paint, options);
    video.addEventListener('playing', trackPlayback, options);
    video.addEventListener('pause', stopTracking, options);
    restart.addEventListener('click', rewind, options);
    paint();

    function dispose() {
      listeners.abort();
      stopTracking();
      video.pause();
      scene.dispose();
      renderer.dispose();
      source.destroy();
    }

    window.addEventListener('pagehide', event => {
      if (!event.persisted) dispose();
    });
  </script>
</body>
</html>
```

The canvas keeps the last decoded frame readable while the video seeks. The
application owns playback and should call `dispose()` before removing the
example. The fixed `sourceRect` matches the 320 × 180 frame. For a responsive layout, map the
surface to intrinsic video pixels using the [source guide](SOURCES.md#mapsourceregion).
See the [showcase player](https://namipsg.github.io/liquid-glass-forge/examples.html?example=video)
for a fuller example.

Use [source mapping](SOURCES.md) for responsive layouts, crop and fit rules,
and display scaling. Readable canvas or media sources must be origin-clean.
The renderer samples that explicit source. The CSS material can use the browser’s
live backdrop without a pixel provider.
