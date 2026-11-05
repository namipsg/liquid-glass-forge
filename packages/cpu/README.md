# @liquid-glass-forge/cpu

Bounded JavaScript glass rendering with optional worker execution.

[![A live glass lens bends the lettering beneath it](https://raw.githubusercontent.com/namipsg/liquid-glass-forge/main/docs/assets/glass-playground.gif)](https://namipsg.github.io/liquid-glass-forge/#playground)

[Live showcase](https://namipsg.github.io/liquid-glass-forge/#playground) · [Examples](https://namipsg.github.io/liquid-glass-forge/examples.html) · [Documentation](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/PHASE-5.md) · [Support](https://namipsg.github.io/liquid-glass-forge/support.html) · [Install by framework](https://github.com/namipsg/liquid-glass-forge/blob/main/docs/QUICKSTART.md)

## Install

```sh
npm install @liquid-glass-forge/cpu@0.1.0-rc.2
```

Keep the Forge packages at matching versions. This is an experimental preview.
The [support guide](https://namipsg.github.io/liquid-glass-forge/support.html) describes browser and device qualification.

## Usage

Experimental preview JavaScript CPU optics, version `0.1.0-rc.2`.
Uses explicit core RGBA8 sources. Imports do not acquire browser resources.
`prepareCpuSource` snapshots pixels into private linear premultiplied storage;
`renderCpu` implements `rounded-refraction-v1`, optionally extending it with
the documented `rounded-material-v1` blur, dispersion, tint and highlights.
`disposeCpuSource` releases prepared storage. Reusable caller output is optional.

`CpuExecutor` snapshots borrowed input before yielding, shares a bounded pool
between output buffers and two private input buffers, and optionally retains one
prepared source with `cacheSources:true`. Advance source revision/generation when
pixels or the source change. Release returned batches when finished.
Optional `notBefore`/`onStart` schedule actual execution after the owned capture.
Prepared geometry and exact 2× source resampling share a 270,000-byte allowance;
changing optical strength still computes refraction on every frame.

See `docs/PHASE-5.md` in the project for equations, acceptance and current limits.
Implementation tests do not establish new physical-device admission.


The exported `@liquid-glass-forge/cpu/worker.js` entry registers the worker message
handler and is marked as side-effectful for bundlers. The package root remains
safe to import on the server. A consumer-owned worker entry may import that public
subpath and pass a statically bundled `Worker` through `workerFactory`. Phase8's
packed Vue/Nuxt tests exercise cancellation of a real completed worker frame.
