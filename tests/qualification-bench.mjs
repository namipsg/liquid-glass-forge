// Execute the existing admission fixtures in their own document/clock realm.
window.qualificationBench = {
  cpuConformance: async () => {
    const result = await (await import('/cpu-device-fixtures.js')).conformance();
    window.finishPhysicalNative?.();
    return result;
  },
  cpu: async (execution, repeat) => (await import('/cpu-device-fixtures.js')).workload(execution, repeat),
  gpuConformance: async () => (await import('/webgl-fixtures.js')).conformance(),
  gpu: async repeat => (await import('/webgl-fixtures.js')).benchmark(repeat),
};
