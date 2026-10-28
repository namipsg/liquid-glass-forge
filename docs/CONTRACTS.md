# Core contracts — experimental version 1

Core version 1 defines data and validation. Phase 3 adds a private DOM source
and coordinate package, specified in [source contracts](SOURCES.md). Phase 4 adds a [vanilla host and shared scene](HOSTS.md). CPU/WebGL
renderers and framework integrations remain planned.

## Source and ownership

`createSource` validates an explicit RGBA8 byte view and returns frozen metadata.
`contractVersion` is 1, color space is `srgb`, alpha mode is `straight`, dimensions
are positive integers with at most 4,000,000 pixels, and revision is a nonnegative
safe integer. Unknown fields and other formats/versions fail with `ContractError`.
Shared and detached buffers are rejected. Views from another JavaScript realm
are accepted. A borrowed subview need not cover its entire backing buffer.

`ownership: 'borrowed'` retains the supplied byte view. Validation never copies,
mutates, detaches or closes it. Freezing metadata does **not** freeze its pixels.
The application must increment revision when pixels change; a later renderer
must snapshot borrowed pixels before asynchronous work. `ownership: 'transfer'`
is explicit permission for a future owner to transfer a complete dedicated
buffer; it requires a whole-buffer view. Creating or validating the descriptor
itself never transfers anything. Phase 3 providers return independent owned snapshots; no transfer pool exists.

## Frames and lifetime

`createFrame(input, source)` snapshots metadata for 1–16 uniquely identified
surfaces, with at most 4,000,000 output pixels in total. Width/height are integer
backing pixels. Crop coordinates are source pixels and may be fractional, but
must remain within the source. Radius, bevel and strength use output-pixel units.
Radius is 0 through half the smaller dimension, bevel is positive, and bevel and
strength are capped at 1,000,000. Defaults match the refraction feasibility model.
These allocation guards do not establish admitted performance tiers.

A frame carries generation, frame revision and source revision. It must name the
current source revision. `isCurrentFrame` compares all three IDs before accepting
a future asynchronous result; callers must advance generation on replacement or
destruction. This pure comparator does not queue, cancel or render work.

The pure lifecycle specification permits new → initializing → ready, ready ↔
paused, failure from initializing/ready/paused, and destruction from every state.
Destruction is terminal and idempotent. Failed initialization does not silently
retry. A later engine must settle initialization, reclaim partial allocations,
allow only one in-flight batch plus one pending latest revision, and recycle or
close owned stale results. None of those resource operations is implemented by
this core package.

## Optical model: rounded-refraction-v1

This version describes the existing refraction-only experiment. It includes no
blur, dispersion, tint, highlights, arbitrary DOM capture or Apple assets.

For output pixel center `(x + 0.5, y + 0.5)`, subtract half the output dimensions
to obtain `p`. With corner radius `r`, define `q = abs(p) - (size/2 - r)` and
`a = max(q, 0)`. Signed rounded-rectangle distance is
`d = length(a) + min(max(q.x, q.y), 0) - r`. Coverage is `clamp(0.5 - d, 0, 1)`.
The outward normal is `a / length(a) * sign(p)` outside the straight-edge region;
inside, choose the dominant component of `q` (ties select y). Bevel weight is
`clamp(1 + d / bevel, 0, 1)^2`.

Map each displaced output center through its crop:
`s = crop.origin + (pixelCenter + normal * strength * weight) * crop.size / output.size - 0.5`.
Clamp displaced coordinates to the complete source boundary. Bilinear sampling
uses the four adjacent source pixels. Decode sRGB RGB to linear light, multiply
by alpha, interpolate, then unpremultiply for nonzero alpha and encode sRGB.
Coverage multiplies alpha. Byte output rounds to nearest; RGB is zero when the
rounded output alpha is zero. This core exposes color-reference functions,
not the complete image kernel. The phase 1 spike remains separate.

`decodeSrgb`, `encodeSrgb` and `interpolateRgba` take normalized values. Fixed
analytical fixtures include linear half-light encoding to 0.7353569830524495 and
transparent hidden-color suppression. Renderer parity alone is not an oracle.
The original phase 1 max 3/255, mean 0.5/255 and exact idle tests are unchanged.

## Extension boundaries

Future motion/gesture producers must produce one revisioned frame snapshot with
one writer per property. SVG joining does not alter optical coverage; freeform
shapes require a later shared geometry contract. React Native needs native
adapters; Flutter needs Dart code. Their contracts and implementations are future
work, not current exports.

## Packaging and verification

The private `0.0.0-dev` core and DOM source packages build ESM plus declarations with no runtime
libraries, browser globals, workers, network requests or import timers. It has no
consumer install hooks. Tests install an actual tarball in an independent
consumer, type-check its public exports, and reject undeclared deep imports.
A separate browser smoke imports the packed JavaScript in Chromium, Firefox and
WebKit. These tests do not qualify a renderer or actual Safari/iOS performance.

The manifest auditor rejects absent JS/declarations/CSS/worker assets, unsafe
paths, install hooks and internal version drift. Its peer fixture intentionally
supports exact versions only; peer ranges are rejected explicitly. Actual core
has no peers. Framework peer-range validation belongs to the adapter phases.
