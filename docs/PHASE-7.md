# Phase 7: React adapter

Original Step07/M19–M21 exit criteria implemented and verified on 3 November
2026. All packages remain private at `0.0.0-dev`. This phase implements React
bindings to the existing DOM/source/CPU contracts; it introduces no optical math.

## Use

```jsx
'use client';
import { useMemo } from 'react';
import { GlassSceneProvider, GlassSurface } from '@liquid-glass-forge/react';
import { SourceProvider, createCpuRenderer } from '@liquid-glass-forge/dom';
import '@liquid-glass-forge/dom/styles.css';

export function Card() {
  const source = useMemo(() => new SourceProvider({
    kind: 'pixels', width: 1, height: 1,
    data: new Uint8Array([70, 140, 210, 255]),
  }), []);
  const renderer = useMemo(() => createCpuRenderer({
    executor: {worker: 'off'}, surface: {radius: 12, bevel: 8, strength: 4},
  }), []);
  return <GlassSceneProvider source={source} renderer={renderer}>
    <GlassSurface style={{width: 240, minHeight: 100}}>
      <label>Name <input name="name" /></label>
    </GlassSurface>
  </GlassSceneProvider>;
}
```

`GlassSurface` is a div with ordinary HTML attributes, events and a forwarded
`HTMLDivElement` ref. It renders one dedicated decorative canvas before its
children; React retains ownership of every node. Semantic children are never
moved or wrapped by the engine. Callback refs retain React19 cleanup semantics.
The component works without a provider as CSS/opaque material.

`GlassSceneProvider` accepts an optional source/renderer pair, `timeoutMs`,
`paused` and `onError`. Effects create one scene per active lifetime. Multiple
surfaces share that scene and source subscription. Source/renderer identity or
timeout changes retire the old scene before creating its replacement. Changes
to `onError` do not restart the scene. Pausing releases active renderer resources;
resuming initializes a fresh engine generation. Provider cleanup disposes its
scene and aborts pending operations. Late cleanup/output follows the existing
DOM engine's settlement and frame-release rules.

The caller owns supplied source and renderer objects. The provider does not call
their terminal destroy/dispose methods, so Strict Mode replay can reuse them.
The supplied renderer must support repeated initialize/cleanup; the existing CPU
adapter does. Retire caller-owned objects only when the application has actually
finished using them. A terminal destroy in a replayed effect cleanup followed by
reuse of the same object is invalid. Objects created by abandoned renders are
data-only and hold no active browser resources.

`useGlassSurface({material})` returns `ref`, `targetRef` and `invalidate`. It can
bind a different valid block container, including replacement of either ref node.
Render a dedicated direct child canvas with `lgf-surface`, `data-lgf-material`,
`aria-hidden="true"`, `role="presentation"` and `tabIndex={-1}`; give the container
`lgf-host` and a nonzero box. Do not draw into or control the dedicated canvas
backing while attached. A hook owns a local material scene outside a provider.

## Server and client boundary

Render/import creates no DOM engine, workers, network operations or timers.
Server and initial client markup contain the same div/canvas/semantic children.
The application imports the DOM stylesheet explicitly for readable material
before hydration and without JavaScript. No hydration suppression is used.
The package preserves its `use client` directive; a Next.js App Router server
page can import a client component which uses the package. Browser-backed sources
such as canvas/video elements must be supplied from client effects or refs.

Only React19.3.1 / React DOM19.3.1 peers are declared. Public TS/JSX consumers use
@types/react19.3.0 and @types/react-dom19.3.0 with strict checking. Vite8.3.5 and
Next16.4.4 are the exact built consumer versions, tested on Node24.12.0/macOS arm64.
Other React/Next combinations and React18 are unqualified.

## Verification

`pnpm test:adapter react` (also `pnpm test:react`) packs all five packages, audits
physical inventories/exports/peers, installs tarballs outside the repository,
verifies installed file bytes and rejects workspace symlinks. It records the
consumer lockfile, source/producer hashes, tool versions, commands, SSR HTML,
screenshots, failures and outcomes under `private/phase-7/consumer`.

The consumer builds a production Vite browser bundle plus SSR bundle and a
production Next.js App Router server/client-boundary application. A separate
Vite development lane exercises actual Strict Mode effect/ref replay; production
React does not replay effects. Chromium, Firefox and WebKit run all three lanes.
Each verifies shared two-surface initialization/subscription, native controls,
forwarded callback-ref cleanup, hook-node replacement, material/source changes,
renderer switching, pause/resume, pending init/render unmount cancellation, late
frame release and absence of stale paints. Next additionally navigates away and
back through real client-side links and verifies resource retirement/recreation.
Forced CPU calls are proven with a WebGL context spy. Every lane checks zero
hydration/page errors and retains the original semantic/target node through
hydration. No-JavaScript pages retain controls and decorative material markup.

SSR import/render tests trap browser, network and timer access. React's external
development peer is preloaded before traps because it captures queueMicrotask;
the adapter creates no resources. Public JSX tests exercise component events,
precise div refs and hook types, and reject invalid materials/ref element types.
The standalone declaration build retains only bare React/DOM imports and a small
ESM module; React is not bundled. Vite warns that its app bundle may discard the
client directive; the published-format package retains it and the real Next
production build verifies that boundary.

Early failures remain retained: stale npm metadata, a fixture NODE_ENV conflict
between Vite development and Next production, and a fixture HTTP header error.
Next commands now explicitly select production mode; installs use pinned versions
and disable lifecycle scripts. Fixture servers and temporary consumers are owned
and closed/removed after checks, without touching other project runtimes.

## Boundary

Actual WebGL-through-React coverage belongs to Step10, as the original plan states.
No new physical-device, Safari, optical parity or timing qualification is inferred
from framework browser tests. Phase5/6 evidence and the Safari cadence waiver are
preserved. Vue/Angular, integrated resilience and release work remain future phases.
All disabled Codex integrations, hooks, Jev variants and ECC remain disabled.


## Recorded outcome

`pnpm test` passed all 127 existing Node/browser checks, the five-package
reproducible/offline smoke and the React consumer. The final consumer rerun adds
explicit first/updated CPU-frame checks for **both** shared targets before its
screenshots. All 23 consumer verification groups pass: five install/type/SSR/build
groups and lifecycle plus no-JavaScript groups for each of nine browser lanes.
No hydration warnings, uncaught page errors or forced-CPU WebGL requests occurred.
Owned servers and disposable consumers were cleaned up; unrelated runtimes were
preserved. The final raw receipt is
`private/phase-7/consumer/run-Cdfee1/receipt.json`; the complete run, earlier failures,
current source/artifact hashes and command outcomes are indexed in
`private/phase-7/evidence.json`. Raw receipts remain private and ignored by Git.

The React package preserves the client directive and ships only its two ESM/type
outputs plus README/license/notice/manifest. Peer versions are exact. No package
was published, no remote was pushed and no later phase was started.

[React Strict Mode](https://react.dev/reference/react/StrictMode),
[React hydration](https://react.dev/reference/react-dom/client/hydrateRoot), and
[Next.js server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
explain the framework boundaries exercised by these consumers.
