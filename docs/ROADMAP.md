# Foundation roadmap

**Status: Phase 12 distribution preparation implemented; qualification and publication held.**
[Distribution rehearsal and limits](PHASE-12.md) record npm ownership, immutable
artifacts and the protected release design. Phase 11 acceptance remains incomplete.
[Physical evidence and remaining gates](PHASE-11.md) include one full worker soak,
timing/visual failures and missing iPad/additional GPU coverage. Phase 10 remains
implemented within its recorded review scope. [Core contracts and packaging](PHASE-2.md) and
[explicit source providers/coordinate mapping](PHASE-3.md) and the
[vanilla host/lifecycle](PHASE-4.md) are implemented.
The [phase 1 feasibility findings](PHASE-1.md), including the explicit unresolved
Safari/WebKit cadence progression waiver, remain unchanged. No release date,
broader performance or compatibility guarantee is implied.

## Delivery phases

| Phase | Deliverable | Completion evidence |
|---|---|---|
| 1. Feasibility | Explicit-source CPU/WebGL experiments, CSS material and shared GPU presentation study | Reproducible pixel output, source restrictions, named-device measurements and an admitted workload |
| 2. Contracts and packaging | SSR-safe core, versioned optical/source/frame contracts and package harness | Analytical fixtures, import/exports validation and isolated tarball consumer checks |
| 3. Source providers | Images, video, canvas and application pixels with ownership/revisions | Decode/CORS/cancellation tests and correct crop/scroll/resize mapping |
| 4. Vanilla host | Stable decorative targets, material fallback, lifecycle and scheduling | Native input remains usable; initialization settles; disposal/idle/hidden behavior passes |
| 5. CPU rendering | JS pixel kernel, worker path and bounded quality policy | Independent numerical fixtures, no WebGL requests in CPU mode and measured workload limits |
| 6. WebGL rendering | Shared-scene GPU resources, conformance and recovery | Actual WebGL output, parity, loss/restoration, presentation and reuse evidence |
| 7. React integration | Component/hook and shared scene ownership | Strict Mode, ref/prop updates, production SSR/hydration and packed consumers |
| 8. Vue integration | Component/composable and lifecycle integration | KeepAlive, reactive updates, production SSR/hydration and packed consumers |
| 9. Angular integration | Framework-native packaging and host integration | Partial compilation, hydration, zoneless lifecycle and packed consumers |
| 10. Integrated resilience | Combined backend/adapter, accessibility and failure scenarios | Reproducible faults, native interactions, preference handling and bounded recovery |
| 11. Qualification | Physical-device matrix, sustained performance and API/support review | Recorded required environments, stable resources and published capability limits |
| 12. Distribution | Reproducible package set and release-candidate verification | Clean artifact installs, source/provenance checks and exact-version registry smoke |

WebGL and framework integrations may progress independently once the source/host/CPU contracts are stable. Shared-contract changes must update dependent fixtures.

## Milestones

- **CPU/vanilla alpha:** a useful explicit-source CPU path with material fallback, numerical tests and packed consumer smoke.
- **Multi-framework preview:** WebGL and all three web adapters with SSR/hydration and failure handling.
- **Qualified beta:** required device/workload evidence and a frozen support/API contract.
- **Stable release:** verified distribution artifacts, documentation, notices and a repeatable release process.

These milestones describe acceptance boundaries, not announced release versions.

## Working method

For each change, specify one observable behavior, reproduce a failure or run a falsifiable experiment, implement the smallest change, verify it and retain evidence. Split changes that cannot be reviewed or independently validated. Changes to equations, tolerances, source capabilities or published support require an explicit design decision.

The next product layers are documented in [future development](FUTURE.md). Motion, component catalogs, React Native and Flutter remain separately scoped work.

## Current boundary — 3 November 2026

Phase 4 adds stable decorative hosts, CSS/opaque material, bounded lifecycle and
shared dirty/visibility scheduling. All seven packages remain private at `0.0.0-dev`.
See [phase 4 evidence and limits](PHASE-4.md). [Phase 5](PHASE-5.md) adds the CPU kernel, worker and bounded vanilla adapter.
The original physical workload now passes two main and two required-worker
repetitions on the A04s under unchanged service/cadence/age/image limits. Earlier
failed measurements remain retained. [Phase 6](PHASE-6.md) implements WebGL2 optics, blur, shared atlas presentation and bounded recovery, with installed-browser and A04s evidence. Original Step06 exit evidence, including actual Safari26.6.2, is complete and frozen for independent review. Broader passing-performance qualification belongs to Step11/M32. Broader devices, sustained performance and release/distribution qualification remain future work.
The Safari cadence waiver does not turn failing measurements into passing evidence.


[Phase 7 React](PHASE-7.md) now implements the original M19–M21 component, hook,
shared-scene ownership, Strict Mode cleanup and packed production Vite/Next.js
SSR/hydration boundary. React/React DOM19.3.1 is the tested peer combination.
Actual WebGL-through-React coverage is recorded in [Phase 10](PHASE-10.md);
no new physical or broad performance support is inferred from these adapter tests.


[Phase8 Vue](PHASE-8.md) implements original M22–M24 components/composables,
reactive ownership, KeepAlive cancellation and packed production Vue/Nuxt SSR.
Vue3.5.44 is the exact tested peer. Actual WebGL-through-Vue is covered in Phase 10.
Broader environment and release qualification remain future phases.


[Phase9 Angular](PHASE-9.md) implements original M25–M27 standalone component/host
directive/shared scene ownership, partial APF, zoneless lifecycle and packed
production Angular CSR/eager SSR hydration. Exact Angular core/common22.2.4 and
RxJS7.8.2 peers are declared. Deferred/incremental hydration is unqualified.
Actual WebGL-through-Angular is covered in Phase 10; no broader physical/performance
or distribution qualification is inferred.


[Phase 10](PHASE-10.md) implements M28–M30 cross-adapter CPU/worker/WebGL policy,
restrictive CSP and typed faults, native controls, source/resize/route/View
Transition combinations, owned-resource retirement and regression mutations.
Opaque material now hides optical pixels over a solid system background. Access
verification combines browser semantics, native AX, keyboard and measured
contrast/focus screenshots. At the owner's request, installed Google Chrome
inspection and a concise candidate replace the complex manual four-app review;
no human VoiceOver pass is inferred. [Phase 11](PHASE-11.md) now records the available
physical qualification work and explicit incomplete matrix. Beta/API freeze and
Phase 12 publication/registry acceptance remain held. Local distribution
preparation is recorded in [Phase 12](PHASE-12.md).
