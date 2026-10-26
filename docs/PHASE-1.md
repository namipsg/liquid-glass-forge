# Phase 1 feasibility record

**Status: accepted for progression with an explicit cadence exception on 26 October 2026.** The project owner waived the remaining Safari/WebKit cadence prerequisite and authorized phase 2 contracts and packaging. The default canvas path passes Samsung A04s admission. Actual Safari passes correctness but misses the unchanged GPU cadence gate; repeatable desktop timing remains unresolved. This waiver does not establish a repair or production performance qualification. [Reproduction commands](../spikes/phase-1/README.md) are available.

## Verified behavior

Fourteen unit/admission tests and 48 desktop browser checks pass. The browser matrix covers Chromium, installed Chrome, Firefox and Playwright WebKit. It includes both presentation paths, absent OffscreenCanvas support, same-size target state reset, and bitmap cleanup after a copy error. On the physical Samsung Galaxy A04s (Android 14, Chrome 155), all eight device checks pass with the default canvas path, including repeated original-workload performance admission. Actual Safari 26.6.2 passes seven of eight device checks; performance admission fails. Those version-specific observations are not a general browser support guarantee. Playwright WebKit does not substitute for actual Safari.

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

The final original-workload measurements used the unchanged default implementation. Each row contains two runs; both browsers reported visible, focused documents for all four workloads. Safari ran on the 60 Hz reference display with both monitors connected.

| Environment / backend | Batch p95 (ms) | Cadence p95 (ms) | Copy-age p95 (ms) | Admission |
|---|---:|---:|---:|---|
| A04s / CPU | 29.3 / 29.7 | 33.4 / 33.4 | 46.0 / 44.3 | Pass |
| A04s / WebGL | 11.7 / 7.5 | 16.8 / 16.8 | 14.4 / 9.6 | Pass |
| Safari 26.6.2 / CPU | 14 / 13 | 17 / 18 | 14 / 13 | Pass |
| Safari 26.6.2 / WebGL | 1 / 1 | **19 / 18** | 1 / 1 | **Fail: cadence >17.5 ms** |

Accounted image storage was 6,918,152 bytes for CPU and 16,654,336 bytes for WebGL in both environments. All 720 measured frames are retained privately without filtering, together with source hashes and original receipts. CPU has limited headroom on the A04s; these warm measurements do not establish sustained performance. Safari's fast copies do not establish a scheduler repair.

In a controlled WebKit comparison on the 60 Hz reference display, bitmap presentation reduced batch p95 from about 4 ms to 1 ms. Cadence still reached 18 ms against the fixed 17.5 ms gate. The same bitmap approach measured 57.8/58.5 ms batches on the A04s and failed admission despite passing pixel/lifecycle checks. It therefore remains an explicit experiment rather than the default or an admitted mobile tier.

The allocation guard allows four million source pixels and four million total atlas pixels, with at most 16 distinct batch targets. Those defensive limits are not admitted performance tiers. Blur/highlights, workers, source-update providers, recovery and framework adapters remain outside this spike.

## Remaining gates

Actual Safari has now been tested on this implementation. Alpha parity, idle persistence, atlas batching, source restrictions, benchmark cleanup and controlled context loss pass; both original GPU runs fail cadence. The first WebDriver session stalled before collecting optical samples; its failed attempt is preserved separately from the completed fresh-session run. Temporary Safari settings were restored after testing. WebKit still has failing cadence repeats after window placement, scheduling, clock-precision and presentation comparisons. A 20 µs clock control also failed, so integer timestamp rounding alone does not explain the issue. Faster copies do not establish a cadence fix.

The last standalone default-mode headed command passed both originals on Chrome and WebKit, while Firefox missed one GPU copy-age gate at 21.64 ms. The explicit bitmap WebKit command also passed in its recorded headed condition. Earlier controlled WebKit failures remain in the evidence; later passes do not establish a reliable repair.

A native-focused WebKit follow-up on 26 October 2026 recorded idle rAF p95 of 18 ms both before and after rendering on the 60 Hz reference display. Its two original GPU workloads measured batch p95 of 15/17 ms and cadence p95 of 21/24 ms, failing admission. A separate GPU-only A/B/B/A atlas-image reuse comparison measured 9/8 ms batches for the default path and 7/7 ms for the prototype, while both paths returned 18/17 ms cadence. That prototype was not retained. The idle controls do not waive the cadence limit or establish a single cause for the failures.

A subsequent controlled A/B/B/A comparison of Playwright WebKit revisions 2370 and 2380 also failed to establish a repair: the two original GPU cadence p95 values were 18/17 ms, 17/18 ms, 18/21 ms and 17/17 ms in execution order. Three of four legs failed the unchanged gate. The newer engine was not promoted. Earlier failures remain part of the qualification evidence; a later passing leg cannot erase them.

This finite campaign is closed with an unresolved measured cadence gate. The owner subsequently waived that gate as a prerequisite for phase 2; all numerical, cadence, age, workload and storage limits and original failures remain unchanged. GPU capability alone does not establish browser frame pacing. Any future performance qualification must identify supported operating conditions and pass the original browser/device workloads with repeatable evidence. Physical iOS performance was not tested. The exception authorizes contracts and packaging work, not a Safari/iOS compatibility or frame-rate guarantee.

The [future roadmap](FUTURE.md) continues to reserve motion, Apple-inspired components, React Native and Flutter as separately scoped work.
