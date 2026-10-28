# Liquid Glass Forge

An independent Liquid Glass project for the web, with planned CPU and WebGL rendering, vanilla JavaScript, React, Vue and Angular integrations.

**Status: experimental phase 4 foundation.** The private core provides versioned contracts, validation and color-reference functions. The private DOM package provides explicit image/pixel/bitmap/canvas/video sources and coordinate mapping, plus a stable vanilla host, CSS/opaque material fallback, bounded lifecycle and shared dirty/visibility scheduling. Rendering and framework work remains planned. The [phase 1 Safari/WebKit cadence exception](docs/PHASE-1.md) remains a progression waiver; measured failures and numerical guards are unchanged. No published compatibility or performance guarantee is implied.

## Local development

Use Node 20.19 or newer and pnpm 10.34.5:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test
```

The workspace contains `@liquid-glass-forge/core` and `@liquid-glass-forge/dom`,
both private at `0.0.0-dev`. Tests pack both twice, install actual tarballs into
an independent offline consumer, check ESM/types/SSR, and import their packed
modules in Chromium, Firefox and WebKit. Source and coordinate fixtures also
run in all three engines. Raw artifacts remain ignored. See [source usage and
limits](docs/SOURCES.md), [phase 4 verification](docs/PHASE-4.md) and [host API](docs/HOSTS.md) and [core contracts](docs/CONTRACTS.md).

## Foundation direction

- JavaScript CPU optics and a WebGL2 implementation over explicit readable sources.
- CSS backdrop materials and an opaque fallback for live DOM interfaces.
- Shared lifecycle, cancellation, resource ownership and rendering diagnostics.
- Thin framework adapters with SSR, hydration and accessibility requirements.
- Unit, browser, renderer-conformance, package-smoke and physical-device qualification.

Future work includes Sileo-inspired React/SVG animation, Apple-inspired components, and feasibility studies for React Native and Flutter.

## Project documents

| Document | Contents |
|---|---|
| [Proposal](docs/PROPOSAL.md) | Goals, scope and rendering constraints |
| [Architecture](docs/ARCHITECTURE.md) | Proposed packages and technical contracts |
| [Quality requirements](docs/QUALITY.md) | Tests, platform evidence and release gates |
| [Foundation roadmap](docs/ROADMAP.md) | Delivery sequence and completion criteria |
| [Phase 1 experiment](docs/PHASE-1.md) | Reproduction, measured scope and admission decisions |
| [Phase 2 foundation](docs/PHASE-2.md) | Implemented contracts, packaging checks and limits |
| [Phase 3 sources](docs/PHASE-3.md) | Source acquisition, coordinate mapping and verification |
| [Phase 4 host](docs/PHASE-4.md) | Implemented vanilla host, lifecycle and verification |
| [Host API](docs/HOSTS.md) | Material, ownership, adapter seam and scheduling limits |
| [Source API](docs/SOURCES.md) | Explicit inputs, ownership, scheduling and mapping limits |
| [Core contracts](docs/CONTRACTS.md) | Version 1 data, ownership and optical-reference specification |
| [Future development](docs/FUTURE.md) | Motion, components and native exploration |
| [Attribution](docs/ATTRIBUTION.md) | Design inspiration and source references |
| [Contributing](CONTRIBUTING.md) | How to propose changes during planning |

The proposed npm family is **@liquid-glass-forge/**. No installation command is provided until a package is published and verified.

## License and attribution

[MIT License](LICENSE). Liquid Glass Forge is independently authored and inspired by Apple's Liquid Glass design. It is not affiliated with, sponsored by or endorsed by Apple Inc. See [attribution](docs/ATTRIBUTION.md).
