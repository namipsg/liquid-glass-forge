# Local refractive lens candidate

This is unpublished working-tree behavior for manual review. The sealed
`0.1.0-rc.1` npm artifacts, default v1 material and qualified workload criteria
remain unchanged. Build the local site with `node scripts/showcase-build.mjs --working-tree`; its release metadata disables the published-install claim.

## Opt-in optical model

`effects.model: 'refractive-lens-v2'` selects an air-to-glass ray through an
elliptical bevel. The original `rounded-material-v1` path is retained, including
when effects are omitted. Both models share the existing explicit sources,
rounded SDF, antialiased coverage and linear-premultiplied color pipeline.

For SDF bevel weight `w`, let `u = sqrt(w)`, `nz = sqrt(1-u²)`, `eta = 2/3`,
and `b = sqrt(1-eta²u²) - eta*nz`. The v2 displacement coefficient is
`-u*b/(eta+b*nz)`. Sampling offset is that coefficient times strength, the
outward 2D normal and source/output scale. This is equivalent to the tangent of
the difference between incidence and refraction angles for index 1.5. It traces
inward, allowing magnification/folding at the rim rather than the v1 outward
sampling offset. The index is a modeling assumption, not a recovered Apple value.

Existing blur, dispersion, tint, rim and specular options retain their meanings.
Zero strength leaves sampling undisplaced. RGB dispersion remains optional.

## Explicit interactive CPU policy

`cpu.quality: { cadence: 'interactive', maxUpdatesPerSecond: 60 }` permits a
higher ceiling during active work. The default and explicit `balanced` policy
still limit requests to 30 Hz; a rate above 30 without the opt-in remains invalid.
Memory/source limits, owned snapshots, cancellation and idle teardown remain.
The showcase uses a smaller 256×160 / 40,960-pixel output cap for this candidate.
That is a visible quality/latency tradeoff, not a hardware admission or a promise
that every device reaches 60 FPS. Published rc.1 does not include this option.

## Evidence and limits

The same iOS 26.2 Simulator Clear capture, source image and capsule geometry were
used for a bounded v1/v2 parameter study. On that case, the best tested v1 had
masked RGB RMS 25.31 overall / 36.68 at the rim; v2 had 14.32 / 16.24. This is
one local appearance comparison, not global optimization or an exact Apple match.
Regular retains the accepted v1 approximation. See
`private/calibration/20261104/lens-v2/` for preserved fits and source checkpoints.

Focused checks cover legacy scalar agreement, an independent trigonometric
Snell-law calculation and cadence-policy boundaries. A local Chrome readback
compared CPU and GPU for both models: maximum premultiplied-byte difference 1
on the 24,000-pixel fixture. Physical performance, wide browser/device coverage,
and native motion parity remain open. Older qualification failures and receipts
are not superseded by these observations.

The first interactive cadence observation failed on a maximum-radius input.
The demo now clamps optical radius to the actual bounded backing dimensions,
matching CSS radius clamping, and stops animation on a renderer error. The failed
observation is retained separately; it is not a passing cadence measurement.

After clamping, an interim five-second observation presented 48.8 FPS and exposed
an extra RAF wait. The candidate now schedules coalesced CPU work on completion
through an active-only task; RAF still handles immediate panel movement. In the
final native Chrome observation, the 256×156 worker output presented 299 frames
in 5.002 seconds (59.8 FPS), with a 16.8 ms p95 interval, no renderer errors and
no discarded batches. This is a short local observation, not sustained/device
qualification. After stopping, source paints and completed batches stayed at
356 for a one-second idle observation, with no pending/in-flight work or errors.
Both interim attempts remain preserved alongside the final receipts.

The current local Clear preset adds 3% dispersion to the fitted zero-dispersion
parameters; the fit residual above describes the captured-case fit rather than
that exact interactive preset. Manual visual/motion review remains pending.

## Low-radius correction and working controls

The owner accepted the previous lens/motion direction, then reported diagonal
wedges at small corner radii. For v2, the effective optical bevel is now
`min(requestedBevel, max(radius, 0.5))` in backing pixels. A wider bevel would
reach the rounded-rectangle SDF medial axis, where the nearest-edge normal flips.
Keeping the optical profile outside that axis removes the flat-interior seams.
At zero radius the bevel is subpixel; sharp corners do not acquire a broad lens.
Mask geometry and the legacy v1 material remain unchanged. The previous capsule
fit used radius 60 / bevel 16, so this correction does not change that fitted case.
A focused regression checks identity sampling throughout the flat interior at
radii 0, 1, 2, 4 and 8, while retaining refraction in the curved border. The prior
candidate failed that observation; both before/after results are retained.

The showcase now also attaches its functional Center/Animate toolbar through
Forge's public API. In WebGL it shares the lens's scene, explicit source and
renderer. CPU uses a separate Forge CSS-material scene for the toolbar: the
current CPU adapter paces individual surfaces, and two optical surfaces reduced
presentation cadence to about 25 FPS in an interim local observation. That
failed direction is retained, not claimed as an improvement. The status and
diagnostics explicitly identify CSS controls in CPU mode. Opaque and preference
fallbacks apply to both surfaces. The toolbar's native buttons retain keyboard
focus and 44-pixel hit areas; decorative library canvases stay hidden from
accessibility navigation. No screen-reader conformance is claimed here.

Forge takes explicit pixels, images, video or canvases; it does not capture an
arbitrary HTML page behind a control. The known showcase art and text compositor
supplies those pixels. That is application composition around the real public
library, not a second optical implementation. Ordinary page content stays HTML.

After that fallback, the final five-second foreground Chrome observation again
presented 299 lens frames in 5.002 seconds (59.8 FPS; p95 16.8 ms). A separate
occluded-window attempt recorded zero steady frames and is retained as invalid
cadence evidence. CPU/GPU readbacks at radii 0, 2, 8 and 60 agreed to at most one
premultiplied byte for both models. Local iframe viewport checks at 320, 390 and
768 CSS pixels found no page overflow; toolbar controls fit within the stage and
retained 44-pixel hit height. These are focused local checks, not device or
screen-reader qualification. Receipts: `private/calibration/20261104/radius-repair/`.
