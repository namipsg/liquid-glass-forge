# Phase 3: explicit sources and coordinate mapping

Implemented on 28 October 2026, continuing the previously verified static-source
wave. Core and DOM remain private experimental packages at `0.0.0-dev`.

## Delivered

- Independent owned RGBA8 snapshots from application bytes, sRGB ImageData,
  borrowed ImageBitmap, decoded URL images, canvas and video.
- Revision/generation invalidation, latest-read cancellation, abort/deadline,
  provider pause/resume and terminal disposal. Borrowed media remains caller-owned.
- Lazy video invalidation using a cancellable native frame callback or bounded
  event/timer fallback; source/time/resize changes and typed unreadable/unavailable
  failures. Canvas drawing uses explicit invalidation.
- Pure object-fit/position, padded crop, clipping, viewport scroll/resize, DPR and
  positive axis scale/translation mapping, with typed unsupported geometry.
- Two reproducible tarballs, physical offline installation, strict public types,
  SSR import traps, export encapsulation and packed imports in three browser engines.

See [source API and limits](SOURCES.md) for usage, units, ownership and scheduling.
This phase adds no DOM host, optical renderer or framework adapter.

## Verification

Local Node 24.12.0 passes **26 core/source/mapping unit tests**, **9 package audit
fixture groups**, **3 packed-package browser import tests** and **9 source/mapping
browser tests**. Browser coverage includes Chromium, Firefox and Playwright
WebKit: actual decoded image/video/canvas bytes, controlled same/cross-origin
servers, cancellation, ownership, media resizing/replacement and native/timer
scheduling. Mapping pixels agree with screenshots of native CSS object-fit across
scroll, resize, DPR 2, clipping and positive scale/translation (six cases per engine).
Hand-calculated geometry fixtures cover all five supported fits and invalid inputs.

Both packages are packed twice and compared by SHA-256, then installed together
in a temporary consumer outside the repository without workspace aliases or
symlinks. Its ESM, strict TypeScript, SSR import traps, owned pixels and rejected
deep imports are checked. Both physical packed module graphs also run in browsers.
Artifacts and raw failure receipts remain local and ignored.

The original **14 phase 1 CPU/admission unit tests** pass. All 17 tracked phase 1
files match the phase 2 base byte-for-byte, including numerical guards.
The pinned [GitHub workflow](https://github.com/namipsg/liquid-glass-forge/actions)
runs the full suite and phase 1 unit checks on Node 20.19.6 and 24.12.0.

## Findings and limits

Ideal RGB primary assertions for video exposed decoder/color-management differences
across engines. Tests instead compare every provider byte exactly with direct
native Canvas2D video readback, while independent red/blue frame identity verifies
content and seeking. Exact PNG/canvas/coordinate-color fixtures and original optical
tolerances are unchanged. A wide-video fixture initially retained a compensating
pixel aspect ratio; the corrected square-pixel fixture verifies a real 16→32
intrinsic-width change. The original failures are retained privately.

Encrypted-media rejection is tested with an injected `mediaKeys` condition, not
real protected playback. Geometry is explicit; arbitrary CSS string parsing,
ancestor transform discovery and DOM capture are unsupported. Source acquisition
requires readable browser APIs, can allocate up to the core pixel bound, and is
not a performance admission or zero-copy claim. Synchronous browser readbacks
cannot be preempted by an acquisition timer.

Playwright WebKit is not actual Safari or physical iOS evidence. The original
Safari/WebKit cadence failures and the owner's progression waiver remain intact;
they have not become passing measurements. No hardware qualification, npm
publication, stable support promise or later phase is included.
