# Phase 1 feasibility record

**Status: in progress; admission remains open.** The standalone spike demonstrates explicit-source CPU and WebGL2 refraction. It does not establish production readiness, a package API, or a browser support guarantee. [Reproduction commands](../spikes/phase-1/README.md) are available now.

## Demonstrated behavior

The current experiment has analytical CPU fixtures and browser checks for pixel output, alpha/color/orientation, crops, forced CPU isolation, shared-context copying, target persistence, resize, transparent replacement, context loss, resource cleanup and CORS restrictions. The live-DOM CSS material works independently with JavaScript disabled.

The desktop Chromium, Firefox, Playwright WebKit and installed Chrome lanes pass. Actual Safari is checked separately through Safari WebDriver. A physical Samsung Galaxy A16 is checked through its Chrome DevTools connection. Playwright WebKit and a mobile viewport do not substitute for those device runs.

The Galaxy A16 exposed an idle-canvas readback rounding change. Requesting a CPU-backed Canvas2D target fixed persistence in the tested path. The GPU presentation path still has an unresolved low-alpha color difference on that device: the fractional-alpha fixture exceeds the frozen maximum channel tolerance. A premultiplied-output experiment resolved that case on Android but introduced a Firefox regression, so it was not retained. Mobile WebGL remains unqualified.

## Scope and conventions

| Area | Experiment contract |
|---|---|
| Sources | One decoded origin-clean image or explicitly supplied RGBA8 pixels; static source revision |
| Source access | Same-origin pixels or correctly CORS-enabled images; tainted readback/upload must fail |
| Shapes | Axis-aligned rounded rectangles, including zero radius; no DOM shape extraction or arbitrary transforms |
| Coordinates | Output pixel centers map to an explicit in-bounds source rectangle; displaced samples clamp to source edges |
| Optics | Edge displacement and antialiased mask; manual bilinear sampling in premultiplied linear light; straight sRGB RGBA8 output |
| GPU presentation | One WebGL2 context, persistent output texture/FBO, default-framebuffer blit, synchronous Canvas2D replacement before yielding |
| Target ownership | Dedicated fresh Canvas2D targets request `willReadFrequently: true`; resizing resets target state on each render |
| Numerical check | Presented-pixel maximum channel error ≤3/255 and mean absolute channel error ≤0.5/255; exact idle-target persistence |
| Failure | Required WebGL tests fail on unavailable/lost contexts; no silent CPU substitution; recreation is required after context loss |

The current renderer allocation guard permits up to four million pixels per source or output. This is a defensive limit, not an admitted performance tier. Arbitrary live DOM capture, video updates, blur/highlights, workers, recovery and framework adapters are outside this spike.

## Measurement and admission

The initial workloads remain one 320×180 CPU output and four 640×360 WebGL outputs displayed at 320×180 CSS pixels. The exploration targets are 30 CPU and 60 GPU updates per second. The original workloads and failures are retained when a reduced workload is measured.

The harness records source acquisition, setup, 90 warmed batch samples, Canvas2D copying, rAF cadence, optical revision-to-copy age, copy skew and explicit storage/resource estimates. Static source age, browser/driver memory, GPU completion and physical display latency are not measured by those counters. Raw measurements, captures and local execution notes remain outside version control.

The next admission work is to resolve the mobile alpha presentation discrepancy and establish reproducible quality/update tiers with p95 and storage budgets on the reference devices. Until those gates close, phase 1 is not complete and the production package phase has not started.

The [future roadmap](FUTURE.md) continues to reserve motion, Apple-inspired components, React Native and Flutter as separately scoped work.
