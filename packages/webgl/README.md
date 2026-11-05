# @liquid-glass-forge/webgl

WebGL2 glass refraction and a shared atlas for compositing optical surfaces.

[![A live glass lens bends the lettering beneath it](https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/#playground)

[Live showcase](https://namipsg.github.io/liquid-glass-forge/#playground) · [Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) · [Documentation](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-6.md) · [Support](https://namipsg.github.io/liquid-glass-forge/support.html)

## Install

```sh
npm install @liquid-glass-forge/webgl@0.1.0-rc.2
```

Keep the Forge packages at matching versions. This is an experimental preview.
The [support guide](https://namipsg.github.io/liquid-glass-forge/support.html) describes browser and device qualification.

## Usage

Experimental preview package, `0.1.0-rc.2`. Shared persistent WebGL2 atlas,
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
