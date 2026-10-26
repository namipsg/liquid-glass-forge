# Liquid Glass Forge

An independent Liquid Glass project for the web, with planned CPU and WebGL rendering, vanilla JavaScript, React, Vue and Angular integrations.

**Status: experimental phase 2 foundation.** The unpublished core now provides versioned contracts, validation and color-reference functions, with a build and isolated package-consumer harness. Rendering and framework packages remain planned. The owner accepted [phase 1 findings](docs/PHASE-1.md) with an explicit Safari/WebKit cadence exception; the measured failures remain unqualified. No published compatibility or performance guarantee is implied.

## Local development

Use Node 20.19 or newer and pnpm 10.34.5:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test
```

The workspace currently contains only `@liquid-glass-forge/core`, marked private
at `0.0.0-dev`. Tests pack it twice, install a tarball in an independent temporary
consumer, and verify ESM/types and browser imports. Raw artifacts remain ignored.
See [phase 2 evidence and limits](docs/PHASE-2.md) and [core contracts](docs/CONTRACTS.md).

## Planned foundation

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
| [Core contracts](docs/CONTRACTS.md) | Version 1 data, ownership and optical-reference specification |
| [Future development](docs/FUTURE.md) | Motion, components and native exploration |
| [Attribution](docs/ATTRIBUTION.md) | Design inspiration and source references |
| [Contributing](CONTRIBUTING.md) | How to propose changes during planning |

The proposed npm family is **@liquid-glass-forge/**. No installation command is provided until a package is published and verified.

## License and attribution

[MIT License](LICENSE). Liquid Glass Forge is independently authored and inspired by Apple's Liquid Glass design. It is not affiliated with, sponsored by or endorsed by Apple Inc. See [attribution](docs/ATTRIBUTION.md).
