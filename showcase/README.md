# The Material Studio

[Live GitHub Pages showcase](https://namipsg.github.io/liquid-glass-forge/)

The [Pages workflow](../.github/workflows/pages.yml) runs
`pnpm showcase:build --pages` after building the workspace packages. Pages
uses repository renderer code, a web encode of *Sprite Fright* and generated
showcase artwork. The original local film, optional Simulator captures and private
receipts stay in ignored local directories. The npm links point to the exact
published preview version.

A static, interactive Liquid Glass Forge showcase with real optical rendering,
procedural canvas art, native backdrop typography, a draggable clear lens, three palettes, refraction and
corner controls, explicit CPU/opaque choices, and framework examples.

Build from the current packages:

```sh
node scripts/showcase-build.mjs --working-tree
node scripts/serve-showcase.mjs
```

For the exact sealed experimental release, use:

```sh
node scripts/showcase-build.mjs --preview private/preview/<release>/manifest.json
```

The build installs physical tarballs into a temporary consumer, compares every
installed package file with its packed bytes, and emits `showcase/dist/`.
Upload that directory to any static host. Relative asset paths support deployment
under a project subdirectory. No API server or external image/font service is used.

The install command and npm links appear only after all seven exact versions are
found on the registry. Experimental release qualification remains explicitly open.

Design direction: mint and evergreen editorial typography, luminous layered art,
and a tactile working material rather than static product mockups. Animation
starts off; the design provides native controls, keyboard movement, opaque
material, and reduced-motion/transparency preferences. Formal testing is deferred
by the owner and no accessibility-conformance result is claimed.

## Local material revision — awaiting owner QA

The lens now uses a deeper bevel, stronger default refraction, a clear center,
adjustable chromatic dispersion and directional highlights. The old 65% full-panel dark scrim
is removed; its small foreground label provides its own contrast. Scene and
motion controls sit below the lens so they do not obscure the optical study.

The known headline and caption are displayed as crisp DOM text, then mirrored
with their measured positions and font metrics into an explicit source canvas.
This is a showcase compositor for these known text nodes, not arbitrary DOM
capture. Canvas aspect ratio matches the stage and stays within 230,400 pixels.

The unpublished working-tree candidate opts into interactive CPU cadence at up
to 60 updates/second and a smaller 256×160 / 40,960-output-pixel cap. It coalesces
work after completion and stops scheduling while idle. The published rc.1 and
default balanced policy retain the 30 Hz ceiling. This trades output resolution
for latency; the local observation does not qualify other hardware.

[Local QA candidate](http://127.0.0.1:59571/?qa=glass-2#playground): drag across
“a material.”, compare CPU movement/animation, and judge the refraction against
the supplied references. Dispersion controls independent red/blue sampling offsets
on both CPU and WebGL; zero disables color separation and 30 exaggerates it. Public deployment awaits the owner's manual review.

The opaque comparison uses a light sage fill (#acc8b4) and dark green labels
(#143c2e) in either site appearance; forced-colors retains system Canvas colors.

## Native-reference comparison

The separate local `calibration.html` page and `../calibration/native/` SwiftUI
probe use the same raster backdrop and capsule geometry. See
[`calibration/README.md`](../calibration/README.md). Simulator parameter studies are available; physical native capture remains
open, and current presets must not be advertised as exact Apple matches. Panel positioning now follows RAF independently of in-flight
CPU optics; the published CPU adapter retains its 30 Hz optical cap.

The owner switched reference work to iPhone Simulator on 4 November. The local
studio now offers separate Clear and Regular candidates. Regular uses increased
blur and luminosity lift from the registered native Regular study. Clear remains
visibly different at the rim and must not be advertised as an exact native match.
The comparison page optionally loads captured simulator Clear/Regular references
and Safari/Photos context captures via `install-local-calibration-references.mjs`.
Those images live in ignored local dist only. See `calibration/README.md` for the
raw capture receipts, bounded fit and unsigned device-app artifact.

## Current local candidate — 4 November

The owner accepted the previous visual direction as “Looks closer.” The next
candidate uses an explicit `refractive-lens-v2` model for Clear and retains the
accepted v1 Regular approximation. It remains unpublished and awaits fresh QA:
[local studio](http://127.0.0.1:59571/?qa=lens-v2#playground). The comparison page
provides a v1/v2 selector only in working-tree builds. Release metadata marks
these builds `localCandidate: true, installable: false`; the install card is
hidden. Sealed preview builds continue to use published package behavior.

See [model and evidence](../docs/MATERIAL-LENS-CANDIDATE.md) for the optical
assumptions, focused checks, short local cadence observation and remaining limits.
Public deployment, package publication and commits/pushes remain held.

The low-radius follow-up keeps v2's bevel within the corner curvature, removing
diagonal wedges across the flat interior. The Center/Animate controls now float
over the artwork as a second Forge surface: optical in WebGL mode and Forge CSS
material in CPU mode to preserve the lens update budget. Both use the public
`createGlassScene`/`attach` lifecycle; WebGL shares the same source and renderer.
The main lens already used these public APIs. Source composition is app-owned
because the library deliberately does not capture arbitrary DOM content.
The updated candidate is [here](http://127.0.0.1:59571/?qa=radius-fix#playground).
Public deployment remains held for manual review of this follow-up.

## Five live examples

The home page now links to `examples.html`: Safari (iPhone/iPad), video playback,
a landscape gallery, an audio player and a street map explorer for fictional Port Meridian.
Only the selected example mounts a Forge scene. Switching scenes, hiding the
page and teardown pause media and release owned renderers/sources. Generated
photographs are recorded in `public/media/photography.json`. The original audio
and procedural motion study are reproducible with `node scripts/generate-showcase-media.mjs`.
`public/media/provenance.json` records their hashes.
The local static server supports video/audio MIME types and single-byte ranges.

All optical work uses public `SourceProvider`, `createGlassScene`, `scene.attach`
and `createOpticalRenderer` APIs. App-owned canvas composition supplies exact
known content; no arbitrary-DOM capture is claimed. Opaque preferences and a
Forge CSS fallback preserve controls. Safari uses two fixed logical device
viewports plus a 100% inspection mode. It starts on an original sample page.
Apple.com remains available through Favorites and opens in a separate tab.
Video and Safari use the same measured phone frame, rotated for the player.
The Photos, Music and Maps demos use scene-specific Forge settings with subdued
edges. Port Meridian is an original vector street map with fictional routes.

To compare against the supplied source file after a local build, run
`node scripts/install-local-showcase-film.mjs /path/to/720p.mp4`. It checks the
original hash, installs the full clip and a frame at 00:16 into ignored local
output, and leaves the input file in place. The landscape player displays the
film’s source and credit. All builds default to the same 720p web encode,
paused at 00:16. [Blender Studio's project page](https://studio.blender.org/projects/sprite-fright/pages/about/)
documents the film’s CC BY 1.0 license. The [media manifest](public/media/sprite-fright.json)
records the source and web asset checksums.

`docs/SHOWCASE-EXAMPLES.md` retains acceptance criteria, including simulator pixel
parity as an open measured target. Native reference screenshots may be installed
into ignored local dist for comparison; they are not public source assets.
Local implementation and manual QA do not authorize public deployment.

## Owner revision: sections and ENUI

Each section was handled in its own micro loop (not a separate package). Project
information now follows the existing live hero, with author credit to **Nami
Poursafargholi, AKA Zenixev**. Framework names and device status have a dedicated
section and `support.html`, generated from the original qualification ledger.
Framework package availability does not close physical qualification.

`site-components.mjs` mounts the website's own navigation, actions, summaries,
code controls and example links through Forge CSS-material scenes, in bounded
sixteen-host groups. The optical examples use explicit source composition. The
ENUI announcement adds a lazy-mounted optical material study in Sierra blue.
The fixed lens performs no idle animation. ENUI is an upcoming UI
library built on Forge, not a currently published component catalog.

The final ENUI logo uses a prominent **N** symbol and wordmark with only **N**
bold; E/U/I are thin. See `../docs/SHOWCASE-ARTWORK.md` for final PNG assets,
generation prompts and provenance. Safari's phone/tablet PNG openings are measured
and fitted around fixed logical viewports. Its address/favorites UI, actions,
thumbnail tabs, per-tab scroll and compact phone bar are working local behaviors.
Fresh iOS/iPadOS27.2 (24B8117) phone/tablet captures now guide the local comparison.
Exact native parity remains open; see `../docs/SHOWCASE-EXAMPLES.md` for measured
geometry, source hashes and remaining differences.
The blue palette revision used a 6.5% white-tint / one-source-pixel blur clear candidate;
these are project parameters, not claimed recovered Apple settings.

## Blue palette and light opacity revision

The owner accepted the overall layout and requested a blue base with slightly
more opaque glass. Light and dark theme colors, default Tidal art, interface
ink, navigation and example surrounds now use blue. The optical clear tint is
6.5% white (previously2.5%); website CSS glass uses9%. Foreground selection
includes the optical tint's luminance lift. These remain local project settings,
not recovered Apple parameters. Original native calibration images and their
controlled measurement backdrop remain unchanged.
