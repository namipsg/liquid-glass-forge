# Phase 10: integrated resilience and access

Original Step 10/M28–M30 combines the existing renderers and four web adapters.
Implementation and verification follow the recorded owner-requested review method.
Packages remain private at `0.0.0-dev`; this is a
development commit boundary, without publication or a new support tier.

## Behavior change

Opaque material now supplies a solid system `Canvas` background on the host,
inherits `CanvasText`, and hides the decorative bitmap. Previously, optical
pixels could cover the opaque canvas background: a black source obscured black
text even in opaque mode. A screenshot regression failed in all three engines
before the fix and passes with it. Forced colors and reduced transparency use
the same solid treatment while retaining normal semantic DOM and input events.

The stylesheet's explicit-material host selector uses CSS `:has`, supported in
the recorded browser matrix. Applications with custom foreground colors still
own their contrast. Optical glass over an arbitrary source is not a universal
contrast guarantee. Switching to opaque does not dispose renderer resources or
change optical math; scene pause/disposal remains the resource policy.

## Physical packed consumers

`pnpm build`, then `pnpm test:faults` builds production vanilla, React, Vue and
Angular applications outside the workspace from seven physical tarballs. It
audits inventories, internal versions, external peers and installed bytes.
React/Vue/vanilla use Vite; Angular is AOT-linked with its supported TypeScript
toolchain and zoneless scheduling. No workspace aliases or runtime JIT substitute
for installed packages. Existing adapter suites independently retain production
SSR/hydration, React Strict Mode, Vue KeepAlive and Angular stable-view coverage.

Exact versions remain those qualified in [Phase 7](PHASE-7.md),
[Phase 8](PHASE-8.md) and [Phase 9](PHASE-9.md): React/React DOM 19.3.1, Vue 3.5.44,
Angular core/common 22.2.4, RxJS 7.8.2, Vite 8.3.5, Angular CLI/build 22.2.5 and
TypeScript 6.0.3 in the Angular consumer. Full integration runs on Node 24.21.0.
The separate Node 20 base lane retains its previous scope.

## M28: backend policy and restrictive CSP

Every adapter runs in Chromium, Firefox and WebKit with:

- Forced CPU main, required real module worker and forced WebGL. Assertions check
  changed pixels, effective backend/execution and actual GPU drawing diagnostics.
  Forced CPU must request no WebGL contexts.
- Unavailable GPU and injected shader failure with explicit CPU/material fallback.
  Forced GPU failure must produce a typed failure and zero fallback frames.
- Real worker crash, worker timeout, CSP worker denial, decode failure, tainted
  cross-origin pixels, rejected anonymous CORS request, source timeout and an
  initialization promise that resolves only after its deadline/abort.
- Native controls and readable material after failure; late cleanup remains
  mandatory. Expected failure cases do not silently retry.
- Native context loss where `WEBGL_lose_context` is available, followed by an
  explicit auto-to-CPU fallback. Deterministic GPU denial remains mandatory even
  when the native loss extension is unavailable.

Documents allow only same-origin scripts and workers; script policy allows
neither inline code nor eval. Styles allow inline declarations for framework and
host styles. Images allow the fixture origins; connect, base, frame and object
policies stay constrained. The denial document changes only `worker-src` to none.
Only that intentional denial may produce CSP violations, for its exact worker URL.

Console, network, page errors, unhandled rejections and policy violations are
retained. Expected CORS and cancellation diagnostics are tied to the specific
fixture URL/scenario. Narrow browser-driver diagnostics are recorded separately:
Chromium's startup calibration readback stall warning, Firefox/macOS's full-screen
`gl_VertexID` triangle emulation warning, and explicit context-loss warnings during
fault/cleanup scenarios. These are not performance admission. Other diagnostics
fail the lane; no console or CSP error is hidden globally.

## M29: access evidence and human review

`pnpm test:access` reproduces the black-optics opaque regression. The integrated
matrix also captures ARIA semantic snapshots, Chromium's native accessibility
tree, actual keyboard activation, input selection/focus and screenshots in light,
dark, forced-color and reduced-motion modes. Screenshot background samples and
the fixture's inherited foreground must retain at least 4.5:1 contrast in opaque
mode. The fixture's system-text focus outline must paint at the measured location
and retain at least 3:1 contrast against the opaque host. Native controls stay exposed; decorative canvases stay
hidden.

Forced-color behavior is capability-recorded per engine. Chromium additionally
uses its native CDP reduced-transparency emulation. Other engines retain the
mandatory explicit opaque path; unavailable emulation is not native preference
qualification. macOS WebKit's Tab behavior is compared against plain native DOM;
Option-Tab reaches all controls under the text-input-only system preference.
No user preference is changed.

The original plan requests human focus/contrast review. The owner directed
Chrome inspection or a concise review candidate as the alternative to complex
manual fixtures. That review-method substitution is recorded explicitly; a
human accessibility approval or native VoiceOver session is not claimed.

`node scripts/make-access-candidate.mjs <passing-receipt.json>` launches installed
Google Chrome in an isolated context, checks native keyboard/AX behavior and
builds one table of glass, light/dark opaque and focus screenshots for agent
visual inspection. `node scripts/review-resilience.mjs <exact-receipt.json>`
serves that compact candidate locally, with the interactive four-adapter fixtures
available separately. The original requirement, owner feedback and exact review
artifact hashes remain in private evidence.

## M30: combined regressions

The matrix combines native image drag, keyboard selection, element-only resize,
source replacement, route-away/back, View Transitions and repeated unmount/mount
with every forced backend. Idle scenes must stop optical work and rAF scheduling.
After each retirement, active initialization resources, subscriptions, workers and
leased GPU contexts must return to zero. Retained context slots remain bounded
by the existing cap of four.

View Transition update callbacks await initialized source subscriptions, which
are registered only after readiness settles. Rendering is checked after the
transition. All three transition promises are observed; aborts/timeouts fail.
This verifies readiness without making callback completion depend on a paint.
Native API availability is recorded; ordinary lifecycle behavior is mandatory.

Held genuine worker results test both superseded revisions and destruction.
Stale pixels must never paint, returned frames must release, terminated workers
must balance creation, and initialization cleanup arriving after abort must run.
Mutation checks remove the actual resize-observer setup and revision guard only
from the temporary installed DOM package, rebuild separate consumers and require
the same positive-path detectors to reject them. Installed bytes are restored;
workspace runtime source and production bundles are not mutated.

These scenarios derive from the earlier pinned upstream audit: reported stalled
initialization ([#3](https://github.com/ybouane/liquidglass/issues/3)), image drag
([#5](https://github.com/ybouane/liquidglass/issues/5)), idle-loop parking
([PR #1](https://github.com/ybouane/liquidglass/pull/1)), and contributor-reported
browser/resize/navigation/View Transition suites ([PR #6](https://github.com/ybouane/liquidglass/pull/6),
[PR #7](https://github.com/ybouane/liquidglass/pull/7)). The fixtures are independently
authored; this does not claim current upstream defects or reproduce upstream code.

## Evidence boundary

Raw receipts, failures, screenshots, accessibility data, CSP/network diagnostics,
consumer lockfiles and source/producer/artifact hashes remain ignored under
`private/phase-10`. The evidence index retains previous phase qualification and
failure anchors. No new physical-device, branded Safari, performance, soak or
release qualification is inferred. Those belong to Phase 11 and later work.
Disabled integrations, hooks, Jev variants and ECC remain disabled. No publish,
push or deployment is part of this phase.


## Recorded outcome — 3 November 2026

The final Node 24.21.0 full suite passed **130 Node/browser tests**, the
**seven-package reproducible/offline install smoke**, **23 React groups**,
**17 Vue groups**, **25 Angular groups** and **244 integrated resilience groups**.
The integrated total comprises two package/build groups, 20 groups for each of
12 adapter/browser lanes, and two deliberately broken regression mutations.
Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2 were recorded. Exact shader
failure reasons, zero released GPU handle counts and CSP worker fallback reasons
are asserted. Opaque inherited-text and focus-ring screenshot contrast exceeded
16.5:1 in the tested light/dark reference fixtures.

Installed **Google Chrome 156.0.8078.80** independently passed keyboard and native
accessibility-tree inspection on all four review applications. The agent visually
inspected the concise glass/light-opaque/dark-opaque/focus candidate. The requested
Chrome inspection substitutes for the manual walkthrough as described above;
there is no inferred human VoiceOver pass or broader assistive-technology claim.

The final integrated receipt is `private/phase-10/integration/run-nEpf4S/receipt.json`.
Its `access-candidate.png` is the single-page visual artifact; native Chrome
inspection data and panel images are under `review-www/candidate`. The full log
is `private/phase-10/full-regression-3.txt`. `private/phase-10/evidence.json` binds
these to current source/tooling/producer/installed-artifact hashes, all failed
attempts and previous qualification anchors. Earlier passing shader-labelled
receipts are explicitly superseded: the final injector reaches compilation,
whereas the earlier fixture failed during attribute validation.

Node 20.19.6 base build/import/six-package smoke and the frozen-lockfile offline
workspace install passed separately. Node 20 and Node 24 package bytes match for
their shared six-package scope. CI configuration was updated to allow the expanded
matrix's duration; no remote CI run is claimed. Temporary consumers, browsers,
mutation installs and review servers were cleaned up. Phase 11 remains future
work; no publish, push or deployment occurred.
