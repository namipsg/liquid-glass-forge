# Foundation roadmap

**Status: phase 1 in progress.** A [CPU/WebGL feasibility spike](PHASE-1.md) exists; its admission gates remain open. Later phases are planned. No release date or compatibility guarantee is implied.

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
