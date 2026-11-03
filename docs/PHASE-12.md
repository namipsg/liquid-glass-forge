# Phase 12: distribution rehearsal checkpoint

**Status: preparation implemented; release acceptance incomplete.** M34 has a real
npm scope ownership record and stronger packed attribution checks. M35 has a
local immutable-artifact rehearsal, a manual read-only workflow and an inactive
protected-publisher template. M36 remains held: Phase 11 is incomplete, packages
remain private development versions, and no candidate publication, registry
consumer/provenance pass or recommended-tag promotion is claimed.

## Ownership and artifacts

On 3 November 2026 the owner authorized use of their signed-in npm browser session.
The free public-package organization `@liquid-glass-forge` was created under
`namipsg`; npm lists Nami Poursafargholi as its owner, consistent with the existing
MIT copyright holder. No paid plan, account conversion, invitation, token creation
or security-setting change was performed. The owner enabled Chrome's native
Apple Events JavaScript control; agent plugins/integrations remained disabled.
Naming is verified as an npm scope, not as a legal trademark clearance.

The first stricter packed audit failed because CPU and WebGL notices lacked the
full attribution/non-endorsement statement; WebGL also had a copied CPU description.
Both notices now match the project's independent implementation and actual holder.
Runtime code and API exports did not change; all seven packages remain private at
`0.0.0-dev`. Notice changes alter two tarball hashes. The previous qualification
candidate is historical and cannot silently qualify this new artifact set.

`release:prepare` performs two independent builds and packs, checks physical
inventories and internal versions, and writes an immutable manifest with source,
tooling, artifact and file hashes. `release:consumers` feeds exactly those tarballs
to the existing production framework/resilience suites. `test:registry` performs
real exact-version registry downloads, registry installs, npm cryptographic
signature/attestation verification, exact provenance identity matching and the
same consumer suites. Missing packages/signatures/provenance fail explicitly.
The qualification report can bind a proposed public RC set before publication;
it rejects mixed versions/private flags and preserves every physical gate.

Eight counterfactual distribution tests cover release holds, private/dirty/dev
artifacts, attribution and tampering, signature-report binding, source identity,
partial-publication collisions and the active workflow's lack of publishing
permissions. The first provenance negative test caught an absent-hash comparison
that could accept a wrong subject; that comparison is corrected and the failed
test output is retained.

## Release boundary

[RELEASING.md](RELEASING.md) describes the exact commands, owner bootstrap/protection
actions, direct-to-`next` policy, artifact approval, provenance, partial-set recovery
and separate promotion/rollback. [release/policy.json](../release/policy.json)
keeps publication disabled and records unverified remote protection/trusted
publisher settings. The active workflow only rehearses; the publication template
is outside `.github/workflows` and cannot run. No remote workflow, environment
protection or per-package OIDC configuration was activated.

Phase 11's support/plan and prior private evidence remain unchanged. Refactoring
consumer artifact selection changes test producers; its recorded 30-minute soak
continues to describe the original source/candidate, with its captured producer
snapshots. No rerun or new physical support claim is inferred. Raw artifacts,
browser ownership receipts, initial failed packs/tests, registry failures and
validation logs are indexed under `private/phase-12/evidence.json`.

## Recorded validation

The Node 24.21.0 full suite passed **147 Node/browser tests**, the reproducible
seven-package/offline smoke, **23 React**, **17 Vue**, **25 Angular** and **244
integrated resilience groups**. The frozen-artifact run independently passed the
same framework/resilience groups against one exact seven-tarball set. Final
targeted validation passed **18 qualification/distribution guard tests**, including
the added public-RC qualification case. Both workflow files parse as YAML; the
active workflow's permission/trigger boundaries are checked by a counterfactual
test. These are local results, not a hosted release run.

The strict release verifier rejects the private development set. The real registry
check fails with HTTP 404 for the exact unpublished version, as required; it is
not relabelled as a registry pass. The organization package list confirms zero
published packages. Scope ownership and public GitHub repository identity are
verified, while remote release protection, per-package trusted publishers,
qualified RC artifacts, publication, registry provenance and promotion remain open.
