# Liquid Glass Forge React

Private experimental `0.0.0-dev`. Tested peers: React and React DOM **19.3.1**.
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

See repository `docs/PHASE-7.md` for usage, Strict Mode ownership, exact Vite/Next
consumer evidence and remaining integration limits. No registry package is published.
