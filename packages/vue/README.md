# <img src="https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/showcase/public/frameworks/vue.svg" width="20" height="20" alt=""> @liquid-glass-forge/vue

Integrate Forge scenes and glass surfaces into Vue.

[Live showcase](https://namipsg.github.io/liquid-glass-forge/?framework=vue#developers) · [Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) · [Documentation](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-8.md) · [Support](https://namipsg.github.io/liquid-glass-forge/support.html)

## Install in Vue

```sh
npm install @liquid-glass-forge/vue@next @liquid-glass-forge/dom@next
```

The starter uses CSS glass and expects Vue 3.5.44. Keep the Forge packages at matching versions.
The [live installer](https://namipsg.github.io/liquid-glass-forge/?framework=vue#developers)
shows verified exact versions and has a copy button.

[Open the Vue starter](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/QUICKSTART.md#vue) · [Add WebGL refraction](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/QUICKSTART.md#add-webgl-refraction)

[![A live glass lens bends the lettering beneath it](https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/?framework=vue#developers)

## Usage

Experimental preview `0.1.0-rc.2`. The pinned Vue peer is **3.5.44**.
Vue remains external; the package ships ESM and declarations without bundling it.

Import `GlassSurface`, `GlassSceneProvider` and `useGlassSurface` from
`@liquid-glass-forge/vue`. Import `@liquid-glass-forge/dom/styles.css` in the
application for server and no-JavaScript material. JavaScript injects no stylesheet.

`GlassSurface` renders a div, a decorative canvas and ordinary default-slot
content. Native HTML attributes/events are forwarded to the div. A component ref
exposes `element`, `target` and `invalidate` (see `GlassSurfaceHandle`). Without a
provider the surface uses CSS/opaque material.

A provider accepts a `source`/`renderer` pair, `paused`, `timeoutMs` and `onError`.
It owns one shared scene and borrows reusable source/renderer objects. Mount and
activation start/resume it; deactivation pauses it; unmount disposes it. Source or
renderer identity changes replace the scene. Inactive changes wait for activation.

`useGlassSurface({material})` accepts a material value, ref or getter and returns
`element`, `target` shallow refs plus `invalidate`. Render the target as a dedicated
direct canvas child with decorative class/attributes. Vue owns both nodes. Do not
control its backing dimensions or draw into its context while attached.

See the [integration guide](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-8.md) for ownership, KeepAlive, exact Vite/Nuxt consumer
verification and remaining limits.
