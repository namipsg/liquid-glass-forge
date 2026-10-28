# Phase 4: vanilla host, material and lifecycle

Implemented on 28 October 2026 after the owner authorized merging the verified
Phase 3 tree into local/remote `main` and continuing original Step 04.
The original Phase 1 measurements, numerical guards and Safari cadence waiver
remain unchanged. Both packages are private experimental `0.0.0-dev` artifacts.

## Delivered

- Stable generated or host-supplied decorative Canvas2D targets, readable
  glass/opaque CSS and a JavaScript-disabled declarative baseline.
- Native content, focus, input, keyboard selection, text selection and image drag
  preserved without layout shift or decorative hit interception.
- Bounded initialization/read/render, failure/abort, update/invalidation,
  pause/resume and terminal disposal, including late result/init cleanup.
- A shared source read, one in-flight batch plus latest dirty hosts, shared
  resize/scroll/intersection/document-visibility wakeups and no idle clock.
- Explicit borrowed/owned source handling, target backing/style/attribute
  restoration and typed invalid target/output/option failures.
- Packed CSS, host/scene ESM and declarations, physical offline installed vanilla
  consumers and strict SSR/type/export/package verification.

See [host API and boundaries](HOSTS.md). The adapter seam accepts a test producer;
this phase ships no optical renderer, worker, framework adapter or Phase 5 kernel.

## Verification

Local Node 24.12.0 passes **33 core/source/mapping/lifecycle unit tests**,
**9 package audit groups**, **3 installed vanilla browser consumers**,
**9 source/mapping browser tests** and **6 host/scene browser tests**.
All browser suites run Chromium, Firefox and Playwright WebKit. Both actual
core/DOM tarballs reproduce and install offline into physical temporary consumers
outside the repository, without source aliases or workspace symlinks.

Native interactions and generated/supplied target restoration pass in every
engine. Lifecycle fixtures exercise hung/failing initialization/source operations,
abort before/during/after allocation, pause/resume, double destruction, late
initializer/output reclamation and cleanup exceptions. Browser fixtures count
shared reads, subscriptions and pending deadline timers; settled idle has no
rAF, polling, timer or microtask activity. They check latest revision presentation,
hidden/resume, element-only resize, scroll viewport coordinates, hidden host
reveal, surface/pixel bounds and supported native View Transition readiness.

The real installed module/CSS graph exercises native input/click, test-producer
pixels, initialization, update, pause/resume and disposal, plus a page with
JavaScript disabled. Native WebKit button click delivery is checked separately
from input focus because clicking a button follows the browser's native focus
policy. Capture tests use a fresh page to keep trusted native capture/release
events independent of image-drag state; pointer cancellation is injected.
Failed test assumptions and raw receipts are retained privately.

The original **14 Phase 1 CPU/admission tests** remain required. All 17 original
tracked Phase 1 files match the Phase 3 base byte-for-byte; core source and its
original numerical tests are unchanged. The pinned [hosted workflow](https://github.com/namipsg/liquid-glass-forge/actions)
runs all checks on Node 20.19.6 and 24.12.0.

## Limits

CSS material and test-producer byte presentation do not establish CPU/WebGL
optical correctness or performance. Unsupported host containers and unreadable
supplied targets fail explicitly. Supplied targets are dedicated contexts;
Canvas2D drawing state is reset by resizing, while pixels/dimensions and owned
DOM changes are restored. Generic browser event-loop stalls can delay deadlines.

Visibility faults include deterministic injected document-hidden state; native
resize, scroll and supported View Transition cases use real browser APIs.
Playwright WebKit is not actual Safari or physical iOS qualification. No npm
publication, deployment, framework support or later phase is included.
