# Vanilla host and shared scene — experimental phase 4

The private DOM package adds a decorative host and a shared lifecycle/scheduler.
The default is CSS material. It includes no CPU/WebGL optical renderer.
Load the package's `styles.css` export through your asset pipeline; JavaScript
imports do not inject styles or request assets.

```ts
import { createGlassScene } from '@liquid-glass-forge/dom';

const scene = createGlassScene();
const card = scene.attach(document.querySelector<HTMLElement>('#card')!);
await scene.ready;
card.update({ material: 'opaque' });
scene.pause();
scene.resume();
await scene.ready;
scene.dispose(); // also disposes its attached decorative targets
```

## Stable host and material

`mountGlassHost(element, { target?, material? })` also works independently.
`GlassHost` exposes `element`, `target`, `measure()`, `setMaterial()`,
`present({ width, height, data })`, `clear()` and idempotent `dispose()`.
`present` is a bounded Canvas2D byte presentation primitive, not optical rendering.
It accepts core RGBA8 storage and limits; imports request no browser APIs.

Use an HTML container with a block/inline-block box. Replaced/void elements,
non-replaced inline boxes and `display:contents` are unsupported. Hidden and
detached containers can be mounted and become active when visible. Semantic
children are never moved, wrapped or replaced. The decorative canvas is absolute,
behind the content in an isolated stacking context, `pointer-events:none`,
`aria-hidden`, presentation-only and excluded from tab order. There are no native
input, keyboard, selection or image-drag handlers to intercept application behavior.
Only one host owns a given element at a time.

A generated target is removed on disposal. An optional caller-supplied target
must be a dedicated direct Canvas2D child with a readable backing within core's
pixel bound. Its original dimensions, readable pixels, attributes, class tokens
and library-touched inline styles are restored. Resizing a dedicated target
resets its Canvas2D drawing state; arbitrary transforms/clip/save stacks are not
preserved. Do not share that drawing context while the target is mounted.
Backing snapshots have an allocation cost. A supplied WebGL or tainted target
is rejected before mounting. Unrelated application style changes are preserved;
an application change to a library-owned property takes precedence at cleanup.

Glass material uses a readable tint plus CSS backdrop blur when available.
Opaque mode uses the system Canvas color. The stylesheet enforces opaque/no-blur
material for forced colors and reduced transparency. This is a material fallback,
not a contrast qualification of arbitrary application content or an optical effect.
Declarative markup also works when page JavaScript is disabled:

```html
<div class="lgf-host">
  <canvas class="lgf-surface" data-lgf-material="opaque"
    aria-hidden="true" role="presentation" tabindex="-1"></canvas>
  <label>Native control <input name="example"></label>
</div>
```

## Scene lifecycle and adapter boundary

`createGlassScene({ source?, renderer?, ownsSource?, timeoutMs?, signal?, onError? })`
returns a `GlassScene` with `ready`, `state`, `attach`, `update`, `invalidate`,
`pause`, `resume` and `dispose`. An attachment has `host`, `update`, `invalidate`
and `dispose`. `update({ material })` changes material and invalidates; source
replacement uses the existing `SourceProvider.replace()` contract.

A source and renderer must be supplied together. `SceneSource` has `read({signal})`
and optional `subscribe(listener)` returning an unsubscribe function. Sources are
borrowed by default; only `ownsSource:true` grants `destroy()` ownership.
Share one scene across hosts which use one latest-read SourceProvider.

`GlassRenderer.initialize(signal)` may return an initialization cleanup function.
`render(request, signal)` returns `{width,height,data,release?}`. The request holds
one immutable source snapshot, backing dimensions, DPR and a viewport rectangle.
No renderer implementation ships in this phase; tests inject a color producer.
Every returned frame's `release` is called once after synchronous presentation,
or when its result becomes stale, cancelled, timed out or disposed. Late
initialization cleanup is likewise reclaimed. Cleanup errors are reported to
`onError` without preventing independent cleanup; error-observer errors are isolated.

Readiness does not wait for rAF, observer delivery or painting. With an adapter,
it awaits bounded renderer initialization and a first source read. A hidden
document skips source priming until visible while material remains usable.
Initialization/read/render each default to a 5,000 ms deadline (1–60,000 ms option).
Deadlines cannot preempt synchronous JavaScript or stalled browser event loops.

Failed initialization/read/render leaves the material fallback and a failed
scene, with optical subscriptions/observers/initialization allocations released.
The attached fallback remains intentionally mounted until disposal. Failures do
not silently retry. External abort terminates work. Pause aborts the current
attempt; explicit resume starts a new bounded initialization. Await the current
`ready` promise after resume. Destroy is terminal and idempotent. A pending ready
promise rejects on abort/pause/destruction, and is internally observed to avoid
an unhandled rejection before application code awaits it.

## Dirty work and visibility

One source read is shared per batch. At most one batch is in flight, with a
pending set of latest dirty hosts. Synchronous invalidations coalesce through a
microtask. Revision checks prevent late work from painting after invalidation,
hiding, detachment or disposal. Sixteen hosts and the core aggregate output
pixel bound cap a batch; these are allocation guards, not performance admission.

A scene shares ResizeObserver, IntersectionObserver when available, and
scroll/resize/visibility listeners. Element resize works without window resize;
scroll renders with current viewport geometry. Hidden documents, offscreen or
zero-size hosts, provider pause and no attached hosts stop optical work and source
subscriptions. Resume/visibility/observer wakeups process the latest dirty state.
Without observers, applications must explicitly invalidate element-only changes.
There is no rAF loop, interval or idle polling clock. Deadline timers exist only
while an async operation is pending. Disposal disconnects owned observers,
listeners, subscriptions and jobs, releases owned sources and restores hosts.

Native View Transition update callbacks can await readiness without a rendering
callback dependency. Capability availability is recorded by browser fixtures;
this is not actual Safari/iOS or production rendering qualification.
