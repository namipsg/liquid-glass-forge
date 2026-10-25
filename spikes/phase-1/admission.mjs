// Fixed Phase 1 workloads. Cadence allows 5% scheduler/timestamp variation;
// service-time limits remain exactly 30 CPU and 60 GPU updates per second.
export const ADMISSION = Object.freeze({
  cpu: { count: 1, width: 320, height: 180, batchMs: 1000 / 30, intervalMs: 1000 / 30 * 1.05, ageMs: 50, bytes: 8 * 1024 * 1024 },
  webgl: { count: 4, width: 640, height: 360, batchMs: 1000 / 60, intervalMs: 1000 / 60 * 1.05, ageMs: 1000 / 60, bytes: 16 * 1024 * 1024 },
});

export function evaluateAdmission(runs) {
  const checks = [];
  for (const backend of ['cpu', 'webgl']) {
    const originals = Object.entries(runs ?? {}).filter(([name]) => new RegExp(`^${backend}(Repeat[23])?$`).test(name));
    checks.push({ name: `${backend}: repeated original workload`, pass: originals.length >= 2 });
    for (const [name, run] of originals) {
      const limit = ADMISSION[backend];
      const shape = run.backend === backend && run.count === limit.count && run.width === limit.width && run.height === limit.height
        && run.source?.width === 640 && run.source?.height === 360 && run.frames >= 90 && run.warmup >= 15 && run.rawFrames?.length === run.frames;
      const numeric = value => Number.isFinite(value) && value >= 0;
      const within = (value, budget) => numeric(value) && value <= budget;
      const accountedBytes = run.estimatedOwnedBytes + run.targetCanvasBytesLowerBound + run.inputBytes;
      const gpu = backend !== 'webgl' || (run.gpu?.backend === 'webgl' && run.gpu.contextType === 'webgl2'
        && run.gpu.resources.contexts === 1 && run.gpu.lastBatch?.gpuSnapshots === 1 && run.gpu.lastBatch.targets === 4
        && run.gpu.renderCount === run.count * (run.frames + run.warmup) && run.gpu.batchCount === run.frames + run.warmup);
      checks.push({ name, pass: shape && gpu && run.environment?.visibility === 'visible'
        && within(run.batchMs?.p95, limit.batchMs) && within(run.frameIntervalMs?.p95, limit.intervalMs)
        && within(run.completionAgeMs?.p95, limit.ageMs) && within(accountedBytes, limit.bytes),
      actual: { batchP95Ms: run.batchMs?.p95, intervalP95Ms: run.frameIntervalMs?.p95, ageP95Ms: run.completionAgeMs?.p95, accountedBytes }, limit });
    }
  }
  return { pass: checks.every(check => check.pass), checks,
    scope: 'Warm static-source workloads; image-buffer accounting excludes browser/driver overhead. Not physical scanout or live-source latency.' };
}
