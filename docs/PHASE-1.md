# Phase 1 feasibility record

**Status: the default canvas path passes Samsung A04s admission; consistent desktop timing and actual Safari revalidation remain open.** WebKit cadence has not been reliably fixed. This is a standalone explicit-source experiment, not an installable production library. Phase 2 has not started. [Reproduction commands](../spikes/phase-1/README.md) are available.

## Verified behavior

Fourteen unit/admission tests and 48 desktop browser checks pass. The browser matrix covers Chromium, installed Chrome, Firefox and Playwright WebKit. It includes both presentation paths, absent OffscreenCanvas support, same-size target state reset, and bitmap cleanup after a copy error. On the physical Samsung Galaxy A04s (Android 14, Chrome 118), all eight device checks pass with the default canvas path, including repeated original-workload performance admission. Those version-specific observations are not a general browser support guarantee. Playwright WebKit does not substitute for actual Safari.

The initial A16 investigation exposed alpha-transfer rounding and per-target GPU synchronization costs. The A04s replaced it as the current mobile reference device. Historical A16 results remain separate; the final atlas path has not been requalified on that device.

## Rendering and ownership

| Area | Experiment contract |
|---|---|
| Sources | One decoded origin-clean 640×360 sRGB image or supplied straight-alpha RGBA8 snapshot; static revision |
| Access | Same-origin or correctly CORS-enabled images; tainted readback/upload fails |
| Shapes | Axis-aligned rounded rectangles, including zero radius; no arbitrary DOM capture or transforms |
| Coordinates | Pixel-center mapping through an in-bounds source rectangle; displaced samples clamp to source edges |
| Optics | Rounded mask and edge displacement; bilinear interpolation in premultiplied linear light |
| CPU | Owned Float32 source, per-frame validation/sampling, threshold-corrected sRGB byte encoding; one bounded Float64 geometry cache independent of optical strength |
| GPU | One WebGL2 context; canvas mode has three textures and one atlas FBO/blit, bitmap mode has two textures and draws the atlas into the default framebuffer; one GPU snapshot per batch |
| Presentation | Premultiplied-alpha GL context; startup Canvas2D storage calibration; nearest 1:1 copies through a 2D snapshot into dedicated targets, requesting `willReadFrequently: true`; optional synchronous bitmap transfer with deterministic handle cleanup |
| Numerical checks | Maximum presented-channel error ≤3/255, mean absolute error ≤0.5/255, exact idle-target persistence; unchanged from the original tests |
| Failure | Required GPU tests fail on unavailable/lost contexts; no silent CPU substitution; recreation after context loss |

The source uses `SRGB8_ALPHA8` for linear-light texture reads; alpha remains independent of that conversion. See [OpenGL ES 3.0, §3.8.16](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf). A small GPU encoding lookup removes fragment power operations while retaining byte-threshold correction. Each batch copies the atlas synchronously before yielding; tile copies reset clipping/compositing state. No production GL `readPixels` pass was added.

Canvas presentation remains the default. The explicit bitmap experiment uses [`OffscreenCanvas.transferToImageBitmap()`](https://html.spec.whatwg.org/multipage/canvas.html#dom-offscreencanvas-transfertoimagebitmap), copies all tiles and closes the handle even when a copy throws. Its image estimate conservatively includes both snapshot and bitmap capacity. Removing the duplicate atlas FBO keeps that estimate within the original budget. A direct-default-buffer canvas trial missed the A04s copy-age gate, so canvas mode retains its original FBO. Neither mode selects itself through a browser-name or timing heuristic.

CPU geometry reuse caches mask, normals and bevel weight only. Source pixels and output colors are recomputed each frame, and mutations are revalidated. The cache has one entry capped at 262,144 pixels. Analytical encoding and mutable-alpha regression tests accompany these optimizations.

## Fixed admission workloads

Source decoding, first CPU frame and renderer setup are reported separately. Each admission run retains two original workloads, each with 15 warm-up frames and 90 measured frames. Optical strength changes every frame. Fast reduced runs cannot replace a failed original run.

| Gate | CPU: one 320×180 output | WebGL: four 640×360 outputs |
|---|---:|---:|
| CSS size per output | 320×180 | 320×180 |
| Batch p95, including presentation | ≤33.333… ms | ≤16.666… ms |
| rAF interval p95 | ≤35 ms | ≤17.5 ms |
| rAF timestamp to final copy p95 | ≤50 ms | ≤16.666… ms |
| Accounted image storage | ≤8 MiB | ≤16 MiB |

The service budgets retain the original 30/60 update targets. Cadence allows 5% scheduler/timestamp variation. CPU copy-age allows its service window plus one 60 Hz scheduling interval. Image accounting includes renderer arrays/textures/default buffer/snapshot, destination backing lower bounds and borrowed input pixels; browser, compositor and driver overhead is excluded. These are warm feasibility gates, not physical scanout, live-source freshness, thermal-soak or process-memory guarantees.

On the A04s, the latest two original CPU runs measured batch p95 of 32.9/31.7 ms, cadence p95 of 33.342/33.339 ms and copy-age p95 of 47.094/47.687 ms. Default WebGL measured 7.8/10.9 ms, 16.670/16.671 ms and 12.104/12.292 ms respectively. Accounted image storage was 6,918,152 bytes for CPU and 16,654,336 bytes for WebGL. CPU has little headroom on this device; these warm measurements do not establish sustained performance.

In a controlled WebKit comparison on the 60 Hz reference display, bitmap presentation reduced batch p95 from about 4 ms to 1 ms. Cadence still reached 18 ms against the fixed 17.5 ms gate. The same bitmap approach measured 57.8/58.5 ms batches on the A04s and failed admission despite passing pixel/lifecycle checks. It therefore remains an explicit experiment rather than the default or an admitted mobile tier.

The allocation guard allows four million source pixels and four million total atlas pixels, with at most 16 distinct batch targets. Those defensive limits are not admitted performance tiers. Blur/highlights, workers, source-update providers, recovery and framework adapters remain outside this spike.

## Remaining gates

Actual Safari remains untested on this implementation and its gate is intentionally left open. WebKit still has failing cadence repeats after window placement, scheduling, clock-precision and presentation comparisons. A 20 µs clock control also failed, so integer timestamp rounding alone does not explain the issue. Faster copies do not establish a cadence fix.

The last standalone default-mode headed command passed both originals on Chrome and WebKit, while Firefox missed one GPU copy-age gate at 21.64 ms. The explicit bitmap WebKit command also passed in its recorded headed condition. Earlier controlled WebKit failures remain in the evidence; later passes do not establish a reliable repair.

A native-focused WebKit follow-up on 26 October 2026 recorded idle rAF p95 of 18 ms both before and after rendering on the 60 Hz reference display. Its two original GPU workloads measured batch p95 of 15/17 ms and cadence p95 of 21/24 ms, failing admission. A separate GPU-only A/B/B/A atlas-image reuse comparison measured 9/8 ms batches for the default path and 7/7 ms for the prototype, while both paths returned 18/17 ms cadence. That prototype was not retained. The idle controls do not waive the cadence limit or establish a single cause for the failures.

Desktop timing qualification therefore remains open. All numerical, cadence, age, workload and storage limits are unchanged. Production contracts and packages remain on hold until the required lanes pass.

The [future roadmap](FUTURE.md) continues to reserve motion, Apple-inspired components, React Native and Flutter as separately scoped work.
