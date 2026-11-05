# Performance and reliability evidence

The measurements below come from named test campaigns and their installed
artifacts. The npm preview and the current showcase have separate build
histories. Use this evidence to choose workloads for your own acceptance tests.

## Recorded benchmarks

| Workload | Environment and setup | Measured result | Evidence |
| --- | --- | --- | --- |
| Required CPU worker, one 320×180 output | Galaxy A04s SM-A047F, Android 14, Chrome 156. Two runs of 90 measured frames each, after 15 warm-up frames per run. Changing optics and a full 640×360 source copy on every frame. | **34.3 and 34.8 ms** p95 completion interval, below the 35 ms limit. Service was 32.7 and 31.0 ms p95, age was 34.1 and 34.6 ms p95, and known image storage was 8,358,592 bytes. Both CPU-main repeats passed too. | [Phase 5 physical qualification](PHASE-5.md#current-full-physical-qualification-2026-10-31) |
| WebGL2, four 640×360 outputs | Galaxy A04s, Android 14, Chrome 156, Mali-G52. Static decoded 640×360 source and changing optics, with 90 measured frames after 15 warm-up frames per run. The 320×180 CSS targets were below the fold. | **13.5–16.3 ms** p95 batch time across two runs, with **16.7–16.8 ms** p95 completion intervals. Known image storage was 16,654,336 bytes. Both runs passed for this layout. | [Phase 6 recorded results](PHASE-6.md#recorded-results) |
| Dynamic worker soak across four adapters | Apple M4 Mac, Chrome 156. Vanilla JS, React, Vue and Angular ran concurrently for **30 minutes**. The workload changed a pixel and replaced the full 640×360 source revision each batch. | More than **53,000 completed frames per adapter**, with **34.9 ms** p95 interval and **34.8 ms** p95 age. Each adapter completed 100 lifecycle cycles. Tracked active initializations, subscriptions, workers and leased contexts returned to zero. | [Phase 11 physical results](PHASE-11.md#physical-results-recorded-on-3-november-2026) |

### Failures and limits

- Chromium with SwiftShader measured a **50 ms** p95 WebGL completion interval
  in both Phase 6 runs, above the 17.5 ms budget. [Phase 6 results](PHASE-6.md#recorded-results)
- The later Phase 11 A04s worker runs measured **35.1 and 35.3 ms** p95 intervals,
  above the same 35 ms limit. The Phase 11 Mac worker soak covers one of 18
  planned campaigns. [Phase 11 results](PHASE-11.md#physical-results-recorded-on-3-november-2026)
- A later playground candidate presented 299 lens frames in **5.002 seconds**
  in foreground Chrome, at **59.8 frames per second** and a **16.8 ms** p95
  interval. This was a 256×156 CPU worker output during a short local check.
  [Interactive CPU candidate](MATERIAL-LENS-CANDIDATE.md)

Sustained GPU and mobile coverage and physical iPad qualification remain open.
[Current qualification status](SUPPORT.json)

## What production teams can use

- **Frame pacing and freshness.** p95 is the 95th percentile. Completion
  interval measures the time between finished updates. Completion age measures
  how long the source revision takes to reach the last canvas copy. A low
  renderer service time can still leave controls showing stale pixels if work
  queues up. For Phase 6 GPU batch timings, source acquisition was measured
  separately. Canvas completion is the endpoint of these tests. Display
  scanout and input latency are outside the measurement.
- **Resource budgets.** Known image storage counts the image buffers described by
  each benchmark. Heap, compositor, and driver memory require separate
  measurement. Use the size and count of active surfaces to plan capacity in
  dashboards and other multi-panel interfaces.
- **Lifecycle and fallback.** Long-running apps repeatedly open routes, modals,
  and workspaces. Soaks and mount/dispose cycles exercise resource cleanup that
  short rendering tests miss. Test native controls under CSS and opaque
  fallback on configurations where your preferred renderer is unavailable.

## Reproduce locally

Build the workspace and install the Playwright browsers before running the
software benchmarks.

```sh
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm bench:cpu
pnpm bench:webgl
```

These commands write private receipts and identify the browser and renderer
under test. For physical acceptance, use the
[qualification protocol](PHASE-11.md#candidate-and-protocol) with a frozen
candidate, the browsers and devices your app targets, and the same surface
count and geometry you intend to ship.
