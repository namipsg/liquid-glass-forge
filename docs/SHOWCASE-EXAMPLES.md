# Five live Forge examples

Owner request, 4 November 2026: five different interactive examples alongside the
existing playground, built with the library itself. Safari must include iPhone
and iPad layouts with simulator pixel parity as an explicit acceptance target.
Local development/manual QA only; no deployment, publication, commit or push.

Chosen candidates: Safari (phone/tablet), Video, Photos, Music, Maps. Each must
use public Forge scene/provider/renderer APIs, native semantic controls and real
state changes. Only the selected example runs. Media starts paused and pauses
when leaving the example, hiding the document or disposing it. No external
accounts, network tiles, autoplay or copied Apple assets in public source.

Visual direction: a calm evergreen studio framing rich, distinct content; glass
belongs to functional floating controls. System sans text, 44px control targets,
visible keyboard focus, opaque transparency/contrast fallback. Desktop has a
vertical scene chooser beside a large stage; compact layout stacks chooser,
stage and instructions. Safari's fixed logical device viewport scales to fit
without changing the native comparison geometry. Phone and tablet are one
example with two genuinely different toolbar layouts.

Primary design references read from the apple-design skill: accessibility,
layout, typography, color, designing-for-ios, cross-platform, toolbars, materials
and motion. Material-layer restraint and optional motion guide implementation.
This is a web showcase, not a native Apple app or a full accessibility audit.

Acceptance ledger (do not relabel pending criteria as complete):
- Five live examples and home-page discovery: implemented; five cards checked.
- Safari local address/history/tabs and phone/tablet adaptation: implemented and locally checked; final follow-up covers closing earlier tabs, stale validity and full-size scroll access.
- Real HTML video playback/seek/mute/fullscreen: implemented; playback/seek/pause/fullscreen and source-frame observations checked in Chrome. Local MP4 contains H264 and AAC; byte-range response checked.
- Photos selection/navigation/favorite/zoom: implemented and checked.
- Real audio playback/seek/volume: implemented and checked; original PCM audio. Automated playback muted to avoid unsolicited sound; acoustic output not qualified.
- Illustrated map pan/zoom/search/place/route: implemented; zoom/search/place/route and keyboard pan checked.
- Focused local lifecycle, keyboard, responsive and actual-media checks: passed in desktop Chrome156. Old media released on switching; idle render count stable. Five layouts checked at390px, Safari also320px. This is not a formal accessibility or device qualification result.
- Fresh iPhone/iPad simulator Safari reference captures: captured and hash recorded in private/showcase/examples-20261104/native/references.json.
- Registered chrome pixel comparison and remaining mismatch report: recorded in native-comparison.json. Chrome RGB RMS30.85 phone /40.29 tablet; bright material subset15.02 /12.19, on one registered initial state. Nonzero error is not acceptance.
- Exact Safari pixel parity: OPEN until measured; a mockup or screenshot overlay
  does not establish this criterion.
- Owner manual QA of the five-example candidate: pending.
- Public deployment/package/repository updates: held.

The owner accepted the prior radius fix and Forge toolbar as “Looks good.” That
review covers the previous candidate, not this new five-example implementation.
Earlier device qualification failures and iPad physical exclusion remain intact.

## Local candidate and remaining parity work

Build `private/showcase/build-clBE4h/receipt.json` is the current unpublished
candidate. Site and engine source hashes match its receipt. Final candidate:
http://127.0.0.1:59571/examples.html ; discovery at `/#examples`. All seven sealed
npm rc.1 tarballs and their manifest remain unchanged. No publication, commit,
push or public deployment was performed.

Evidence lives in `private/showcase/examples-20261104/`. `browser-check.json`
records the functional five-example checks before the final Safari-only follow-up;
`safari-final-check.json` covers that final follow-up. `native-size-captures.json`
records exact native dimensions/DPR, original captures remain intact, and
`native-comparison.json` records the measured failure to reach pixel parity.
`preserved-attempts.json` identifies failed/interim observations. Fullscreen and
seek were exercised; the video source was checked for actual frame color and
for poster color before playback, not just moving control labels.

Native controls and typography are independently drawn. Safari's native adaptive
material, rim and icon/glyph rendering still differ. The current comparison masks
out unstable status/clock pixels; it cannot close a full-screen pixel-parity
criterion. Scroll/collapse, tabs, dark appearance and motion parity have not been
qualified against native captures. Keep these criteria open. Review the material
and geometry across cases before fitting any more parameters; do not copy native
UI pixels into the renderer or advertise an exact Apple match.

Simulator screenshots are installed into ignored dist only by
`scripts/install-local-example-references.mjs`. They are targets/overlays, never
material inputs or public source assets. The new isolated iPad simulator is
81190FC2-34D7-4209-A95C-368C95AA4EF3. No physical devices or developer-account,
security, host or global settings were changed. Older iPad physical exclusion and
qualification failures remain open.

## Owner revision after the first five-example review

The owner requested PNG frames, closer Safari behavior, minimal-opacity clear
glass throughout the examples, website controls built with Forge, project and
support information, an ENUI announcement and author credit. “Each section in a
separate library” was corrected to **each section in a separate micro loop**.
No separate packages were created. The ENUI weight instruction was corrected:
only **N** is bold; E/U/I are thin, and the symbol itself is a dominant single N.

Micro-loop receipts live in `private/showcase/revision-20261104/`. Native matching
resumed after the owner confirmed iOS27.2 was installed. The
older iOS26.2 comparison and residuals above remain historical observations of
the prior, more opaque candidate. They do not measure the new clear preset.
Exact newest-iOS appearance, native motion and full Safari parity remain open.
Public deployment, publication and commits/pushes remain held for manual QA.

## iOS/iPadOS27.2 follow-up

Fresh raw PNGs from the standard 27.2 runtime (24B8117), captured one owned
Simulator at a time, are recorded in
`private/showcase/revision-20261104/native-27-2/`. The unsigned SwiftUI probe
uses the original shared PNG bytes; Clear and Regular are captured separately
with app-local Light appearance and native interaction on. No device, account
or security settings were changed. Both owned Simulators were shut down after
capture. The newer Xcode presents them through Device Hub.

Phone references cover initial, collapsed, page menu, address and tabs states;
tablet references cover initial, new-tab and overview states. Safari's right
phone control now opens tabs; the separate page icon opens actions. The
collapsed phone pill is 86×32pt, 14pt from the bottom in this 127.0.0.1 capture
(its width is content-dependent). Tablet content begins at86pt for one tab and
132pt with the46pt tab strip. An upward address-pill gesture opens tabs.
These are focused corrections, not a claim of complete Safari equivalence.

`material-runtime-comparison.json` compares raw encoded pixels from independently
registered 960×960 source regions in 26.2 and27.2, without resampling or color
correction. Clear RMS is5.98 and Regular17.16 on the recorded capsule inset,
excluding foreground text. These are runtime-to-runtime observations, **not**
Forge error measurements or qualification gates. Clear's rim, adaptive material
composition, font/icon outlines, menus, keyboard and native motion remain open
parity work. The examples retain the requested low-opacity project clear preset.

Hash-checked native overlays are installed only into ignored local `dist`. No
native screenshot is used as an optical source. Public deployment remains held.

## Owner QA: blue base, a little more opacity

Following overall visual acceptance, the owner requested a blue palette and
slightly more opaque glass. The website's light/dark colors, default Tidal
playground and browser/photo artwork, controls and example surrounds are blue.
The local optical tint is6.5% white; site CSS materials use9%, with a matching
6.5% optical fallback. Adaptive ink includes the material's luminance lift.
Other artwork retains its content colors. Native measurement
backdrop/captures and all published package bytes are preserved.

Focused local screenshots and receipts are under
`private/showcase/blue-revision-20261104/`. Public deployment and publication
remain held for the owner's next visual review. Native parity remains open.
