# Liquid Glass Forge

An independent Liquid Glass project for the web, with CPU/WebGL2 rendering,
a vanilla host, and React, Vue and Angular integrations.

**Status: Phase 9 Angular adapter implemented within the scope below.** Seven private packages
provide explicit sources, versioned optics, workers, shared scenes and readable
CSS/opaque material. [Phase 7](docs/PHASE-7.md) records the React component, hook
and provider with packed Vite/Next.js SSR, hydration and lifecycle checks.
[Phase 8](docs/PHASE-8.md) records the Vue component/composable/provider, KeepAlive
and packed Vue/Nuxt SSR consumers. [Phase 9](docs/PHASE-9.md) adds standalone Angular
components/directives, zoneless lifecycle and packed Angular SSR/hydration.

[Phase 5](docs/PHASE-5.md) retains the named A04s CPU workload qualification.
[Phase 6](docs/PHASE-6.md) records GPU blur, atlas presentation, recovery and
software/A04s/Safari evidence, including retained timing failures. The original
[Safari cadence waiver](docs/PHASE-1.md) remains unchanged. Broader device,
integrated framework/GPU and release qualification remain open.

## Local development

Use Node 24.21.0 and pnpm 10.34.5 for the complete suite, including Nuxt and Angular.
CI retains a Node20.19.6 base lane; Nuxt/Angular use the newer runtime:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test
```

The workspace contains `@liquid-glass-forge/core`, `cpu`, `dom`, `webgl`, `react`,
`vue` and `angular`, all private at `0.0.0-dev`. Tests stage external peers, pack all seven
twice and install the private tarballs offline into an independent consumer.
They check ESM/types/SSR and import packed modules in Chromium, Firefox and WebKit.
Production React/Next.js, Vue/Nuxt and Angular consumers verify hydration and lifecycle.
Angular uses partial compilation via the isolated TypeScript6/ng-packagr tool workspace.
Raw artifacts remain ignored. See [sources](docs/SOURCES.md),
[CPU qualification](docs/PHASE-5.md), [React](docs/PHASE-7.md), [Vue](docs/PHASE-8.md),
[Angular](docs/PHASE-9.md), [host API](docs/HOSTS.md) and [core contracts](docs/CONTRACTS.md).

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
| [Phase 9 Angular](docs/PHASE-9.md) | Standalone component/directives, APF, zoneless CSR and eager SSR/hydration |
| [Phase 8 Vue](docs/PHASE-8.md) | Component/composable/provider, KeepAlive and packed Vue/Nuxt SSR/hydration |
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
