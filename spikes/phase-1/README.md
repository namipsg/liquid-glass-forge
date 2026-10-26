# Phase 1: CPU/WebGL feasibility

This standalone experiment tests JavaScript pixel refraction and a shared WebGL2 presentation path. It is not an installable library or the final optical model. See [scope and decisions](../../docs/PHASE-1.md).

## Run locally

Use Node.js 20.19 or later and pnpm 10.34.5. From the repository root:

```sh
pnpm --dir spikes/phase-1 install --frozen-lockfile --ignore-scripts
pnpm --dir spikes/phase-1 exec playwright install chromium firefox webkit
pnpm --dir spikes/phase-1 test:unit
pnpm --dir spikes/phase-1 test:browser
pnpm --dir spikes/phase-1 serve
```

Open `http://127.0.0.1:4173/` for CPU, WebGL and a separate live-DOM CSS material. Use `/?mode=cpu` to prevent any WebGL context request. The test server also uses port 4174 for CORS fixtures and serves only explicitly listed public spike assets.

Chrome must be installed separately for the `chrome` test project. The bundled WebKit lane is not actual Safari, and a mobile viewport is not a physical-device test.

Stop the development server before running the benchmark command:

```sh
pnpm --dir spikes/phase-1 benchmark --headed --admission chrome firefox webkit
pnpm --dir spikes/phase-1 benchmark --headed --admission --presentation=bitmap webkit
pnpm --dir spikes/phase-1 benchmark firefox webkit
```

The default benchmark runs Chrome, Firefox and WebKit without visible browser windows. `--admission` runs both original workloads twice and returns failure when a fixed gate is missed; a fast GPU batch alone does not override slow frame cadence. Select a browser explicitly and use `--headed` for a visible isolated session. Keep the desktop unlocked, the test window in front and other rendering workloads idle while measuring; record those conditions with the results. Browser tests and raw benchmark JSON/screenshots go to the repository's ignored `private/phase-1/results/` directory. Do not commit those artifacts.

`--presentation=canvas` is the default. `--presentation=bitmap` selects a separate main-thread experiment using `OffscreenCanvas.transferToImageBitmap()`. It requires that API and fails explicitly when it is unavailable. This is an experimental spike option, not a frozen library API or automatic performance policy. The bitmap path is much slower on the A04s; faster desktop batches have not consistently passed the cadence gate. See the [feasibility record](../../docs/PHASE-1.md).

## What is exercised

- CPU source preparation copies straight sRGB RGBA8 into linear-premultiplied Float32 storage. The JS kernel validates and samples pixels every frame. A bounded geometry cache and an exact-threshold-corrected byte lookup remove repeated geometry/power work; analytical tests constrain the result.
- WebGL2 uses one context and a shared atlas. Canvas presentation keeps the persistent output texture/FBO, blits once and takes one synchronous GPU snapshot. Bitmap presentation draws into the default framebuffer, snapshots once into a 2D OffscreenCanvas, transfers one bitmap, copies its tiles and closes it in `finally` before returning. It counts both snapshot and bitmap capacity and omits the duplicate output FBO. Both paths retain calibrated premultiplied-alpha bytes, `willReadFrequently: true` hints and nearest 1:1 copies. The context does not preserve its drawing buffer.
- Tests compare presented pixels with frozen maximum channel error **3/255** and mean absolute channel error **0.5/255**. They also cover independent analytical CPU fixtures, orientation, crops, alpha, forced CPU isolation, idle target persistence, resize, transparent replacement, teardown, context loss and real CORS restrictions.
- The default measured workloads are one 320×180 CPU output and four 640×360 WebGL outputs, each styled as 320×180 CSS pixels. These are explicit backing resolutions, independent of the browser's current device pixel ratio.

Benchmarks decode a static 640×360 image once, warm up 15 frames, then retain 90 samples while changing optical strength each frame. They report setup/acquisition separately, whole-batch duration including Canvas2D copies, rAF cadence, revision-to-copy completion age, first-to-last target copy skew, explicit storage estimates, presentation mode, document focus and window/screen geometry. CPU kernel/copy times and bitmap transfer time are separated. WebGL batch timing includes command submission and synchronous snapshot calls; it is not a GPU timer. None of these metrics measures physical display scanout or live-source freshness, and document focus alone does not verify native foreground state.

The renderers reject sources/individual outputs above four million pixels; batches also cap total atlas storage at four million pixels and 16 distinct targets. That defensive allocation limit is not a supported workload. There is no blur, dispersion, highlight pass, worker, source-update provider, DOM capture, automatic backend selection or context restoration here. Those belong to later phases.

## Actual Safari and USB Android

Start the fixture server in a separate terminal:

```sh
PHASE1_PORT=4183 node spikes/phase-1/server.mjs
```

For Safari, enable **Allow remote automation** in Safari's Developer settings, start `safaridriver -p 4447`, then run:

```sh
PHASE1_DEVICE=safari PHASE1_ADMISSION=1 node spikes/phase-1/device-check.mjs
```

For one attached Android device with USB debugging authorized, open Chrome on that device and connect its DevTools socket:

```sh
adb reverse tcp:4183 tcp:4183
adb reverse tcp:4184 tcp:4184
adb forward tcp:9225 localabstract:chrome_devtools_remote
PHASE1_DEVICE=android PHASE1_ADMISSION=1 node spikes/phase-1/device-check.mjs
```

The companion opens its own test tab/session, runs pixel/source/lifecycle checks, retains two benchmark runs, and exits unsuccessfully if a conformance or original-workload admission gate fails. The budgets are defined in `admission.mjs`; reduced runs cannot substitute for originals. A successful benchmark call does not imply admission to its target update rate. Safari's pre-navigation CPU context spy is explicitly unavailable through this WebDriver harness; its direct CPU path is checked after navigation. Restore temporary Safari settings and remove the three ADB mappings when finished. Raw receipts remain local under the ignored directory.
