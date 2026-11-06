# Quality and release requirements

**Status: acceptance requirements.** Core/source/host/package and [Phase 5 CPU checks](PHASE-5.md) pass, including the named A04s workload. [Phase 6 WebGL](PHASE-6.md) has installed-browser, physical A04s and actual Safari26.6.2 exit evidence, frozen for independent review. The SwiftShader timing failures and historical Safari cadence waiver remain recorded. [Phase 7 React](PHASE-7.md) verifies Strict Mode and packed Vite/Next.js SSR/hydration in Chromium, Firefox and WebKit. [Phase8 Vue](PHASE-8.md) adds KeepAlive and packed Vue/Nuxt SSR/hydration checks. [Phase9 Angular](PHASE-9.md) covers partial APF, zoneless lifecycle and packed production CSR/eager SSR hydration. [Phase 10](PHASE-10.md) combines forced backends, CSP faults, access and lifecycle regressions across all adapters, with owner-requested Chrome inspection and a concise visual candidate. Broader device/performance/release qualification remains pending; Phase 1 measurements and its Safari cadence waiver remain documented.

[Phase 11](PHASE-11.md) adds native physical collection, a real 30-minute worker
soak and a [held support candidate](SUPPORT.json). Timing failures, rejected
captures, missing physical iPad/additional GPU and outstanding soak campaigns
prevent beta qualification. The gates preserve the original budgets and reject
short diagnostics, incomplete visuals, changed artifacts and software GPU claims.

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

The hosted contract matrix runs the base suite on Node 20.19.6 and the full
suite on Node 24.21.0. On Linux CI, the required Firefox WebGL lane runs under
Xvfb with software OpenGL. The Firefox fixtures still assert the effective
backend and optical tolerances. The hosted rehearsal and npm prepare workflows
apply the same Firefox configuration to the frozen-artifact consumers.

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
