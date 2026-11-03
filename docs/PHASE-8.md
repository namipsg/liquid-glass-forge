# Phase 8: Vue adapter

Original Step08/M22–M24 exit criteria implemented and verified on 3 November
2026. Packages remain private at `0.0.0-dev`. This adapter reuses the existing
DOM/source/CPU contracts and implements no optical math.

## Use

```vue
<script setup>
import { markRaw } from 'vue';
import { GlassSceneProvider, GlassSurface } from '@liquid-glass-forge/vue';
import { SourceProvider, createCpuRenderer } from '@liquid-glass-forge/dom';
import '@liquid-glass-forge/dom/styles.css';
const source = markRaw(new SourceProvider({
  kind: 'pixels', width: 1, height: 1,
  data: new Uint8Array([70, 140, 210, 255]),
}));
const renderer = markRaw(createCpuRenderer({
  executor: {worker: 'off'}, surface: {radius: 12, bevel: 8, strength: 4},
}));
</script>
<template>
  <GlassSceneProvider :source="source" :renderer="renderer">
    <GlassSurface style="width:240px;min-height:100px">
      <label>Name <input name="name" /></label>
    </GlassSurface>
  </GlassSceneProvider>
</template>
```

`GlassSurface` keeps a stable div/canvas/slot structure in Vue. Native attributes,
classes, styles and events are forwarded to the div. The dedicated canvas has
`aria-hidden`, presentation role, negative tab index and no pointer interception.
A component ref exposes `element`, `target` and `invalidate`; annotate it with
`GlassSurfaceHandle`. A surface outside a provider uses material only. The
application imports the DOM CSS explicitly for a readable pre-hydration/no-JS
baseline. Semantic nodes are never moved or replaced by the engine.

`useGlassSurface({material})` accepts a material value, ref, computed ref or getter.
It returns shallow `element` and `target` refs plus `invalidate`. Bind those refs
to a valid block container and its dedicated direct canvas child. Render the
`lgf-host`/`lgf-surface` classes, `data-lgf-material`, `aria-hidden="true"`,
`role="presentation"` and `tabindex="-1"`. Do not share the canvas drawing context
or control its backing dimensions while attached. Ref-node replacement retires
only that attachment. Material/slot updates do not recreate the shared scene.

## Ownership and KeepAlive

`GlassSceneProvider` accepts a source/renderer pair, optional `timeoutMs`, `paused`
and `onError`. It creates an engine only after mount. Multiple descendants share
one scene and source subscription. Source/renderer identity or timeout changes
retire the previous scene. Error-handler changes are observed without restarting
it. Opaque class instances are unwrapped at the boundary; keep descriptors stable
with `markRaw` or shallow refs when appropriate.

The caller owns supplied objects. The provider initializes/cleans their active
resources, and does not terminally destroy/dispose those reusable objects.
KeepAlive deactivation pauses the provider, aborts pending work and detaches its
surfaces. Reactivation reads current source/props and resumes or replaces the
engine as needed. Changes while inactive do not initialize another renderer.
Caching a single child under an otherwise active shared provider detaches only
that child; siblings retain their scene. Unmount disposes owned scenes and
attachments. Late init cleanup, source reads and worker frames follow the DOM
engine's generation/cancellation/release rules.

## Server, types and declared combinations

Imports and server setup/render create no engine, browser resources, worker,
network operation or timer. The initial client markup matches the server. No
hydration-warning suppression or client-only rendering escape is used. Sources
which require media/DOM elements must be supplied from client refs or effects.

Vue **3.5.44** is the exact declared peer: minimum and current supported versions
are the same tested version, rather than an unverified range. The consumer matrix
builds Vite8.3.5 / @vitejs/plugin-vue6.0.10 and Nuxt4.6.4 with Vue/server-renderer
3.5.44 on Node24.21.0/macOS arm64. Strict SFC checks use vue-tsc3.3.14 and
TypeScript5.9.3; the package declaration build uses repository TypeScript7.0.2.
The adapter SSR import also runs on Node20.19.6. Full Nuxt validation requires its
newer Node engine; the repository default Node binary was not changed.

The CI matrix keeps a Node20 base lane and uses Node24.21 for the complete suite.
A CI configuration change is not a claim that remote CI has run. Locally, select
a compatible runtime before `pnpm test` / `pnpm test:adapter vue`.

## Verification

`pnpm test:adapter vue` (also `pnpm test:vue`) packs all six packages and installs
physical tarballs outside the repository. It audits inventories/exports/exact
peers and compares every installed file to packed bytes. Framework/build tool
versions and the consumer lockfile are retained. Production Vue/Vite SSR/client
and Nuxt SSR applications are built and exercised in Chromium, Firefox and WebKit.

The browser checks cover original hydration node identity, native controls and
slots, material/source changes, component handles, composable node replacement,
renderer switch, pause/resume, repeated KeepAlive cycles and an independently
cached child with active siblings. They require real CPU first/updated frames on
shared targets, one shared renderer/subscription, zero WebGL requests, no page or
hydration warnings, and readable no-JavaScript controls/material.

Deferred initialization, source acquisition and render outputs are resolved after
deactivation/unmount to prove cancellation, late cleanup/release and absence of
stale paints. A genuine required CPU worker completes an output which the fixture
holds until after deactivation; the worker terminates and its late frame releases.
Nuxt additionally navigates away/back with real client-side links and verifies
resource retirement/recreation. Strict SFC types accept native events, refs and
reactive material options and reject an invalid material. SSR import/render traps
browser/network/timer access after preloading the external Vue peer, which captures
its DOM environment on import.

The worker check exposed a CPU package metadata defect: `sideEffects:false` let
the bundler remove its explicitly imported message-handler entry and emit an empty
worker. Only `./dist/worker.js` is now marked side-effectful. CPU equations,
protocol and package-root import behavior are unchanged. The failed worker attempt
and compiler diagnostic for native event types are retained as evidence.

Shared package smoke stages external peers into the npm cache, then performs the
actual private-package install offline in a separate consumer. Its peer lockfile
records that preparation. Framework consumers explicitly install their pinned
build dependencies; they do not assume an earlier machine-wide warm cache.

## Boundary

Actual WebGL-through-Vue and combined backend/framework resilience join Step10.
No new physical-device, Safari or performance qualification is inferred from
adapter tests. Existing Phase5/6 evidence, failures and the Safari cadence waiver
remain preserved. Angular and later release phases remain future work.
Disabled Codex integrations, hooks, Jev variants and ECC remain disabled.


## Recorded outcome

The complete Node24.21 suite passed **127 existing Node/browser checks**, the
six-package reproducible/offline smoke, **23 React consumer groups** and **17 Vue
consumer groups**. The Vue groups include five package/type/SSR/build checks plus
lifecycle and no-JavaScript checks for both production applications in all three
browser engines. No hydration/page warnings or WebGL requests occurred in the
Vue CPU lanes. Node20.19.6 adapter SSR import passed separately. CI was updated;
no remote CI execution is claimed.

The current Vue receipt is `private/phase-8/consumer/run-LM1wfY/receipt.json`.
`private/phase-8/evidence.json` indexes that receipt, installed artifact hashes,
source/producer hashes, the full regression and Node20 logs, earlier failures,
raw SSR HTML and screenshots. Framework fixture servers and temporary consumers
were cleaned up; unrelated runtimes and prior phase evidence were preserved.
Raw evidence remains private and ignored by Git. No publish, push, deployment or
later-phase work was performed.

[Vue KeepAlive](https://vuejs.org/guide/built-ins/keep-alive.html),
[Vue SSR](https://vuejs.org/guide/scaling-up/ssr.html), and
[Nuxt rendering](https://nuxt.com/docs/4.x/guide/concepts/rendering)
describe the framework boundaries exercised by these consumers.
