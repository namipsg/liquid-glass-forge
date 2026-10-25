# Phase 1 feasibility record

**Status: Samsung A04s admission passes; desktop timing and actual Safari revalidation remain open.** This is a standalone explicit-source experiment, not an installable production library. Phase 2 has not started. [Reproduction commands](../spikes/phase-1/README.md) are available.

## Verified behavior

Fourteen unit/admission tests and 36 desktop browser checks pass. The browser matrix covers Chromium, installed Chrome, Firefox and Playwright WebKit. On the physical Samsung Galaxy A04s (Android 14, Chrome 118), all eight device checks pass, including repeated original-workload performance admission. Those version-specific observations are not a general browser support guarantee. Playwright WebKit does not substitute for actual Safari.

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
| GPU | One WebGL2 context, source/encoding/output textures, one persistent atlas FBO, one default-framebuffer blit and one GPU snapshot per batch |
| Presentation | Premultiplied-alpha GL context; startup Canvas2D storage calibration; nearest 1:1 copies through a CPU-backed snapshot into dedicated targets |
| Numerical checks | Maximum presented-channel error ≤3/255, mean absolute error ≤0.5/255, exact idle-target persistence; unchanged from the original tests |
| Failure | Required GPU tests fail on unavailable/lost contexts; no silent CPU substitution; recreation after context loss |

The source uses `SRGB8_ALPHA8` for linear-light texture reads; alpha remains independent of that conversion. See [OpenGL ES 3.0, §3.8.16](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf). A small GPU encoding lookup removes fragment power operations while retaining byte-threshold correction. Each batch copies the atlas synchronously before yielding; subsequent tile copies reuse Canvas2D storage and reset clipping/compositing state. No production GL `readPixels` pass was added.

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

On the A04s, the two original CPU runs measured batch p95 of 32.7/31.7 ms, cadence p95 of 33.343/33.342 ms and copy-age p95 of 46.964/47.761 ms. WebGL measured 8.4/5.1 ms, 16.67/16.67 ms and 12.175/6.977 ms respectively. Accounted image storage was 6,918,152 bytes for CPU and 16,654,336 bytes for WebGL. CPU has little headroom on this device; these warm measurements do not establish sustained performance.

The allocation guard allows four million source pixels and four million total atlas pixels, with at most 16 distinct batch targets. Those defensive limits are not admitted performance tiers. Blur/highlights, workers, source-update providers, recovery and framework adapters remain outside this spike.

## Remaining gates

Actual Safari must rerun the current pixel, lifecycle, atlas and admission checks; its earlier result predates this implementation. On the M4 reference desktop, Firefox passes admission. Installed Chrome and Playwright WebKit pass correctness and renderer service-time budgets, but their measured rAF cadence exceeds the fixed timing gate. An idle-page control also shows pacing variation, so those desktop timing lanes remain open. The gate has not been widened. Production contracts and packages remain on hold until the required lanes pass.

The [future roadmap](FUTURE.md) continues to reserve motion, Apple-inspired components, React Native and Flutter as separately scoped work.
