# Proposed architecture

**Status: core contracts and DOM sources/coordinates implemented; hosts, renderers and frameworks proposed.** The private experimental core follows [version 1 contracts](CONTRACTS.md). Names and interfaces may change before an initial release.

## Package boundaries

| Proposed npm package | Responsibility |
|---|---|
| @liquid-glass-forge/core | Material schema, optical specification, source/frame contracts and lifecycle states |
| @liquid-glass-forge/cpu | JavaScript pixel kernel, optional worker and bounded main-thread path |
| @liquid-glass-forge/webgl | WebGL2 rendering and shared-scene GPU resources |
| @liquid-glass-forge/dom | Vanilla host, sources, coordinates, scheduling and CSS/opaque presentation |
| @liquid-glass-forge/react | React component/hook and scene ownership |
| @liquid-glass-forge/vue | Vue component/composable |
| @liquid-glass-forge/angular | Angular component/directive using Angular's distribution format |

These are proposed workspace boundaries. Renderer subpath exports may replace separate public renderer packages if packaging validation supports that choice. Frameworks remain peer dependencies. Future motion, component and native modules are described in [the roadmap](FUTURE.md), not shipped as empty exports.

ESM imports must not read browser globals, create workers, fetch sources or start rendering. Published packages must include explicit exports, declarations, CSS/worker assets and notices, with no consumer build/install hook.

## Runtime contracts

Separate source, renderer, material, quality and lifecycle configuration:

- Sources define dimensions, origin/readability constraints, revision, coordinate mapping and ownership.
- Backends are auto, CPU, WebGL, CSS or solid, with an explicit permitted fallback policy.
- Material parameters have finite ranges and documented distance/color units.
- Quality controls bound effective resolution, update rate and allocated pixels/resources.
- Lifecycle operations include initialization, update, invalidation, pause/resume, cancellation and idempotent destruction.

Report the effective backend, source state, frame revision, resolution and typed failure/fallback reasons through local diagnostics. Forced CPU must not request WebGL; a forced WebGL test must not pass through silent CPU fallback.

Initialization must settle and release partial allocations on failure. Async work carries a generation/revision check. Late work cannot revive a replaced or destroyed surface. Deadlines are subject to browser event-loop scheduling.

## CPU model and ownership

The planned optical pipeline is a bounded geometry/bevel field, bilinear displaced sampling, optional dispersion, separable blur, tint/highlights and masked composition. Freeze equations, boundary behavior, operation order, sRGB conversion and premultiplied linear-light handling in a versioned model.

Use independent analytical fixtures alongside the production CPU kernel. CPU/WebGL agreement alone cannot detect the same mistake in both implementations.

CPU optics execute in JavaScript over reusable typed arrays; Canvas2D presents completed pixels. Workers and OffscreenCanvas are optional capabilities. The browser/OS may still use GPU hardware for presentation and composition.

Borrowed application buffers/bitmaps must never be detached or closed. The engine snapshots them into owned transferable storage. Explicit ownership transfer is opt-in. Recycle stale buffers, close owned stale bitmaps, and account for storage lost when a worker terminates. Limit work to one in-flight batch per scene and one pending latest revision.

## WebGL and presentation

Use one reusable GPU context per shared scene where feasible, with persistent texture/framebuffer storage. A proposed presentation strategy draws/blits output to the default framebuffer and synchronously copies tiles into stable Canvas2D targets before yielding. Its cost and correctness must be established in feasibility work; it is not yet a validated implementation.

Record context attributes and alpha/color conventions. Do not assume default-framebuffer contents persist after presentation. Test unchanged tiles, atlas repacking, resizing and opaque-to-transparent replacement. Clear destination regions before replacing transparent output. [Khronos drawing-buffer rules](https://registry.khronos.org/webgl/specs/latest/1.0/#the-drawing-buffer)

Context loss stops GPU work. Recovery rebuilds resources rather than reusing invalid handles; retries and fallback are bounded. [Khronos context-loss extension](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/)

## DOM and framework integration

Keep text, controls, selection and focus in normal DOM. Wrapper templates own stable decorative targets; rendering must not move or replace framework children. Server and first-client markup agree, with a readable CSS/solid material before optical activation.

React must tolerate Strict Mode effect replay. Vue must handle unmount and KeepAlive. Angular requires its package format, hydration-safe markup and browser lifecycle setup; a render callback alone does not establish that hydration finished. Exact supported framework versions will be published after fixture validation. [Angular hydration](https://angular.dev/guide/hydration), [Render callback caveat](https://angular.dev/api/core/afterNextRender)

Batch geometry reads, coalesce invalidation, reject stale frames and stop scheduling when idle/hidden. Restore library-owned styles and release observers, listeners, workers, bitmaps and GPU resources on disposal.

## Extension contracts

Use versioned data-only tokens, numerical fixtures and explicit shape/source capabilities. Motion and gestures resolve into one revisioned frame snapshot with one writer per property; the renderer consumes that snapshot. Joining SVG shapes does not automatically change optical coverage. Freeform morphing needs a later shared geometry/mask contract.

React Native requires native adapters. Flutter requires a Dart implementation. Share specifications and fixtures where practical; web DOM/SVG code is not assumed portable.
