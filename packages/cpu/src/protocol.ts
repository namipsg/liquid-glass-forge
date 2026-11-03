import { createFrame, OPTICAL_MODEL, validateSource } from '@liquid-glass-forge/core';
import type { FrameDescriptor, PixelSource } from '@liquid-glass-forge/core';
import { prepareCpuSource, renderCpu, disposeCpuSource, preparedStorageBytes } from './kernel.js';
import type { CpuEffects, PreparedCpuSource } from './kernel.js';

export interface CpuSurfacePixels { readonly id: string; readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }
export interface CpuTimings {
  readonly scheduledWaitMs?: number; readonly startedAt?: number;
  readonly snapshotMs: number; readonly transferCopyMs: number;
  readonly prepareMs: number; readonly kernelMs: number; readonly transferSubmitMs: number; readonly roundTripMs: number;
}
export interface BatchPixels {
  readonly generation: number; readonly revision: number; readonly sourceRevision: number;
  readonly retainedBytes?: number; readonly surfaces: readonly CpuSurfacePixels[]; readonly timings: CpuTimings;
}
export interface CpuWork {
  readonly cacheSources?: boolean; readonly type: 'render'; readonly id: number; readonly source: PixelSource; readonly frame: FrameDescriptor;
  readonly effects?: CpuEffects; readonly outputs: readonly Uint8ClampedArray[];
}
export function checkedFrame(source: PixelSource, frame: FrameDescriptor): FrameDescriptor {
  validateSource(source);
  if (!frame || frame.opticalModel !== OPTICAL_MODEL || Object.keys(frame).some(k => !['contractVersion', 'opticalModel', 'generation', 'revision', 'sourceRevision', 'surfaces'].includes(k))) throw new TypeError('Invalid CPU frame model');
  return createFrame({ contractVersion: frame.contractVersion, generation: frame.generation, revision: frame.revision, sourceRevision: frame.sourceRevision, surfaces: frame.surfaces }, source);
}
/** Same batch implementation is used in the main thread and the standalone worker graph. */
export class CpuBatchSession {
  #key: string | undefined; #source: PreparedCpuSource | undefined;
  get storageBytes(): number { return this.#source ? preparedStorageBytes(this.#source) : 0; }
  prepare(source:PixelSource,frame:FrameDescriptor):PreparedCpuSource {
    const key=`${frame.generation}/${frame.sourceRevision}/${source.width}/${source.height}`;
    if(this.#key!==key){this.dispose();this.#source=prepareCpuSource(source);this.#key=key;}
    return this.#source!;
  }
  run(work:CpuWork):BatchPixels{return runCpuBatch(work,this);}
  dispose():void{if(this.#source)disposeCpuSource(this.#source);this.#source=undefined;this.#key=undefined;}
}
export function runCpuBatch(work: CpuWork, session?:CpuBatchSession): BatchPixels {
  const frame = checkedFrame(work.source, work.frame), start = performance.now(), prepared = session ? session.prepare(work.source, frame) : prepareCpuSource(work.source);
  const prepareMs = performance.now() - start, kernelStart = performance.now();
  try {
    if (work.outputs.length !== frame.surfaces.length) throw new TypeError('Invalid CPU output count');
    const surfaces = frame.surfaces.map((surface, i) => ({ id: surface.id, width: surface.width, height: surface.height,
      data: renderCpu(prepared, surface, work.effects, work.outputs[i]) }));
    return { generation: frame.generation, revision: frame.revision, sourceRevision: frame.sourceRevision, surfaces, retainedBytes: session ? preparedStorageBytes(prepared) : 0,
      timings: { snapshotMs: 0, transferCopyMs: 0, prepareMs, kernelMs: performance.now() - kernelStart, transferSubmitMs: 0, roundTripMs: 0 } };
  } finally { if(!session) disposeCpuSource(prepared); }
}
