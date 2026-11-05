# @liquid-glass-forge/react

Integrate Forge scenes and glass surfaces into React.

[![A live glass lens bends the lettering beneath it](https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/?framework=react#developers)

[Live showcase](https://namipsg.github.io/liquid-glass-forge/?framework=react#developers) · [Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) · [Documentation](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-7.md) · [Support](https://namipsg.github.io/liquid-glass-forge/support.html)

## Install

```sh
npm install @liquid-glass-forge/react@0.1.0-rc.2
```

Keep the Forge packages at matching versions. This is an experimental preview.
The [support guide](https://namipsg.github.io/liquid-glass-forge/support.html) describes browser and device qualification.

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

See the [integration guide](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-7.md) and repository `docs/PHASE-7.md` for usage, Strict Mode ownership, exact Vite/Next
consumer evidence and remaining integration limits. No registry package is published.
