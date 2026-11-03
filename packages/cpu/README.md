# @liquid-glass-forge/cpu

Private experimental JavaScript CPU optics, version `0.0.0-dev`.
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
