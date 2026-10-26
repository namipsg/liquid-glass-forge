# Phase 2: contracts and packaging

Implemented on 26 October 2026. The owner explicitly waived remaining
Safari/WebKit cadence as a prerequisite for this phase. The original performance
limits and failing measurements in [phase 1](PHASE-1.md) are unchanged. This is a
progression decision, not a repaired browser scheduler or a performance guarantee.

## Delivered

- A pnpm workspace with a private `@liquid-glass-forge/core` package at `0.0.0-dev`.
- Strict TypeScript, ESM and declarations, with no runtime dependencies or browser
  imports. Import tests trap browser, network and timer access in a fresh Node process.
- Versioned RGBA8 source, immutable frame metadata, ownership and lifecycle
  contracts; bounded validation and stale-frame checks.
- A refraction-only optical specification and small color-reference functions,
  with independent analytical values and transparent-color fixtures.
- Reproducible npm tarballs, isolated offline physical consumer installation,
  ESM/types checks, deep-import rejection and packed browser imports.
- Negative artifact fixtures for absent declarations/CSS/workers, unsafe paths,
  install hooks, internal-version drift and missing/incompatible peers.
- A least-privilege GitHub Actions workflow with pinned actions/tooling and
  Node 20.19.6 / 24.12.0 jobs running the actual checks.

Only core has an implementation. The other proposed package boundaries remain
documented rather than shipped as empty packages. Neither npm publication nor a
release/compatibility claim is part of this phase.

## Verification

Local Node 24.12.0 checks pass: **12 core contract/analytical tests**, **9 package
fault-fixture groups**, and **3 packed browser import checks**. Core and SSR
checks also pass on Node 20.19.6. The browser smoke uses Chromium 156.0.8078.4,
Firefox 157.0 and Playwright WebKit 27.2. It does not substitute for actual Safari
or physical iOS testing. Hosted runs are visible in [GitHub Actions](https://github.com/namipsg/liquid-glass-forge/actions).

Two consecutive core tarballs have identical SHA-256:

```text
3cba9159bd19c2ef80be53cd75adf02ce451be4544a59fb42bcef8c657a020f0
```

They contain exactly `package.json`, `dist/index.js`, `dist/index.d.ts`,
`LICENSE`, `NOTICE` and `README.md`. Consumer tests run outside the repository,
without workspace aliases or symlinks. Raw receipts and tarballs stay local and
ignored. The protected phase 1 CPU/admission files remain byte-for-byte unchanged.

## Limits and next boundary

The core validates metadata; it does not acquire sources, copy/transfer borrowed
pixels, render an image, schedule frames or manage live resources. Pixel ownership
and later engine obligations are explicit in [the contract](CONTRACTS.md).

The package auditor deliberately accepts only exact peer versions and rejects
ranges. Core has no peers; framework range validation belongs to later adapter
work. The optical model includes rounded refraction and linear-light alpha
sampling; blur, highlights and dispersion are future work.

Phase 3 source providers are the next roadmap boundary. React/Vue/Angular,
animation, Apple-inspired components, React Native and Flutter remain future
development. Later release qualification still needs sustained hardware/browser
evidence, including the unresolved Safari/WebKit cadence limit.
