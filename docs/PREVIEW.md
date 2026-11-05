# Experimental preview

The owner requested that further testing stop on 3 November 2026 and that package
and showcase work continue. The GitHub repository and showcase can be published separately from physical qualification.
This decision does not complete Phase 11, freeze the API, establish performance
support, or establish a stable release.

All seven packages were published on **4 November 2026**, version
**0.1.0-rc.1**, public access, **next** tag:

- [core](https://www.npmjs.com/package/@liquid-glass-forge/core/v/0.1.0-rc.1)
- [cpu](https://www.npmjs.com/package/@liquid-glass-forge/cpu/v/0.1.0-rc.1)
- [dom](https://www.npmjs.com/package/@liquid-glass-forge/dom/v/0.1.0-rc.1)
- [webgl](https://www.npmjs.com/package/@liquid-glass-forge/webgl/v/0.1.0-rc.1)
- [react](https://www.npmjs.com/package/@liquid-glass-forge/react/v/0.1.0-rc.1)
- [vue](https://www.npmjs.com/package/@liquid-glass-forge/vue/v/0.1.0-rc.1)
- [angular](https://www.npmjs.com/package/@liquid-glass-forge/angular/v/0.1.0-rc.1)

The exact registry tarball bytes match the sealed local artifacts (SHA-256 and
SHA-512), and every `next` tag resolves to this version. The private operation
receipt is `private/preview/release-EGW9vy/publication.json`. These are publication
receipts; consumer and physical-device qualification remain deferred.

The registry also exposes a `latest` alias for this prerelease. After successful
owner authentication, npm rejected `npm dist-tag rm ... latest` with HTTP 400;
no tags were removed. This matches the behavior reported in
[npm/cli#8490](https://github.com/npm/cli/issues/8490). Both `next` and `latest`
currently resolve to **0.1.0-rc.1**. Use the exact version for reproducibility;
the alias does not establish a stable release or change the experimental status.

The existing qualified-release publisher and its provenance/protection gates
remain held. Initial experimental publication uses the owner's interactive npm
authentication, without changing npm account security settings. It does not claim
CI provenance or a clean committed source revision. A local immutable bundle
records the working-tree source hashes and exact tarball bytes.

## Scope and remaining work

- Full physical qualification, sustained timing and visual/accessibility review
  remain open. Existing successes and failures remain evidence for their original
  artifacts and environments only.
- iPad is explicitly unqualified and excluded from first-release support claims,
  as separately approved by the owner; its original qualification work remains open.
- Windows functional/lifecycle checks and CPU admissions passed on a prior
  candidate, but GPU cadence exceeded its limit over RDP. An interrupted CPU soak
  also exceeded its cadence limit. Neither establishes full release qualification.
- Physical tests for the current preview remain deferred.
- Trusted-publisher setup, protected CI publication, registry provenance/consumer
  qualification and any stable release remain later release work.

## Showcase

The Material Studio in `showcase/` demonstrates real rendering over an explicit
640×360 canvas source. Drag the material card, switch its source palette, adjust
refraction/corners, and compare WebGL, bounded CPU and opaque material.
Animation is optional and starts off. Native controls remain ordinary DOM.

`pnpm showcase:build` creates the static site from physical package tarballs,
outside the workspace dependency graph. Publication availability is displayed
only after the relevant exact registry versions actually exist.

Future motion libraries, component catalogs, React Native and Flutter are outside
this package set. Apple assets and upstream implementations are not included;
the independent MIT attribution remains in every package.
