# Liquid Glass Forge

An independent Liquid Glass project for the web, with CPU/WebGL2 rendering,
a vanilla host and React integration. Vue and Angular remain planned.

**Status: Phase 7 React adapter implemented and verified.** Five private packages
provide explicit sources, versioned optics, workers, shared scenes and readable
CSS/opaque material. [Phase 7](docs/PHASE-7.md) records the React component, hook
and provider with packed Vite/Next.js SSR, hydration and lifecycle checks.

[Phase 5](docs/PHASE-5.md) retains the named A04s CPU workload qualification.
[Phase 6](docs/PHASE-6.md) records GPU blur, atlas presentation, recovery and
software/A04s/Safari evidence, including retained timing failures. The original
[Safari cadence waiver](docs/PHASE-1.md) remains unchanged. Broader device,
integrated framework/GPU and release qualification remain open.

## Local development

Use Node 20.19 or newer and pnpm 10.34.5:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test
```

The workspace contains `@liquid-glass-forge/core`, `@liquid-glass-forge/cpu` and
`@liquid-glass-forge/dom` plus `@liquid-glass-forge/webgl` and `@liquid-glass-forge/react`, all private at `0.0.0-dev`. Tests pack all five twice, install actual tarballs into
an independent offline consumer, check ESM/types/SSR, and import their packed
modules in Chromium, Firefox and WebKit. Source and coordinate fixtures also
run in all three engines. Raw artifacts remain ignored. See [source usage and
limits](docs/SOURCES.md), [CPU usage and qualification](docs/PHASE-5.md), [phase 4 verification](docs/PHASE-4.md) and [host API](docs/HOSTS.md) and [core contracts](docs/CONTRACTS.md).

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
| [Phase 7 React](docs/PHASE-7.md) | Component/hook/provider, Strict Mode and packed Vite/Next.js SSR/hydration |
| [Phase 6 WebGL](docs/PHASE-6.md) | Shared atlas, GPU blur, parity, recovery and measured scope |
| [Phase 5 CPU](docs/PHASE-5.md) | Kernel, worker, vanilla adapter and named-device qualification |
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
