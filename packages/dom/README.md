# Liquid Glass Forge DOM sources

Private experimental `0.0.0-dev` sources, coordinate mapping and vanilla host/lifecycle.
Requires exact matching core/CPU package versions. ESM and TypeScript
declarations are included; imports are SSR-safe and start no timers or network.

```ts
import { SourceProvider, mapSourceRegion, createGlassScene } from '@liquid-glass-forge/dom';
const p = new SourceProvider({ kind: 'pixels', width: 1, height: 1,
  data: new Uint8Array([255, 0, 0, 255]) });
const snapshot = await p.read(); // independent, owned straight-sRGB RGBA8 bytes
p.destroy();
```

Sources: explicit bytes, sRGB ImageData, borrowed ImageBitmap, decoded URL image,
readable canvas/OffscreenCanvas, or borrowed HTMLVideoElement. Inputs remain
caller-owned. Reads have bounded cancellation and latest-generation semantics.
For explicit bytes or sRGB ImageData, `readInto(target)` copies every pixel into
an attached caller-owned RGBA8 view of the exact size. It returns borrowed
metadata and never transfers or retains the target; source/target aliasing is
rejected. Reuse the target only after consumers have captured or finished it.
The ordinary `read()` continues to return a fresh owned snapshot.
Canvas drawing needs explicit invalidation; video subscription can observe frame
revisions through a cancellable frame callback or bounded event/timer fallback.

`mapSourceRegion` maps explicit viewport rectangles, object fit/position,
source-pixel padding, clipping, DPR and positive axis scale/translation. It returns
typed invalid/empty/unsupported results. Preserve sample/crop/output offsets;
it does not parse arbitrary CSS or capture DOM.

See the repository [source contract](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/SOURCES.md)
for full API semantics and limits. `createGlassScene()` mounts CSS/opaque material with bounded lifecycle and shared
dirty/visibility scheduling. Load the `./styles.css` asset export; JavaScript imports
inject no styles. `scene.attach(element)`, `ready`, `update`, `pause`, `resume` and
`dispose` preserve native content and release owned resources. The optional
source/renderer pair is a low-level adapter seam; `createCpuRenderer` supplies
JavaScript CPU optics with optional workers, capped backing resolution and
cancellable update pacing. See the project Phase 5 document for usage and
source-bound performance/device qualification. A `surface(request)` callback
can supply per-request radius, bevel and strength; values are validated and
captured before asynchronous work. Diagnostics report effective optics, actual
execution start, rate wait and presentation pacing. Active completion pacing is
included in the documented service measurements; idle hosts schedule no work.
See the [host contract](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/HOSTS.md).
Framework adapters and public browser-support tiers are outside this package.
Performance claims are limited to the repository's measured workload/environment.
