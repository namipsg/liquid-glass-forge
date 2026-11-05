# iPhone material calibration

This is a controlled comparison utility, not a claim that the current Forge
preset exactly matches Apple. On 4 November the owner switched the reference
work to **iPhone Simulator**, specifically built-in Safari and Photos, and chose
unsigned packaging/sideloading for the optional device app. Signing-team and
physical-phone availability requests are superseded; no developer-account
configuration is required for the current simulator work.

## Captured native references

An isolated iPhone 17 Pro Max simulator runs iOS 26.2 (23C54):
`016D9C71-876F-49D5-A101-D3518923DD6D`. Built-in Safari was observed over a local
page that draws no glass, including toolbar collapse during a scroll recording.
Photos was observed over a controlled full-height image. The auxiliary SwiftUI
probe supplies exact shared-backdrop Clear/Regular capsule captures for registered
comparison. Raw captures, movie, hashes, source and findings are retained in
`private/calibration/20261104/simulator/`; none is physical-device evidence.

After building the local showcase, install the optional capture overlay:

```sh
node scripts/install-local-calibration-references.mjs \
  --manifest private/calibration/20261104/simulator/references.json
```

This copies hash-checked simulator images into ignored `showcase/dist/` only.
Apple UI captures are not included in public source or npm package artifacts.
The local comparison auto-loads the captured Clear/Regular references and displays
Safari/Photos toolbar crops with links to the original full screenshots.

The bounded parameter study in `fit-v1.json` found a closer Regular approximation
with blur 8 source pixels, white tint 0.55, rim 0.10 and little edge displacement.
Masked RGB RMS fell from about 49.5 to 9.1 for that one registered case. Clear
retained about 25.4 RMS overall and 36.8 at the rim even after fitting. Its
numerically preferred low-refraction setting loses the native lens character and
is not promoted as a faithful preset. These are local fit residuals, not acceptance
gates, proof of global optimality, or a hardware qualification result.

## Optional native reference app

`native/GlassReference.xcodeproj` uses Apple's public SwiftUI `glassEffect` API.
It contains Clear/Regular selection, app-local Light/Dark appearance, an
interaction toggle, drag, Center, and a linear two-second sweep. The simulator
build runs without provisioning. For the owner-chosen later device sideloading,
`private/calibration/20261104/GlassReference-unsigned.ipa` is prepared, with its
hash and unsigned/no-profile status recorded in `unsigned-ipa.json`. No physical
installation was attempted. Packaging does not establish that a given sideloading
method can install it; that method remains the owner's choice.

The shared backdrop is `../showcase/public/calibration/backdrop.png`: 480×480
pixels, displayed at 320×320 points in the reference app. The capsule is
200×120 points, radius 60, initially centered at (160,160). The native app uses
the exact PNG bytes loaded by the browser replica. Pink 8×8-pixel corner markers
register the stage within a screenshot. `render-backdrop.swift` regenerates this
code-authored diagnostic image; it is not an Apple asset.

The device and simulator builds succeeded with Xcode 26.2 / SDK 26.2. Native
Simulator launch and capture succeeded. Physical launch/capture remain outside
the current simulator task. Do not relabel simulator output as a physical result.
Xcode rewrites PNG resources during build, so the exact source PNG was restored
to the owned unsigned app bundles before installation/packaging; the displayed
source SHA-256 and web source match. No signed artifact was modified.

Unsigned build command (no account writes or app installation):

```sh
xcodebuild -project calibration/native/GlassReference.xcodeproj \
  -target GlassReference -configuration Debug -sdk iphoneos \
  CODE_SIGNING_ALLOWED=NO \
  CONFIGURATION_BUILD_DIR="$PWD/private/calibration/20261104/native-build" build
```

## Web replica and comparison

Build the unpublished candidate with `node scripts/showcase-build.mjs --working-tree`,
install the optional capture overlay above, then visit
[the local comparison](http://127.0.0.1:59571/calibration.html).

Load an original native reference screenshot (with its Simulator/physical origin recorded). The page identifies the corner
markers, displays a registered stage crop, offers overlay/difference views and
exports a candidate JSON with parameters, source/capture hashes, crop, geometry,
DPR and renderer diagnostics. Imported provenance stays **unverified** until
linked to a capture receipt that identifies Simulator or physical origin. No file is uploaded to a server.

Keep the original screenshot/recording untouched. Record device/OS, SDK,
Clear/Regular, Light/Dark, native interaction state, Reduce Transparency,
Increase Contrast and Reduce Motion state, stage/shape bounds, original pixel
size, crop, source hash and capture method. The reference app changes only its
own appearance; don't toggle system settings to make a case look favorable.

Match displacement on the grid first, then blur/center transmission, dispersion,
rim/specular and foreground legibility. Keep unrelated parameters fixed while
changing one. A registered image does not establish material equality; browser
and iPhone DPR, color handling, screenshot scaling and capture compression can
change pixels. Exclude foreground text and outer-shadow pixels when reasoning
about an optical sampling difference. Do not optimize a single whole-image error
score at the expense of the observed material behavior.

Only after the still case is understood, capture the same two-second sweep on
both implementations. Record movement latency separately from optical update
cadence: moving a DOM element every display frame does not make its CPU texture
60/120 FPS. Current published CPU adapter keeps its original 30 Hz optical and
57,600-output-pixel limits. No parity or qualification is claimed by this utility.

Public website deployment, package publication and repository updates remain
held for the owner's manual review. Earlier qualification failures remain intact.

Primary API references:
- https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views
- https://developer.apple.com/documentation/swiftui/view/glasseffect(_:in:)
- https://developer.apple.com/documentation/swiftui/glass/interactive(_:)

Parameter fitting is a hypothesis, not a guarantee. If a shared setting cannot
reproduce the observed edge profile, adaptive luminosity or motion across cases,
record a renderer/model gap instead of hiding it with a different extreme preset
for every capture. Still-image agreement does not establish interaction parity.

## Clear lens v2 candidate

The working-tree comparison adds a v1/v2 selector and opt-in interactive CPU
cadence. Clear v2 traces inward refraction through an elliptical bevel with an
assumed index of 1.5; this is not a measured Apple parameter. On the same
registered capture, the bounded fit reduced rim RMS from 36.68 (v1) to 16.24
(v2). Regular retains the owner-accepted v1 approximation. The interactive Clear
preset adds 3% dispersion to the zero-dispersion fitted case.

The optical model, focused CPU/GPU readback and short CPU presentation observation
are documented in `../docs/MATERIAL-LENS-CANDIDATE.md`; raw results and failed
interim observations remain in `private/calibration/20261104/lens-v2/`. New APIs
are unpublished; sealed rc.1 package bytes remain unchanged. Neither still-image
fit nor the local Chrome observation establishes native motion/device parity.
