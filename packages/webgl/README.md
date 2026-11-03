# Liquid Glass Forge WebGL

Private experimental package, `0.0.0-dev`. Shared persistent WebGL2 atlas,
versioned optics, GPU blur and synchronous Canvas2D tile presentation.

Use `WebGLAtlas` from `@liquid-glass-forge/webgl` for owned Canvas2D targets.
Use `createWebGLRenderer` or `createOpticalRenderer` from
`@liquid-glass-forge/webgl/dom` with the vanilla host. Import and construction
allocate no browser resources. Forced modes never downgrade; auto requires an
explicit `none`, `cpu` or `material` fallback policy. Dispose renderers and release
standalone canvas frames. The caller owns source bytes and supplied targets.

Core scenes retain 16-host / 4-million-pixel bounds. The direct atlas accepts up
to 50 small tiles under aggregate pixel, texture-size and image-memory bounds.
Nonzero GPU blur requires renderable float buffers. No production GPU readback.
Performance support is limited to named measured workloads. See the repository
`docs/PHASE-6.md` for API, source ownership, recovery and measured scope.
