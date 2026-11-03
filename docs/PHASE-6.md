# Phase 6: shared WebGL2 rendering

Status on 1 November 2026: original Step06/M16a–M18 exit evidence is complete
and the implementation is frozen for independent review. Installed-package
software checks, the physical A04s and actual Safari 26.6.2 checks pass. Earlier
Phase 5 qualification and historical failures remain preserved. Packages remain
private `0.0.0-dev`. Broader device, sustained performance and release qualification
remain open; these measurements do not establish a general support guarantee.

## API and ownership

```js
import { SourceProvider, createGlassScene } from '@liquid-glass-forge/dom';
import { createWebGLRenderer } from '@liquid-glass-forge/webgl/dom';
const source = new SourceProvider({kind: 'canvas', value: readableCanvas});
const renderer = createWebGLRenderer({surface: {radius: 36, bevel: 30, strength: 12}});
const scene = createGlassScene({source, renderer});
const attachment = scene.attach(semanticContainer);
await scene.ready;
// Explicit invalidation follows producer changes; there is no animation clock.
source.invalidate();
// Dispose when finished. The caller owns the supplied source provider.
scene.dispose(); source.destroy(); renderer.dispose();
```

Import and construction allocate no browser, network, worker or timer resources.
Initialization creates a lazy WebGL2 lease. Forced WebGL throws on failure;
forced CPU never creates a GPU context. `createOpticalRenderer({backend:'auto',
fallback:'cpu'})` or `fallback:'material'` explicitly permits a downgrade. `none`
throws. Diagnostics expose effective backend and reason. Downgrade lasts until a
new initialization; there is no timer or automatic retry loop.

The optional `/dom` entry consumes the existing CPU and DOM packages. The DOM
package does not import WebGL. Pixel-returning CPU adapters retain their original
contract. Native batch adapters prepare stable host targets and return a
`presentedTarget` token after synchronous copies. Standalone GPU frames return an
owned canvas and idempotent `release()`: retain the backing until release, even
after renderer disposal. One renderer belongs to one scene or standalone owner.

Scene/core bounds remain 16 hosts and 4,000,000 output pixels per batch. Direct
`WebGLAtlas` accepts 1–50 tiles under the same aggregate atlas-pixel bound and
actual texture/viewport limits. The 50-tile resource fixture uses 64×36 tiles;
it does not claim 50 full-resolution 60 Hz surfaces. Manual canvas leases are
bounded to 16 outstanding frames / 16 MiB, with at most two pooled canvases.
Default adapter output caps are 2048×2048 and 4,000,000 pixels; diagnostics report
requested/effective size. CPU fallback retains the admitted CPU quality limits.

## Color, optics and presentation

The source upload is straight sRGB bytes, with unpack alignment 1,
no Y flip, no premultiplication and no browser color conversion. Initialization probes all 256 byte levels of the native sRGB sampler through
packed 16-bit linear values and a synchronous Canvas2D calibration copy. The fixed
maximum re-encoded error is 0.075 byte. Passing samplers use SRGB8_ALPHA8; other
samplers use RGBA8 and explicit shader decoding. Both paths decode before
premultiplication and interpolation. Diagnostics expose the choice and probe
error; this is an accuracy capability check, independent of browser name and
timing. Low image budgets skip the probe and use explicit decoding. It repeats
when handles are rebuilt. Temporary probe backing is released. There is no GPU
readback after initialization beyond the required Canvas2D presentation copies.
Source row zero is top; framebuffer coordinates are inverted explicitly.
The frozen `rounded-refraction-v1` and `rounded-material-v1` equations are unchanged.
Dispersion uses red/green/blue displacement scales 1+d, 1, 1-d and green alpha.
Tint, rim and eighth-power directional specular operate in linear light.

Blur is two clamped separable source-space box passes, radius 0–16, in linear
premultiplied RGBA32F. Radius zero releases blur storage. Nonzero blur requires
[EXT_color_buffer_float](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/)
and fails explicitly if unavailable. A bounded encoding table preserves byte
thresholds. A tiny Canvas2D calibration identifies nearest/upward premultiplication
storage; unknown storage fails explicitly. There is no production `readPixels`.

Persistent RGBA8 atlas tiles are cleared and drawn when dirty. Each update then
blits the atlas FBO to the default framebuffer, takes one Canvas2D snapshot and
copies dirty tiles to stable Canvas2D targets **before returning or yielding**.
The default framebuffer uses alpha/premultipliedAlpha true, preserveDrawingBuffer,
antialias, depth and stencil false. No later callback depends on its contents.
Idle updates advance the accepted revision without drawing/copying. Repacking,
source revision, effects, target or dimensions invalidate the required tiles.
Transparent replacement clears old pixels. Targets have drawing state reset.

## Resource lifetime and recovery

A default atlas owns one leased context, three textures, one framebuffer and two
programs when blur is disabled; blur adds two float textures and framebuffers.
Shader handles are deleted after linking. Initialization and allocation failures
release partial handles, including repeated incomplete-framebuffer failures.
Image accounting includes source, atlas, default framebuffer, snapshot, encoding
table and blur; budget checks include resize overlap. The default image budget is
64 MiB, configurable up to 256 MiB. Caller targets/input are separately accounted
in benchmarks. Browser/driver allocations are not exact heap measurements.

The lazy context pool is capped at four slots. Disposal deletes owned handles and
returns a resource-free 1×1 context lease; sequential scenes reuse the lease.
`releaseIdleWebGLContexts()` explicitly removes idle/lost slots. Context loss
invalidates all GPU handles; restoration rebuilds programs, textures and FBOs and
forces source upload/redraw. The default is two successful restore attempts,
configurable from zero to four. Exceeding the limit exposes `RESTORE_LIMIT` and
unavailable state. No stale handle is reused.

## Evidence and remaining acceptance

`private/phase-6/evidence.json` indexes current source/producer hashes, installed
artifacts, commands, failures, resource counts, numerical edge/interior errors and
physical results. Historical failure receipts remain retained. Duplicate tarballs
may be removed only with a verified complete identical copy, mapped in the cleanup
manifest. Numeric tolerance remains maximum channel delta 3 and mean 0.5.

Run `pnpm check`, `pnpm test:webgl`, `pnpm test:webgl-browser`, `pnpm test:pack` and
`pnpm bench:webgl`. The private physical collector is
`node scripts/bench-webgl.mjs --device`, restricted to authorized SM-A047F serial
RZ8T914M92R. It creates/closes its own page and ADB mappings and preserves user tabs.
Builds and tarball packing must run sequentially.

The original benchmark is four 640×360 surfaces, 640×360 static decoded source,
radius 72, bevel 60, strength 12+((frame+surface)%20)/5, 15 warmup and 90 measured
frames, twice. Targets use the original 320×180 CSS size and the original Phase1
HTML measurement-stage layout. The initial diagnostic collectors used 160×90 CSS
targets and are retained as failures; those cannot establish unchanged admission. Limits remain p95 service 1000/60 ms, cadence 1.05×1000/60 ms,
completion age 1000/60 ms and 16 MiB known image storage. Source acquisition is
reported separately. Completion age is rAF revision to last synchronous target
copy; it is not physical scanout or live-source latency. No reduced workload can
substitute for this acceptance workload.

Headless Chromium/Firefox/WebKit evidence identifies actual GL renderer strings
and is distinct from the physical Mali-G52 A04s lane. Playwright WebKit is not
branded Safari. The original [Safari cadence waiver](PHASE-1.md) is unchanged;
it does not turn failed measurements into passing results. Broader device,
sustained-use, framework and release qualification remains later planned work.


The original Step06 requires benchmark evidence; Step11/M32 owns the broader
passing-performance qualification. No extra Phase11 gate is substituted for
Step06, and no benchmark failure or missing environment is counted as a pass.
The first actual-Safari attempt failed because Allow remote automation was off.
The human enabled it and explicitly authorized the subsequent check. The agent
changed no browser or OS setting. Both receipts remain retained. The successful
owned WebDriver session was closed; existing user tabs were preserved.

## Recorded results

The full regression command passed 127 Node/browser checks, plus reproducible
four-package offline install, public exports, strict type-consumer and SSR checks.
The final GPU-only option-snapshot refinement was checked with the final SSR,
installed GPU/browser and four-package smoke commands. All 14 original Phase1
unit checks and all 48 original browser checks pass without changing their source,
tolerances or fixtures; their new reports have separate output paths.

All five current lanes (headless Chromium, Firefox, WebKit, physical A04s and
branded Safari) pass 12 independent numerical cases. Maximum oracle channel
errors are respectively 2, 1, 1, 2 and 1; the largest case mean is below 0.046.
Edge/interior counts and errors are retained separately, with maximum interior
error at most 1. Cases include even/odd circles, fractional radius/crop, alpha,
material/dispersion, three blur fields and the original half-texel waveform.
Actual presented Canvas2D pixels are compared against the scalar oracle and CPU;
native-control screenshots are retained as additional integration evidence.

| Environment | p95 batch ms, repeats 1 / 2 | p95 cadence ms | p95 completion age ms | Outcome |
|---|---:|---:|---:|---|
| Physical A04s, Android14, Chrome156, Mali-G52 | 16.3 / 13.5 | 16.8 / 16.7 | 16.4 / 16.5 | Recorded repeats pass |
| Actual Safari26.6.2, macOS, Apple GPU | 1 / 1 | 14 / 14 | 1 / 1 | Recorded repeats pass |
| Headless Chromium / SwiftShader | 43.3 / 35.2 | 50 / 50 | 55.2 / 49.8 | **Timing fails** |
| Headless Firefox / reported Apple M1 | 4 / 4 | 14.24 / 14.20 | 3.66 / 3.72 | Recorded repeats pass |
| Playwright WebKit / reported Apple GPU | 2 / 2 | 14 / 14 | 2 / 2 | Recorded repeats pass |

Known image storage is 16,654,336 bytes in each workload, below the unchanged
16,777,216-byte bound. This is not exact heap/driver memory. The original HTML
measurement stage is below the fold in the recorded physical views (A04s stage
starts near y1590 CSS px; Safari near y1159). Those exact display conditions and
320×180 CSS targets are retained in raw receipts. This measures the original
synchronous-copy workload; sustained on-screen scenes and live-source latency
need later qualification. A04s completion age has little headroom. Its successful
lane selected explicit shader decoding (probe error0.39128); that pass is not
attributed to the native sRGB sampler. Current Safari passes do not establish a
repair or repeatability of the historical Safari cadence issue.

Each lane verifies one context / three textures / one FBO / two programs without
blur across 1, 10 and 50 small surfaces, and one reused context across 20 sequential
atlas lifetimes. Blur adds exactly two textures/FBOs. Forced compile/link/allocation
failures and 12 repeated incomplete-FBO failures release partial handles. Two loss/
restoration cycles rebuild handle generations1→2→3; the next loss reaches the
configured limit. Explicit unavailable/auto CPU/material policy and forced CPU
zero-WebGL requests pass. Stable host targets survive idle/source changes and
pause/resume; supplied targets restore even after a synchronous pending copy.

Current raw receipts and exact source/producer/artifact hashes are indexed in
`private/phase-6/evidence.json`. All selected installed artifacts match the final
reproducible package-smoke hashes. No publish, push, deployment, next phase,
plugin activation or settings change was performed. Independent review can use
the frozen implementation and index without replaying unchanged timing campaigns.
