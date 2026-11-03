# Liquid Glass Forge Vue

Private experimental `0.0.0-dev`. The exact tested Vue peer is **3.5.44**.
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

See repository `docs/PHASE-8.md` for ownership, KeepAlive, exact Vite/Nuxt consumer
verification and remaining limits. No registry package has been published.
