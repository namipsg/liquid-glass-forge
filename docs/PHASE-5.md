# Phase 5: CPU vertical slice — named workload qualified

The Phase 4 checkpoint is `bd441ed9b9de21f9d0406341cce709988ddfa148`,
verified against the prior chat and the clean local `main` tree. Its source,
host, lifecycle and ownership contracts remain the integration boundary.
Packages remain private experimental `0.0.0-dev` artifacts. The actual Safari
cadence waiver and all original Phase 1 numerical/admission checks remain binding.

## Original acceptance

| Loop | Required behavior and evidence |
|---|---|
| M13a | Linear-light premultiplied color/alpha, zero-effect presentation, independent scalar and analytical fixtures |
| M13b | Rounded rectangle/circle distance, bevel and normals; symmetry, limits and known samples |
| M13c | Displacement, bilinear sampling, padded crop edges; coordinate, identity and clamp fixtures |
| M13d | Cached separable blur; independently calculated impulse, constant and transparent-edge fixtures |
| M13e | Optional dispersion, tint and rim/specular finishing against frozen equations; disabled options preserve baseline bytes |
| M14 | Worker/main parity, owned transfers/pools, one in-flight plus latest pending, stale generation/revision rejection and termination/resize/disposal accounting |
| M15 | Observable resolution/update/pixel policy, forced CPU WebGL context spy, acquisition/transfer/kernel/presentation timings, admitted workload and isolated alpha consumer |

Final checks include existing unit/browser/fault/package checks and original
Phase 1 checks. Physical-device CPU fixtures must be rerun before claiming the
new renderer has inherited device admission. Playwright WebKit is not Safari.
No new device or performance qualification is implied by implementation tests.

## Optical design decision

The core `rounded-refraction-v1` contract and fixtures are unchanged. The CPU
package implements that baseline and an opt-in `rounded-material-v1` extension.
All geometric distances remain output backing pixels. Crop sampling clamps to
the complete explicit source, including pixels outside the crop; it never reads
the DOM. Pixel centers, y-tie normal selection, coverage, bilinear interpolation,
linear premultiplied color and final nearest-byte rounding follow CONTRACTS.md.

For the extension, a source-space integer box-blur radius `b` is 0–16. Each
horizontal then vertical pass averages `2*b+1` clamped samples in linear
premultiplied RGBA. A prepared source may cache only its most recent radius;
new preparation snapshots pixels, and disposal clears owned cached storage.
Blur precedes displaced sampling. Radius zero is the exact baseline path.

Dispersion `d` is 0–1. Red, green and blue sample displacement multipliers
`1+d`, `1`, `1-d`, respectively. Each color sample is unpremultiplied with its
own alpha (zero alpha yields zero color); central green sampling determines
output alpha. No dispersion uses one baseline sample. This explicitly specified
channel separation is an artistic model, not a physical refractive-index claim.

Tint is normalized straight sRGB RGBA. Decode tint RGB and mix straight linear
sample RGB toward it by tint alpha. Rim and specular strengths are each 0–1.
With the baseline squared bevel weight `w`, outward normal `n` and normalized
light direction `l` (default `[-sqrt(0.5),-sqrt(0.5)]`), define
`h=clamp(w*(rim+specular*max(dot(n,l),0)^8),0,1)` and finish each linear channel
as `c+(1-c)*h`. These operations preserve sampled alpha. Coverage multiplies
alpha last; rounded-zero alpha forces zero RGB. All disabled effects preserve
baseline bytes. Unknown/nonfinite/out-of-range options fail before rendering.

## Implementation boundaries

1. Kernel and independent oracle/fixtures have separate file ownership and
   consume this contract. A new SSR-safe CPU package exposes prepared storage,
   geometry samples and bounded reusable output; build/package integration
   follows the returned implementations.
2. Execution owns only its source snapshots/transfers, output leases and worker.
   It never detaches borrowed source storage. Worker failure has an explicit
   bounded main-thread fallback; forced CPU never requests WebGL.
3. DOM integration maps the existing source snapshot and host request into core
   surfaces, retains scene cancellation/stale-result rules and reports effective
   quality/backend. Quality caps do not replace measured admission.
4. Whole-phase QA retains original criteria. Missing physical-device access or
   failing performance remains an open acceptance item, not a synthetic pass.

## Implemented software and usage

The CPU package implements M13a–M13e and M14 execution. `prepareCpuSource` owns
private linear premultiplied storage; `renderCpu` accepts a core surface and
optional `CpuEffects`; `disposeCpuSource` invalidates and releases prepared
storage. Effects require `model: 'rounded-material-v1'`. The pure kernel supports
reusable output and at most one cached blur radius per prepared source.

`CpuExecutor.render(source, frame, {effects?,signal?})` snapshots pixels and
metadata before yielding, with one active batch and one pending latest batch.
Superseded, aborted and stale work rejects explicitly. Returned batches hold
output leases: call `release()` exactly once after consumption; later calls are
idempotent. Do not retain/use lease data after release. Outstanding leases count
against the allocation budget even after executor disposal until released.
Defaults are an 8 MiB output pool and a conservative 64 MiB live reservation
bound, configurable within 256 MiB. Worker termination records abandoned remote
storage separately. Required workers fail explicitly; auto falls back once to
JavaScript main execution; off never constructs a worker. Imports and constructors
acquire no worker or browser resource. The packaged native worker graph resolves
through relative assets, without inheriting a document import map.

Load DOM `styles.css` with the application's asset pipeline, then use:

```ts
import { SourceProvider, createGlassScene, createCpuRenderer } from '@liquid-glass-forge/dom';
const source = new SourceProvider({ kind: 'image', url: '/background.png' });
const renderer = createCpuRenderer({
  executor: { worker: 'auto' },
  surface: { radius: 24, bevel: 18, strength: 12 },
  effects: { model: 'rounded-material-v1', blurRadius: 1, dispersion: 0.1 },
});
const scene = createGlassScene({ source, renderer, ownsSource: true });
scene.attach(document.querySelector<HTMLElement>('#card')!);
await scene.ready;
// Later: scene.invalidate(), scene.pause(), scene.resume(), scene.dispose().
```

One renderer belongs to one scene. Initialization owns its executor and returns
per-initialization cleanup; pause/resume uses a fresh executor and stale cleanup
cannot destroy its replacement. Standalone `render()` requires initialization.
A terminal explicit `renderer.dispose()` is idempotent. The scene normally owns
initialization cleanup, target presentation and each returned lease release.

Default implementation caps are 320×180 backing dimensions, 57,600 output pixels,
230,400 source pixels and at most 30 starts/second. These are configurable
positive `quality` limits (rate 1–30), not admitted device tiers. Quality reduction
preserves aspect ratio as far as integer dimensions permit and obeys all bounds,
including one-pixel/thin surfaces. An excessive source fails explicitly before
optical preparation. There is no idle clock; an abortable rate timer exists only
for an actual pending render. Borrowed pixels are captured before that wait.
The backend remains CPU. Read `renderer.diagnostics` for effective dimensions,
reduction reasons, worker/main execution, pool/reservation/lease accounting and
timings. Source acquisition belongs to the source provider and is measured
separately by the benchmark.

Full-source sampling is the default. `sourceRect` can be an explicit source-pixel
rectangle or a callback over the fresh `RenderRequest`, including its viewport
rectangle. Applications can resolve their source mapping there. This does not
capture DOM or automatically reproduce arbitrary CSS transforms/clipping.

## Software verification and qualification history

`pnpm test` includes the original suites, independent numerical CPU fixtures,
source/cache/deadline/lease fault checks and actual worker and physically installed
CPU host consumers in Chromium, Firefox and WebKit. Private package tarballs are
packed twice, audited and installed outside the checkout for SSR/types/exports
and native-worker checks. Core and all Phase 1 sources/tests remain unchanged.

`pnpm bench:cpu` records two main and two worker runs, each with 15 warmup and 90
measured frames at source 640×360 and output 320×180. It copies the full source into a caller-owned acquisition buffer on every frame,
then changes radius36/bevel30 optical strength as `12+(i%20)/5`, matching the
original optical workload. It separately reports source acquisition, executor
snapshot, rate wait, worker staging, preparation, kernel, transfer submission,
round trip, completion pacing and Canvas2D presentation. Pacing is included in
service time; the start-rate wait is reported separately and included in age. Transfer
submission is synchronous `postMessage` duration; round trip includes worker
loading/scheduling/compute/transport, not isolated wire time. The owned-image
bound excludes browser/driver/compositor/GC overhead and is not a heap measurement.

The initial headless Chromium 156 runs measured service p95 about 13 ms and
presentation intervals about 37–37.6 ms. The latter **fails** the unchanged CPU
cadence budget of 35 ms (30 updates/second plus the original 5% tolerance).
The full timing series and all failed runs remain private. Faster kernel time
alone does not establish cadence or device admission. New capture-stage timing
observations retain the same original workload and limits.

The initial disconnected-device inventory and failed headless timings are retained
as historical evidence. The A04s is now connected. Current-source physical
conformance and full original workload admission were required before completion.
Actual Safari automation and its original cadence waiver remain unchanged;
Playwright WebKit does not replace actual Safari. The final current-source
physical result is recorded below; historical failures remain failures.

## Physical follow-up checkpoint

The reference Galaxy A04s (SM-A047F, Android 14, Chrome 156.0.8078.49)
passed ten main/worker numerical and presentation cases at the earlier checkpoint: maximum error 1 byte, mean at most 0.00344, exact idle preservation,
borrowed source integrity, native input and zero WebGL requests. CPU-backed
Canvas2D targets fix the observed one-byte translucent idle changes. A supplied
context retains its original creation attributes; this qualification uses the
library-created targets.

Exact byte lookup tables use 12,296 shared bytes per realm. Sensitive buckets retain the original near-half-byte fallback. Baseline rendering
uses a single prepared-owned geometry cache bounded to 270,000 bytes, with
Float64 mirrored corner data and straight-edge weights. Eligible opaque baseline
shapes may use compact geometry classification/scratch, or exact 2× RGB source
resampling plus an identity-region bitmask, within that same combined allowance.
Source resampling contains no mask, refraction or material: every frame applies
current optics, and changing strength changes warped edges. Ineligible/oversized shapes fall
back to the original geometry evaluation. Equal straight-edge distances select
y using a comparison before the common radius term, avoiding cancellation at
fractional radii. The versioned equations and numerical tolerances are unchanged.

`CpuExecutor({cacheSources:true})` retains one owned prepared source keyed by
frame generation/source revision/dimensions. It defaults off for the standalone
executor and on for the DOM adapter. Applications must follow the existing
revision/generation contract. Input bytes are still captured before asynchronous
work. Main/worker retained bytes are reported and conservatively charged; cache
replacement, termination and disposal release storage. Geometry bytes are also
included in `preparedStorageBytes`.

Historical fixed-strength diagnostic service p95 was 233–248 ms. Subsequent supported changes
reduced service p95 at an intermediate checkpoint to about 46–49 ms main and 57–61 ms worker. **Those
still failed** the original 33.333 ms service and 35 ms cadence gates. The conservative
earlier image bounds were 7,420,600 bytes main and 8,350,400 worker. Current conservative bounds are 8,346,296 main and 8,358,592 worker, below the unchanged
8 MiB limit; browser/driver/GC overhead remains excluded. No admitted 30 Hz
profile or completed Phase 5 was claimed at that checkpoint. All failures and raw repeats are retained.

The device harness is `scripts/qualify-cpu-device.mjs --serial DEVICE_SERIAL`.
It packs/installs real artifacts outside the checkout, owns one CDP page and only
its ADB mappings, and restores those mappings before exit. `--smoke`,
`--conformance-only` and `--idle-probe` are explicitly diagnostic; they do not
establish workload admission. Do not run a rebuild concurrently with artifact
packing.

## Current acquisition and pacing implementation

`SourceProvider.readInto(target)` supports explicit pixels/ImageData with full
synchronous copying into validated nonaliased caller-owned RGBA8 storage.
Default `read()` remains a fresh owned snapshot. Both benchmark lanes use a
preallocated acquisition target and still copy all pixels on every frame.

The executor captures borrowed input synchronously before deferred execution,
so adapter staging is unnecessary (`captureMs:0`). Actual starts obey the configured
rate deadline. A lazy owned deadline scheduler uses one coarse timer and at most
the final4ms of active message dispatch; it posts nothing while idle and closes
ports on cleanup. Consecutive active updates may hold a completed output until
the later of the previous successful output's ready time plus the configured
update period and execution start+28ms. This minimum phase prevents a delayed
start from shortening the next frame's completion margin.
Execution starts retain their independent strict rate limit. First/sporadic
outputs return immediately; late work anchors the next completion without
catch-up work. Aborted outputs do not advance the completion clock.
This measured `presentationWaitMs` is added
to service and remains inside completion age; slow work is never hidden.

The executor shares one byte budget across output pools and at most two private
input buffers. Required-worker execution transfers its owned synchronous capture
directly; auto execution retains a separate capture for fallback. Native workers
return their staging buffer for reuse; malformed,
aliased, duplicate or late replies cannot revive disposed storage. GlassHost
copies/presents every frame while reusing one ImageData and unchanged backing
dimensions. No final rendered surface is cached. All failed diagnostics remain
private and no 30Hz profile is admitted from diagnostic-only runs.

## Earlier full physical failure (2026-10-30)

The isolated installed artifacts from that campaign pass all14 numerical/presentation cases
(main and required worker), max1byte error, mean0.00344, exact idle, borrowed
integrity, native input/lifecycle and zero WebGL requests on the A04s above.
At that checkpoint, software checks passed119 unique tests plus the14 unchanged
Phase1 checks (133 total), including SSR/types/packing and three browser engines.

All runs use the restored changing-optics workload and15warmup/90measured frames.
Pacing and full per-frame acquisition are counted in service; all raw failures
are retained. That qualification is **failed overall**:

| Mode/repeat | Service p95 ms | Completion cadence p95 ms | Age p95 ms | Image bytes | Result |
|---|---:|---:|---:|---:|---|
| Main1 |30.3|34.3|34.2|8,346,296|passes frozen budgets|
| Main2 |30.6|34.4|34.3|8,346,296|passes frozen budgets|
| Worker1 |32.6|35.9|35.7|8,358,592|cadence fails|
| Worker2 |33.4|35.9|35.6|8,358,592|service and cadence fail|

Limits remain1000/30ms service,35ms cadence,50ms age and8MiB known image storage.
Main success did not close the required-worker gate or Phase5. That full
candidate remains a failure. A later completion-pacing candidate also failed
both worker cadence repetitions at35.3ms; neither failure was replaced by a
passing subset or an unchanged campaign replay.

The subsequent worker timing candidate removes the redundant required-worker
input copy and paces active output from the previous successful completion
instead of a fixed window after execution start. It preserves
the strict30Hz execution-start limit, full per-frame acquisition, original
optical waveform and every admission budget.

## Current full physical qualification (2026-10-31)

Current isolated installed artifacts pass the complete original workload on
Galaxy A04s SM-A047F, Android14, Chrome156.0.8078.49. All four repetitions use
source640×360, output320×180, radius36/bevel30/strength12+(i%20)/5,
15warmup and90measured frames. Every frame acquires the full source; completion
pacing remains included in service and age. All raw frames and prior failures
are retained, with runtime, installed-artifact and producer hashes.

| Mode/repeat | Service p95 ms | Cadence p95 ms | Age p95 ms | Known image bytes | Result |
|---|---:|---:|---:|---:|---|
| Main1 |31.9|34.1|33.9|8,346,296|passes|
| Main2 |31.5|34.7|34.4|8,346,296|passes|
| Worker1 |32.7|34.3|34.1|8,358,592|passes|
| Worker2 |31.0|34.8|34.6|8,358,592|passes|

The unchanged limits are1000/30ms service,35ms cadence,50ms age and8MiB known
image storage. All14 independent main/worker optical/presentation cases pass
(maximum1byte error, mean0.003439), with exact idle pixels, intact borrowed
inputs, native controls/lifecycle and zero WebGL requests. A private connection
adapter skipped only a pre-existing uninitialized blank tab; user tabs remained
open and unchanged, and owned ADB mappings were restored.

Software verification passes123 project tests plus14 unchanged original Phase1
tests (137 total), including SSR/types/build, isolated installed consumers and
Chromium/Firefox/WebKit suites. Three additional private connector tests pass.
This admits only the measured named workload. It does not establish full-screen,
60FPS, video/multiple-surface, broader-device or framework performance. The
original actual-Safari waiver remains unchanged; packages remain private
`0.0.0-dev`, with no deployment or publication.
