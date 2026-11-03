# Liquid Glass Forge Angular

Private experimental `0.0.0-dev`. Exact tested peers: Angular core/common22.2.4
and RxJS7.8.2. The ng-packagr output uses Angular Package Format, partial
compilation, FESM2022 and bundled declarations. Angular/RxJS remain external.
Pack the prepared `packages/angular/dist` directory, not this source directory.

Import `GlassSceneDirective`, `GlassSurfaceComponent`, `GlassSurfaceDirective`
from `@liquid-glass-forge/angular` in standalone component imports. Load
`@liquid-glass-forge/dom/styles.css` through the application stylesheet pipeline.

`lgf-surface` owns its decorative template canvas and projects normal content.
`[lgfSurface]` binds a caller-template-owned direct canvas via required `lgfTarget`.
Both expose `element`, `target` and `invalidate`; the component target is undefined
before its view query resolves. Native controls remain Angular-owned.

`[lgfScene]` shares an engine across descendants, accepting `lgfSource`,
`lgfRenderer`, `lgfPaused` and `lgfTimeoutMs`, with errors emitted by `lgfError`.
The caller owns reusable source/renderer objects. DestroyRef cleanup aborts work
and disposes the scene/attachments without terminally disposing those objects.

Browser activation requires local view readiness and application stability after
a render callback. The callback alone is not treated as hydration completion.
Only eager SSR hydration is qualified by current consumers; deferred/incremental
hydration remains unqualified. Bitmap work runs outside Angular and does not
write framework signals per frame. SSR import/render starts no engine.

See repository `docs/PHASE-9.md` for the exact Angular/Node/TypeScript matrix,
APF/linker evidence, ownership, and remaining qualification boundaries.
