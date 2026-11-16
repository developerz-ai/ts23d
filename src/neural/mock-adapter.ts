// mockAdapter: a deterministic stand-in model for every neural task, for tests, demos and CI (no
// GPU, no network). Same job → same bytes: images and textures are seeded gradients at the asked
// size, meshes a box GLB, rig / motion / hair small JSON documents, score a fixed rubric reply;
// tool tasks: cloth / meshopt a box GLB, fracture two boxes, engine-check a JSON report, ktx2 a
// header-only KTX2.

import { encodePng, NEURAL_TASKS, type NeuralOutput, type NeuralTask } from '../core/index.ts';
import type { NeuralAdapter, NeuralJob, NeuralModelInfo, NeuralRun } from './adapter.ts';
import { fieldsOf, pickModel, taskResult } from './adapter.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { sha256Hex } from './sha256.ts';

export const MOCK_LICENCE = 'CC0-1.0 (ts23d mockAdapter: procedural, no model)';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const jsonOut = (v: unknown): NeuralOutput => ({
  bytes: enc(JSON.stringify(v)),
  mime: 'application/json',
});

function gradient(w: number, h: number, seed: number): NeuralOutput {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = (x * 255) / Math.max(1, w - 1);
      px[i + 1] = (y * 255) / Math.max(1, h - 1);
      px[i + 2] = (seed * 37) & 255;
      px[i + 3] = 255;
    }
  return { bytes: encodePng(w, h, px), mime: 'image/png' };
}

const glbOut = (sizes: readonly number[]): NeuralOutput => ({
  bytes: writeMeshGlb(
    sizes.map((s, i) => ({
      name: sizes.length === 1 ? 'mock' : `mock_${i}`,
      mesh: cube([s, s, s]),
    })),
  ),
  mime: 'model/gltf-binary',
});

/** The 12-byte KTX2 identifier and a zeroed header: enough for the identifier check. */
function ktx2Out(): NeuralOutput {
  const b = new Uint8Array(80);
  b.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { bytes: b, mime: 'image/ktx2' };
}

function outputsFor(job: NeuralJob): NeuralOutput[] {
  const r = fieldsOf(job.request);
  const seed = job.request.seed;
  const n = (k: string, d: number): number => (typeof r[k] === 'number' ? r[k] : d);
  switch (job.task) {
    case 'image':
      return [gradient(n('width', 8), n('height', 8), seed)];
    case 'texture':
      return [gradient(n('size', 8), n('size', 8), seed)];
    case 'mesh':
    case 'cloth':
    case 'groom':
    case 'meshopt':
      return [glbOut([1 + (seed % 4) * 0.25])];
    case 'fracture':
      return [glbOut([0.5, 0.25])];
    case 'engine-check':
      return [jsonOut({ engine: 'mock', ok: true, meshes: 1, animations: [], colliders: 0 })];
    case 'ktx2':
      return [ktx2Out()];
    case 'rig':
      return [jsonOut({ bones: [{ name: 'root', parent: -1, head: [0, 0, 0], tail: [0, 0, 1] }] })];
    case 'motion': {
      const frames = Math.max(1, Math.round(n('seconds', 1) * n('fps', 30)));
      return [
        jsonOut({ fps: n('fps', 30), loop: true, rotations: Array(frames).fill([0, 0, 0, 1]) }),
      ];
    }
    case 'hair':
      return [
        jsonOut({
          strands: [
            [
              [0, 0, 0],
              [0, 0, 0.1 + (seed % 5) * 0.01],
            ],
          ],
        }),
      ];
    default:
      return [jsonOut({ rubric: r['rubric'] ?? 'default', note: 'mock score' })];
  }
}

export interface MockAdapter extends NeuralAdapter {
  /** How many jobs ran: tests prove a cache hit never calls the model. */
  readonly calls: () => number;
}

/** A model per task (`mock-<task>`), deterministic outputs. */
export function mockAdapter(tasks: readonly NeuralTask[] = NEURAL_TASKS): MockAdapter {
  const models: NeuralModelInfo[] = tasks.map((task) => ({
    id: `mock-${task}`,
    task,
    licence: MOCK_LICENCE,
    weightsSha256: sha256Hex(enc(`mock-${task}`)),
    vramGb: 0,
  }));
  let calls = 0;
  return {
    id: 'mock',
    tasks,
    calls: () => calls,
    models: () => Promise.resolve(models),
    run<T extends NeuralTask>(job: NeuralJob<T>): Promise<NeuralRun<T>> {
      calls++;
      const model = pickModel('mock', models, job.task, job.model);
      const outputs = outputsFor(job);
      const result = taskResult(job.task, outputs, 5 + (job.request.seed % 5));
      return Promise.resolve({ result, model, server: 'ts23d-mock/1' });
    },
  };
}
