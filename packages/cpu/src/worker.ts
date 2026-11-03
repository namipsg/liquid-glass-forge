import { runCpuBatch, CpuBatchSession } from './protocol.js';
import type { CpuWork } from './protocol.js';

// This entry is an explicit worker asset, never imported by the SSR-safe root.
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<CpuWork>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };
const session = new CpuBatchSession();
scope.onmessage = event => {
  const work = event.data;
  try {
    if (work?.type !== 'render' || !Number.isSafeInteger(work.id)) throw new TypeError('Invalid CPU worker request');
    if(!work.cacheSources)session.dispose();
    const result = work.cacheSources ? session.run(work) : runCpuBatch(work);
    scope.postMessage({ type: 'result', id: work.id, result, returnedInput: work.source.data },
      [work.source.data.buffer as ArrayBuffer, ...result.surfaces.map(s => s.data.buffer as ArrayBuffer)]);
  } catch (cause) { scope.postMessage({ type: 'error', id: work?.id, message: cause instanceof Error ? cause.message : 'CPU worker failed' }, []); }
};
