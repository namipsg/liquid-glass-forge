# Quality and release requirements

**Status: acceptance requirements, not a record of passing tests.** Implementation, test infrastructure and performance measurements are pending.

## Required evidence

| Layer | Behavior to verify |
|---|---|
| Numerical/unit/property | Independent bilinear/color/alpha fixtures, geometry bounds, zero-effect identity, finite output and lifecycle transitions |
| Browser integration | Actual output changes, decode/CORS failure, clipping/scroll/resize/DPR, worker blocked/unavailable and stale-frame rejection |
| Backend conformance | Independent optical fixtures on forced CPU/WebGL, declared numerical tolerances and proof of effective backend |
| Fault injection | Partial initialization, deadlines/abort, shader failure, unavailable GPU, context loss/rebuild and bounded fallback |
| Resource/lifecycle | Repeated mount/update/destroy, hidden/resume, source replacement, worker termination, disposal during work and bounded retained resources |
| Framework E2E | Native input/focus, prop updates, route replacement, production build, server imports and warning-free hydration |
| Accessibility | Decorative targets hidden from assistive technology, native semantics, reduced motion/transparency, forced colors, focus and contrast-preserving opaque mode |
| Distribution smoke | Packed packages installed into isolated vanilla/React/Vue/Angular consumers; build, first frame, update, fallback and disposal |

Track known regressions as reproducible fixtures. Numerical or visual baseline updates require review; do not silently accept a changed output to make a failing run pass.

## Environment policy

- Pull requests: type/lint/unit checks, browser-engine integration, affected framework fixtures and relevant packed-artifact smoke checks.
- Broader qualification: Windows/macOS browsers, exact advertised framework/browser version endpoints, worker/CSP variants, zoom/DPR and lifecycle cases.
- Release candidates: actual Safari and physical iPhone/iPad/Android devices, named desktop GPU configurations, sustained performance and resource checks.

A required WebGL lane fails if it falls back. Label software-WebGL evidence separately from hardware GPU results. Missing required hardware is missing validation, not a pass.

Playwright WebKit is not branded Safari, and mobile emulation does not establish physical-device behavior. Maintain environment-specific visual baselines. [Playwright browsers](https://playwright.dev/docs/browsers), [Emulation](https://playwright.dev/docs/emulation), [Visual comparisons](https://playwright.dev/docs/test-snapshots)

## Performance policy

Measure source acquisition, transfer, optical computation, upload/presentation, frame interval, stale-frame age, input responsiveness and owned resource counts separately. CPU callback duration is not a GPU duration measurement.

Feasibility work will select named devices/scenes and establish resolution, update-rate, p95 latency, memory and image-error limits before a supported workload is advertised. Include presentation copies and mask/filter costs. Do not promise full-screen CPU rendering at 60 FPS without evidence.

Use idle-scene, dynamic-video, multiple-surface, scroll/resize and animation workloads. Resource qualification includes repeated lifecycle cycles and sustained operation. Exact heap measurements may vary by platform; combine owned-resource counts with memory trends.

## Release requirements

1. Build from an identified source commit with pinned tooling.
2. Run the applicable numerical/browser/framework/device checks.
3. Pack each public package and validate the artifacts in clean consumers without workspace aliases.
4. Verify exports, declarations, assets, compatible package versions, licenses and notices.
5. Use a protected release workflow and npm trusted publishing/provenance where eligible.
6. Install the exact published candidate versions and repeat package smoke checks before promoting the recommended tag.

No runtime or native support claim precedes evidence. Supported combinations must distinguish optical refraction from functional CSS/opaque fallback. Publish fixes as new versions; rollback the recommended tag when needed. [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/), [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)
