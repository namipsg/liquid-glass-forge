# Phase 9: Angular adapter

Original Step 09/M25–M27 implementation completed and verified on 3 November 2026.
All packages remain private at `0.0.0-dev`. The adapter reuses the existing DOM,
source and renderer contracts; it implements no optical math.

## Standalone and template-owned API

```ts
import { Component } from '@angular/core';
import { GlassSceneDirective, GlassSurfaceComponent } from '@liquid-glass-forge/angular';
import { SourceProvider, createCpuRenderer } from '@liquid-glass-forge/dom';
@Component({
  selector: 'example-card', standalone: true,
  imports: [GlassSceneDirective, GlassSurfaceComponent],
  template: `<section lgfScene [lgfSource]="source" [lgfRenderer]="renderer">
    <lgf-surface style="width:240px;height:100px">
      <label>Name <input /></label>
    </lgf-surface>
  </section>`,
})
export class ExampleCard {
  readonly source = new SourceProvider({kind:'pixels',width:1,height:1,
    data:new Uint8Array([70,140,210,255])});
  readonly renderer = createCpuRenderer({executor:{worker:'off'}});
}
```

The application loads `@liquid-glass-forge/dom/styles.css` through its style
pipeline. `<lgf-surface>` is a block host with a dedicated decorative canvas and
`ng-content`. It accepts a typed `material` input and preserves projected DOM.
Native attributes/events stay on the Angular-owned host. Public `element`,
`target` and `invalidate()` expose the binding; the component target is undefined
until the view query resolves. No nodes are created/moved by the DOM engine.

For an existing host, import `GlassSurfaceDirective` and use:

```html
<section lgfSurface [lgfTarget]="target" style="position:relative;width:240px;height:100px">
  <canvas #target class="lgf-surface" data-lgf-material="glass"
    aria-hidden="true" role="presentation" tabindex="-1"></canvas>
  <label>Name <input /></label>
</section>
```

The target must be a dedicated direct readable Canvas2D child. The directive's
`lgfMaterial` input defaults to glass; the caller provides matching declarative
material/decoration attributes for SSR. Input target replacement retires the
previous binding and restores its original backing. Do not independently draw
into or control backing dimensions of the active target. Without a shared scene,
both surface forms use a local material-only scene.

`lgfScene` borrows `lgfSource`/`lgfRenderer` and owns one shared engine lifetime.
Source/renderer identity or timeout changes replace it. `lgfPaused` releases and
resumes active renderer resources; `lgfError` reports failures. The caller owns
reusable source/renderer objects; terminal destruction is the caller's decision.
DestroyRef aborts engine work and retires bindings. Errors arriving after the
provider is destroyed do not emit into an already-destroyed output.

## Browser and hydration boundary

No engine is created in import, constructor or server view hooks. Activation
requires the local view hook, a browser render callback, and the first stable
application notification. The stability subscription and render registration are
cancelled by DestroyRef. A queued continuation checks destruction before acting.
A render callback alone is explicitly **not** treated as hydration completion.

This is an eager-hydration support boundary for the tested applications. Neither
application stability nor a render callback establishes that arbitrary deferred
or incrementally hydrated components elsewhere have been claimed. Deferred and
incremental hydration remain unqualified. The implementation touches only its
local template-owned target after the tested gate; it uses no hydration opt-out.

Source reads/subscription callbacks, engine work and bitmap presentation run
outside Angular. Engine scene replacement can notify Angular once so bindings
observe new ownership; frame completion writes no Angular signal. The fixture
counts framework renders while actual CPU outputs complete to detect churn.
The tested applications explicitly use zoneless change detection without Zone.js.

## APF and exact toolchain

Angular core/common/compiler/compiler-cli/platform-browser/platform-server/router
**22.2.4**, Angular CLI/build/SSR **22.2.5**, ng-packagr **22.2.5**, TypeScript
**6.0.3**, RxJS **7.8.2** and tslib **2.9.1** run on Node **24.21.0**/macOS arm64.
Only the exact Angular core/common/RxJS peer combination is declared. Other
Angular/Node combinations are not qualified by this evidence.

`tools/angular` isolates the Angular compiler's TypeScript 6 dependency from the
existing TypeScript 7 declaration build for other packages. `pnpm build` creates
ng-packagr output under `packages/angular/dist`; packing uses that prepared
manifest and APF layout. The package contains FESM2022, its map, one declaration
bundle, manifest, README, license and notice. Its partial declaration markers and
bare framework imports are audited before a real application linker consumes it.
The root remains server-import safe in the Angular tooling model; an unlinked
partial package requires the Angular linker or explicit JIT compiler preload.

`pnpm test:adapter angular` / `pnpm test:angular` install physical tarballs outside
the workspace, check exact peer/tool versions and byte inventories, compile strict
public Angular templates, and reject an invalid material. They build production
AOT-linked zoneless CSR and request-time Angular SSR/hydration applications.
Application dependency installs disable scripts and analytics. The seven-package
shared smoke separately stages external peers and verifies the actual private
package installation offline. The Node 20 base lane excludes the newer Angular
compiler/runtime and keeps the prior six-package scope.

## Evidence and limits

Current verification is recorded under `private/phase-9`: APF build logs, raw
failed attempts, strict type diagnostics, install lockfiles, browser screenshots,
SSR HTML, source/producer/artifact hashes and outcome receipts. Raw data remains
private and ignored by Git. The browser matrix covers Chromium, Firefox and
WebKit; it is not physical-device or branded-Safari qualification.

Actual WebGL-through-Angular and combined resilience belong to Step 10. No new
physical performance qualification is inferred. Previous phase evidence, failures
and the Safari cadence waiver are retained. No plugin, hook, Jev/ECC variant,
publication, push, deployment or later phase is enabled by this work.


## Recorded outcome

The complete Node 24.21.0 suite passed **127 existing Node/browser checks**,
**seven reproducibly packed packages** with an offline independent installation,
**23 React consumer groups**, **17 Vue consumer groups** and **25 Angular groups**.
The Angular groups cover package/APF/import/strict-template/build/SSR checks plus
CSR and eager SSR hydration in Chromium **156.0.8078.4**, Firefox **157.0** and
WebKit **27.2**. Every browser lane verifies:

- No optical initialization or backing resize while the initial application task
  keeps stability closed; destruction before stability never initializes.
- Retained native input/canvas nodes after activation, native click/input/focus,
  projected content/material updates and shared scene/subscription ownership.
- Input-target replacement on the same directive host, whole-host replacement,
  source/renderer updates, pause/resume and actual changed CPU pixels.
- Six source invalidations with CPU completions without another Angular render; bitmap
  work requests no WebGL context.
- Async render abort/late-frame release, async initialization abort/late cleanup,
  and three unmount/remount cycles. SSR additionally repeats route-away/back
  cleanup three times, including the stable gate on each replacement view.
- No page/hydration warnings or errors and usable no-JavaScript baseline markup.

The current Angular receipt is `private/phase-9/consumer/run-YbjYPd/receipt.json`.
`private/phase-9/evidence.json` binds current source/tooling/producer hashes to
installed artifact hashes, the full regression, package smoke, Node 20 base logs,
SSR HTML, screenshots and retained failed attempts. The previous six packages'
50 tracked files match the Phase 8 source commit byte for byte. Prior numerical,
physical qualification and timing failures remain retained.

The frozen-lockfile offline workspace install also passed with scripts disabled.
The Node 20.19.6 base path builds/imports/packs the prior six packages; Angular
is excluded there. CI configuration reflects the split; no remote CI run is
claimed. Fixture processes, browsers and temporary consumers were cleaned up.
No package was published, pushed or deployed; Step 10 remains future work.

[Angular Package Format](https://angular.dev/tools/libraries/angular-package-format),
[DOM/render APIs](https://angular.dev/guide/components/dom-apis),
[hydration](https://angular.dev/guide/hydration), and
[zoneless change detection](https://angular.dev/guide/zoneless)
describe the framework boundaries used by the implementation and fixtures.
