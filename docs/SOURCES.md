# Explicit sources and coordinates — experimental phase 3

`@liquid-glass-forge/dom` is private at `0.0.0-dev`. It acquires explicit readable
pixels and maps explicit geometry. Phase 4 adds a [host and shared scene](HOSTS.md). Optical rendering, framework
integrations and npm publication belong to later phases.

## SourceProvider

```ts
import { SourceProvider } from '@liquid-glass-forge/dom';

const source = new SourceProvider({ kind: 'canvas', value: canvas });
const snapshot = await source.read({ signal });
// snapshot.source: core PixelSource; snapshot.generation / snapshot.revision
source.invalidate(); // after the application draws new canvas pixels
source.destroy();
```

Supported specs are `pixels` (width, height, RGBA8 data), `image-data` (`value`),
`bitmap` (`value`), `image` (`url`, optional `crossOrigin`), `canvas` (`value`,
HTMLCanvasElement or readable OffscreenCanvas), and `video` (`value`, an existing
HTMLVideoElement). Video loading, playback and capture permissions belong to the
application. Sources cannot capture arbitrary DOM or bypass origin protections.

Every successful read returns a fresh independent, whole-buffer, transferable
RGBA8 snapshot with straight alpha in sRGB, bounded by core's 4,000,000 pixels.
Raw bytes and ImageData are copied synchronously before `read()` returns.
ImageData must be sRGB (legacy implementations without `colorSpace` are accepted).
Bitmap/image/canvas/video readbacks use a temporary Canvas2D and release its backing
store after acquisition. Browser rasterization may lose hidden RGB under zero
alpha and perform color conversion. Video bytes match native Canvas2D readback;
decoders and browser color management can differ across engines. The provider
implements no independent video decoder or optical color pipeline.

All supplied buffers, ImageData, bitmaps, canvas and video elements are borrowed.
The provider never transfers or detaches inputs, closes borrowed bitmaps, clears
caller canvases, changes playback, or clears a caller video URL. URL images are
owned temporary objects; listeners and URL are cleared on settlement. Returned
snapshot storage belongs to the caller, which can transfer it or release its
references. There is no buffer pool or snapshot `close()` operation.

`replace(spec)` advances generation and revision; `invalidate()` advances
revision. A newer read cancels the preceding read. Replacement, invalidation,
pause, destroy, an external AbortSignal and a deadline reject pending reads with
typed `SourceError.code`; late results cannot be delivered. `pause()` does not
pause the supplied media. `resume()` invalidates, and `destroy()` is terminal and
idempotent. Acquisition defaults to 5,000 ms (configurable 1–60,000 ms); browser
event-loop stalls can delay the deadline. Pixel readbacks themselves are synchronous.

Canvas updates require explicit `invalidate()`; canvas dimension changes are
also detected on read. Video dimensions, time, selected/requested URL and
`srcObject` changes are detected on read or through observation. A requested URL
which is not current, a seek in progress, absent current data or a media error
returns `UNAVAILABLE_SOURCE`. Non-null `mediaKeys` is rejected as
`UNREADABLE_SOURCE`; real encrypted-media playback is not qualified.

For automatic video invalidation, `subscribe(listener)` returns an idempotent
unsubscribe function. Notifications signal a dirty revision; call `read()` to
obtain pixels. With subscribers present, an active provider listens for media
source/resize/seek/playback/error events. While the video is playing and readable,
it requests at most one cancellable `requestVideoFrameCallback`, or polls changed
time at a 40 ms minimum timer interval when that capability pair is absent or
requesting it throws. Browser throttling may make updates slower. This is not a
frame-delivery guarantee. No clock is installed on import/construction or for
static/canvas sources. Last unsubscribe, provider pause, replacement and destroy
remove owned listeners and callbacks; paused/ended/unreadable media has no polling
timer. Source scheduling delegates page visibility to the Phase 4 scene, which unsubscribes while hidden.
Subscriber exceptions are isolated and ignored, so they cannot interrupt cleanup
or other subscribers. Applications should handle/report errors in their listener.

Security taint produces `UNREADABLE_SOURCE`; image decode/CORS request denial
produces `DECODE_FAILED`; unavailable readable frames produce `UNAVAILABLE_SOURCE`.
Other codes include `INVALID_SOURCE`, `UNSUPPORTED_SOURCE`, `ABORTED`, `TIMEOUT`,
`SUPERSEDED`, `PAUSED` and `DESTROYED`. A failure is a settled result, never a
permission to weaken CORS or silently substitute a different source.

## mapSourceRegion

```ts
import { mapSourceRegion } from '@liquid-glass-forge/dom';
const mapping = mapSourceRegion({
  source: { width: 400, height: 200 },
  box: { x: 0, y: 0, width: 100, height: 100 },
  target: { x: 0, y: 0, width: 100, height: 100 },
  fit: 'cover', position: { x: 0.5, y: 0.5 }, padding: 8, dpr: 2
});
if (mapping.ok) {
  // sample = { x: 100, y: 0, width: 200, height: 200 }
  // crop = { x: 92, y: 0, width: 216, height: 200 }, backing = 200×200
}
```

This function is pure and SSR-safe. Supply intrinsic source pixels and fresh
viewport CSS rectangles after scroll/resize; do not add document scroll offsets.
`box` is the untransformed content box, excluding border and padding. `target` is
the desired viewport output. Fits are `fill` (default), `contain`, `cover`, `none`
and `scale-down`. Position accepts fractions of remaining local space (default
0.5, 0.5), plus optional local CSS pixel `offsetX`/`offsetY`. Fractions can extend
outside 0–1, as CSS percentages can. CSS strings/edge-keyword parsing is not provided.

An optional affine transform `{a,b,c,d,e,f}` applies local -> viewport as
`box.origin + (a*x + e, d*y + f)`. Only positive axis scale and translation are
supported. Fold transform-origin adjustment into e/f; never pass an already
transformed bounding box and apply the same transform again. Rotation, skew,
reflection, zero scale, nonfinite coefficients and extra/perspective fields return
`UNSUPPORTED_TRANSFORM`. Caller-supplied geometry does not certify arbitrary CSS
ancestor transforms or compute their composition.

The visible sample intersects the painted object, transformed content box, target
and optional viewport `clip`. Letterboxes/outside portions remain absent.
`sample` is the unpadded source region; `crop` adds intrinsic-source-pixel `padding`
and clamps to source bounds. `sampleOffset` locates the sample within that crop.
`output` places the visible sample in the complete target backing; it may have
fractional offsets/extents. Preserve these offsets when clipping or padding;
stretching the padded crop over the whole target produces incorrect pixels.
Core's `sourceRect` accepts the crop, but a later renderer must account for the
unpadded sample/output mapping. This module performs no resampling or rendering.

Backing dimensions round `target.size * dpr` to nearest integers and must be
positive and within core's pixel limit. DPR changes backing only, never intrinsic
source coordinates. Invalid/overflow geometry returns `INVALID_GEOMETRY`; no
intersection returns `EMPTY_CLIP`. Successful metadata is frozen.

The source rules follow the browser's [canvas security model](https://html.spec.whatwg.org/multipage/canvas.html#security-with-canvas-elements).
Fit/position semantics follow [CSS Images](https://www.w3.org/TR/css-images-3/#the-object-fit).
Video callbacks follow the [video frame callback proposal](https://wicg.github.io/video-rvfc/).
