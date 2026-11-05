# Distribution and release procedure

**Qualified-release state: held.** The owner has separately requested an
experimental `next` preview while deferring further tests and repository updates.
See [the preview decision and status](PREVIEW.md). The qualified procedure below
retains its gates; the interactive preview does not claim CI provenance or a
support freeze. The npm organization
[`liquid-glass-forge`](https://www.npmjs.com/org/liquid-glass-forge) is owned by
`namipsg`. Scope creation does not authorize package publication or establish
trademark clearance. [Phase 11](PHASE-11.md) remains incomplete and its
[support candidate](SUPPORT.json) remains held.

## Experimental npm releases from GitHub

The [npm preview workflow](https://github.com/namipsg/liquid-glass-forge/actions/workflows/npm-preview.yml)
has a manual prepare step and a separate manual stage step. The staging job
uses GitHub OIDC. It submits the synchronized prerelease to npm for maintainer
review with the `next` tag. The qualified-release policy below remains separate.

1. In the settings for each of the seven [npm packages](https://www.npmjs.com/org/liquid-glass-forge),
   add a GitHub Actions trusted publisher. Set the owner to `namipsg`, repository
   to `liquid-glass-forge`, workflow to `npm-preview.yml`, and environment to
   `npm-preview`. Keep the permissions stage-only. Restrict that GitHub
   environment to `main`.
2. Synchronize the workspace and all package versions and internal dependencies
   before preparing a release. Run the workflow on `main` with `operation=prepare`.
   It runs focused software checks, builds and packs twice, and uploads the seven
   tarballs and their manifest. The workflow summary provides the manifest digest.
3. Review the tarballs and copy the successful run ID and manifest digest.
   Dispatch `operation=stage` on the same `main` commit. It checks the digest,
   commit, package bytes, and registry version availability before submitting.
4. Review all seven staged packages on npm and approve them with 2FA in
   dependency order (core, cpu, dom, webgl, react, vue, angular).
   If staging stops partway, compare the receipt with npm’s staged list before
   retrying. npm requires a staged version to be resolved before resubmission.
5. Verify the seven exact versions and their `next` tags. Rerun the Pages
   workflow to refresh its pinned install links after the full set is public.

The npm README embeds the same public GIF across all seven packages. Using the
shared URL keeps the runtime tarballs small. npm displays the new README and
homepage when the staged version is approved and processed. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## Build and review immutable artifacts

Use Node **24.21.0**, npm **11.19.0** and pnpm **10.34.5**. From a clean identified
commit, run the full suite and prepare the package set:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm release:prepare
pnpm release:verify --manifest <bundle>/manifest.json
pnpm release:consumers --manifest <bundle>/manifest.json
```

Preparation performs two independent builds, packs all seven packages twice and
requires byte-identical tarballs. It retains the original artifacts, rebuilt
copies, SHA-256, SHA-512 integrity, per-file hashes, exact inventories, synchronized
internal versions, pinned tooling, source commit/tree/file hashes and policy/support
snapshots. Existing output bundles cannot be overwritten. Angular uses its actual
built APF package. Install scripts and empty future packages are forbidden.

Every tarball must contain the project MIT license, actual holder, independent
Apple inspiration/non-endorsement boundary, and accurate no-reuse notice. Motion,
component catalogs, React Native and Flutter remain absent. A changed release
candidate needs a new version and new approval; approval covers the exact manifest
hash and its tarballs, never an unbounded rebuild.

Consumer verification explicitly selects the frozen artifacts. The existing
React/Vite/Next, Vue/Vite/Nuxt, Angular CSR/SSR and four-adapter resilience suites
install physical copies outside the repository and check actual installed bytes.
They retain production SSR/hydration, first frames, updates, forced CPU/worker/GPU,
fallback, native controls and disposal. There are no workspace aliases or substitute
source packages in this mode. Ordinary suites retain their existing pack mode.

The manually dispatched [rehearsal workflow](../.github/workflows/release-rehearsal.yml)
has read-only repository permissions, pinned actions/toolchains, no OIDC credential
permission and no publication step. It produces an immutable artifact for its
exact commit. No hosted execution or repository protection configuration is
claimed by merely committing that workflow.

## Before qualified-candidate publication

The strict command is `pnpm release:verify --manifest <bundle>/manifest.json --release`.
It must reject the current development set. Release requires a clean matching
commit, synchronized public `x.y.z-rc.N` packages, the exact Phase 11-qualified
artifact set, verified ownership/protection/trusted publishers, public provenance
eligibility, and an explicitly enabled reviewed policy. Neither advancing phases
nor passing a local rehearsal satisfies these gates.

Prepare the proposed synchronized public RC metadata in tarballs and qualify
that exact set **before** publication. The qualification report accepts both the
private development set and an explicit public RC set, with identical physical
gates. Changing version/private/notice metadata changes artifact hashes and does
not carry the old qualification forward automatically.

The owner must configure a GitHub `npm-release` environment with required reviewers,
prevent self-review, disallow protection bypass and restrict deployment to `main`.
Those are remote settings and have not been changed. Review the inactive
[publication workflow template](release/publish-candidate.yml.example) before
activating it as `.github/workflows/publish-candidate.yml`.

For each package, configure npm's GitHub trusted publisher for `namipsg`, repository
`liquid-glass-forge`, workflow `publish-candidate.yml`, environment `npm-release`.
The chosen policy is **direct publication to `next`**, with explicit `npm publish`
permission; staged publication and dist-tag permission are separate decisions.
Initial package/bootstrap actions require their own approved qualified artifacts;
do not publish placeholders to establish package records. Configure publishers
near the approved release: npm currently expires unvalidated configurations after
two days. GitHub-hosted runners, a public repository/package and the pinned
OIDC-capable npm are required for this provenance path. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Publication accepts an explicit approved manifest SHA-256 and downloads the
rehearsal artifact for the same commit. The protected manual OIDC job rechecks all
gates, refuses token fallback, and publishes the original tarballs with `next`,
public access and provenance. It never rebuilds after approval. Before any write,
all seven registry versions are checked for collisions. An existing byte-identical
version can be retained during partial-set recovery; a collision aborts the plan.
The qualified publication workflow remains inactive.

## Verify the registry before promotion

```sh
pnpm test:registry --manifest <approved-bundle>/manifest.json
```

This command requests all seven exact versions from npm, downloads their real
tarballs, and requires the approved hashes/integrities and physical file bytes.
It separately installs exact registry versions and executes the pinned npm's
`audit signatures --json --include-attestations`. Identity validation uses the
**bundles returned by that cryptographic verification**, requiring the correct
tarball subject, repository, workflow and source commit. Unsupported/missing
provenance formats fail. It then runs the full production consumer suites against
the downloaded tarballs. A local artifact run or a fabricated registry fixture is
not a registry/provenance pass. See [npm provenance verification](https://docs.npmjs.com/generating-provenance-statements/).

Promotion remains a separate owner-approved operation after this receipt and the
support/changelog review. Record each package's old `latest` version first; then
move all seven tags to the verified synchronized candidate. The current first
release has no known-good previous registry version, so no rollback version can be
invented. Withhold promotion on any partial publish, failed verification or drift.
For later releases, restore recorded known-good tags if needed and release fixes
as new versions. Never overwrite published versions or automatically unpublish
packages. The trusted publisher needs separately reviewed dist-tag permission
before an OIDC tag operation. [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
