# Phase 11: physical qualification checkpoint

**Status: incomplete; beta held.** M31–M33 retain their original acceptance scope.
The available physical runs, a genuine 30-minute worker campaign, and a support
manifest that withholds qualification are implemented. Missing hardware, failing timing, incomplete
soaks and rejected visual captures prevent an API/support freeze. Phase 12 has
not started. All seven packages remain private at `0.0.0-dev`.

## Candidate and protocol

[qualification-plan.json](qualification-plan.json) records the required physical
roles, four adapters, three forced backends, 100 lifecycle cycles and a minimum
1,800,000 ms dynamic soak per environment/backend campaign. Each soak covers all
four adapters concurrently; durations cannot be combined across environments or
backends. Missing identities remain explicit missing rows.

`pnpm qualification:prepare` packs and installs the seven packages into isolated
production vanilla, React, Vue and AOT Angular consumers. It copies their built
assets into a private candidate directory. Preparation alone reports `pass:false`.
Native runs consume an exact candidate receipt, with no workspace package aliases.
The current candidate is `private/phase-11/candidates/run-y6zicD/receipt.json`.

Original admission remains separate from the dynamic soak: a 640×360 static
source, changing optics, 15 warm-up and 90 measured frames, two complete CPU-main,
two required-worker and two GPU repetitions. CPU has one 320×180 output, service
≤33.333… ms, cadence ≤35 ms, age ≤50 ms and known image storage ≤8 MiB. GPU has
four 640×360 outputs, service/age ≤16.666… ms, cadence ≤17.5 ms and storage ≤16 MiB.
The GPU targets must all fit onscreen. The original source, optics and raw frame
series are checked again by the support gate, independently of producer pass flags.

Dynamic qualification changes one source pixel per completed batch and replaces
the full 640×360 source revision. Final native Canvas2D copies supply completion
timestamps. Captured rows record effective backend, worker execution, backing
geometry and owned storage. Known image accounting and owned-resource counts do
not measure browser heap, compositor or driver memory, thermal state or scanout.

## Physical results recorded on 3 November 2026

All three completed environments passed native name/count controls and **100
mount/dispose cycles in each of 12 adapter/backend combinations**. CPU and GPU
numerical conformance passed. Forced GPU identity was recorded on actual hardware.

| Environment | Original admission | Remaining qualification |
|---|---|---|
| Mac16,10 / Apple M4, macOS 26.6.2, Chrome 156.0.8078.80 | CPU-main service p95 34.8/34.9 ms; worker 35.0/34.7 ms: fail. GPU repetitions pass, all four targets onscreen. | One full worker soak passes; CPU/GPU soaks missing. |
| Same Mac, actual Safari 26.6.2 | CPU-main repetitions pass. Required-worker second service p95 34 ms fails; first passes. GPU repetitions pass. | All three soaks missing; React-worker final visual capture rejected. |
| Samsung SM-A047F/A04s, Android 14, Chrome 156.0.8078.79, Mali-G52 | CPU-main repetitions pass. Worker cadence 35.1/35.3 ms fails. GPU timing fails; last target extends below the viewport. | All three soaks missing; CDP images repeat content in a grid and are rejected as baselines. |
| Authorized iPhone 17 Pro Max / iPhone18,2, iOS Safari 27.0.1 | USB native session connects intermittently. Native input/click commands do not produce the expected edits/count. | Plain DOM controls reproduce the input failure. Automation/device diagnosis remains open; no library defect or physical pass inferred. |
| Physical iPad | No device supplied/observed. | Required row remains missing. |
| Additional named desktop GPU class | No host supplied/observed. | Required row remains missing. |

The iPhone plain-control diagnostic records trusted pointer/key events but no
input value change or count activation. Other attempts retain native session
creation errors. Settings were changed only by the owner in response to explicit
requests; the runners never enable automation, Web Inspector or device settings.
Only the expressly authorized phone was targeted. Android forwarding/reverse
mappings were restored; owned pages, drivers and servers were closed.

The Mac Chrome worker campaign ran **1,800,008.2 ms** in browser time and
**1,802,041.9 ms** on the host monotonic clock. Each adapter delivered over 53,000
frames, with p95 completion age **34.8 ms**, interval **34.9 ms**, and conservative
known image storage **8,358,592 bytes**. Each completed 100 lifecycle cycles;
active initializations, subscriptions, workers and leased contexts returned to
zero. Raw per-frame data remain in `frames.ndjson.gz` alongside the receipt under
`private/phase-11/soak/run-DmmAdR`. This is **one of 18 required campaigns**, not a
CPU/GPU/mobile or general sustained-performance qualification.

Agent inspection accepted 12 Mac Chrome captures and 11 Mac Safari captures for
their limited optical-output/layout scope. Safari React-worker lacked its optical
bitmap in the final capture. Android CDP captures have invalid repeated geometry.
Both findings remain unresolved capture/rendering issues; neither is silently
accepted or attributed to production code. There is no cross-engine baseline
substitution or new human accessibility approval.

## Commands and hold behavior

Run the full integration toolchain on Node 24.21.0 with the pinned pnpm version.
Physical collection is explicit and stays outside ordinary CI:

```sh
pnpm qualification:prepare
pnpm test:devices --candidate <receipt.json> --environment mac-chrome-m4
pnpm test:devices --candidate <receipt.json> --environment mac-safari-m4
pnpm test:devices --candidate <receipt.json> --environment android-a04s --serial <authorized-serial>
pnpm test:devices --candidate <receipt.json> --environment iphone --udid <authorized-udid>
pnpm test:soak --candidate <receipt.json> --backend worker
pnpm test:visual --candidate <receipt.json> --review <exact-image-review.json>
pnpm qualification:status --candidate <receipt.json> --visual-review <exact-image-review.json>
pnpm test
```

The current soak transport is installed headed Chrome on the local Mac. It does
not implement Safari or mobile sustained campaigns. Its generated iframe layout
supports the single-target CPU/worker workload; four GPU backing targets cannot
all fit inside each iframe. A future GPU campaign needs a source-bound layout
correction and a fresh full-duration run. The independent gate rejects reduced
GPU geometry. This limitation is retained rather than reporting an undersized run.

`--smoke` is a short diagnostic and cannot qualify a physical lane or soak.
`test:visual` requires exact image hashes and an explicit reviewer/observation;
missing/rejected captures fail. `qualification:status` regenerates visual status,
checks producer/source fingerprints, tarball identity and all required rows, and
exits nonzero while held. `--allow-held` permits writing an incomplete report; it
does not change its status. Nine counterfactual gate tests cover positive complete
evidence, shortened runs, changed budgets, missing images/hardware, hidden or
undersized targets, leaks, software GPUs, stale sources and failing raw timings.

## API and evidence boundary

[SUPPORT.json](SUPPORT.json) is the machine-readable **held candidate**, with
explicit missing/failing reasons. Its API inventory records exact exports and
declaration hashes from all seven tarballs. The API/support freeze is withheld.
Functional controls, opaque fallback, numerical optics, original admission and
sustained performance are separate claims. Earlier phases' accepted scope remains
recorded; this checkpoint does not certify a general browser or hardware tier.

Motion, component catalogs, React Native and Flutter remain planned and absent
from runtime exports/dependencies. No production package behavior changed in this
checkpoint, so package versions remain unchanged. Prior Phase 5–10 qualification
and failure anchors remain byte-identical. The Safari progression waiver remains
historical authorization to progress, never a passing performance result.

Private receipts, screenshots, rejected captures, plain-control diagnostics,
native logs, producer/source hashes, packed bytes and regression results are
indexed under `private/phase-11/evidence.json`. Disabled integrations/hooks remain
disabled. Nothing was published, pushed or deployed.

## Regression result

The final Node 24.21.0 `pnpm test` passed **139 Node/browser tests**, including nine
qualification gate tests, the seven-package reproducible/offline smoke, **23 React**,
**17 Vue**, **25 Angular** and **244 integrated resilience groups**. The integration
receipt is `private/phase-10/integration/run-dyMxwJ/receipt.json`; its seven tarball
hashes match the exact physical candidate. The full log is
`private/phase-11/full-regression.txt`. Strict visual and qualification-status
commands intentionally exit **1** for the incomplete matrix. Software regression
success does not close those physical acceptance gates.
