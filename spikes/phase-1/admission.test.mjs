import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAdmission } from './admission.mjs';

function passing() {
  const make = backend => ({ backend, count: backend === 'cpu' ? 1 : 4, width: backend === 'cpu' ? 320 : 640,
    height: backend === 'cpu' ? 180 : 360, source: { width: 640, height: 360 }, frames: 90, warmup: 15, rawFrames: Array(90).fill({}),
    estimatedOwnedBytes: 1_000_000, targetCanvasBytesLowerBound: 1_000_000, inputBytes: 921600,
    environment: { visibility: 'visible' }, batchMs: { p95: 10 }, frameIntervalMs: { p95: 16.7 }, completionAgeMs: { p95: 12 },
    gpu: { backend: 'webgl', contextType: 'webgl2', renderCount: 420, batchCount: 105, resources: { contexts: 1 }, lastBatch: { gpuSnapshots: 1, targets: 4 } } });
  return { cpu: make('cpu'), cpuRepeat2: make('cpu'), webgl: make('webgl'), webglRepeat2: make('webgl') };
}

test('admission requires repeated original workloads and actual WebGL', () => {
  const runs = passing();
  assert.equal(evaluateAdmission(runs).pass, true);
  delete runs.webglRepeat2;
  runs.webglReduced1 = passing().webgl;
  assert.equal(evaluateAdmission(runs).pass, false);
  const fallback = passing(); fallback.webgl.gpu.backend = 'cpu';
  assert.equal(evaluateAdmission(fallback).pass, false);
  const stale = passing(); stale.webgl.gpu.renderCount = 4;
  assert.equal(evaluateAdmission(stale).pass, false);
});

test('fast reduced runs cannot replace a failed original workload', () => {
  const runs = passing(); runs.webgl.batchMs.p95 = 30;
  runs.webglReduced1 = { ...passing().webgl, width: 320, height: 180 };
  assert.equal(evaluateAdmission(runs).pass, false);
});

test('admission rejects wrong resolution, hidden pages, stale copies and excess storage', () => {
  for (const mutate of [r => { r.webgl.width = 320; }, r => { r.cpu.environment.visibility = 'hidden'; },
    r => { r.cpu.completionAgeMs.p95 = 51; }, r => { r.webgl.estimatedOwnedBytes = 32 * 1024 * 1024; }]) {
    const runs = passing(); mutate(runs); assert.equal(evaluateAdmission(runs).pass, false);
  }
});
