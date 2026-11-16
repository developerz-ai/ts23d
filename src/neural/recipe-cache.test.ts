import { describe, expect, test } from 'bun:test';
import {
  encodePng,
  NEURAL_TASKS,
  type NeuralRequest,
  type NeuralTask,
  Ts23dError,
} from '../core/index.ts';
import type { NeuralJob } from './adapter.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { mockAdapter } from './mock-adapter.ts';
import {
  entryOf,
  NEURAL_CAP_BYTES,
  neuralCache,
  providedNeural,
  provideNeural,
} from './recipe-cache.ts';
import { parseRecord, recordJson } from './record.ts';
import { sha256Hex } from './sha256.ts';

const glb = writeMeshGlb([{ name: 'm', mesh: cube() }]);
const meshIn = { sha256: sha256Hex(glb), mime: 'model/gltf-binary' };
const skel = new TextEncoder().encode('{"bones":["root"]}');
const skelIn = { sha256: sha256Hex(skel), mime: 'application/json' };
const png = encodePng(2, 2, new Uint8Array(16).fill(200));
const pngIn = { sha256: sha256Hex(png), mime: 'image/png' };
const inputs = new Map([
  [meshIn.sha256, glb],
  [skelIn.sha256, skel],
  [pngIn.sha256, png],
]);

/** One small request per task. */
const REQ: { readonly [T in NeuralTask]: NeuralRequest<T> } = {
  image: { seed: 1, prompt: 'bark', width: 8, height: 4 },
  mesh: { seed: 1, prompt: 'boulder', maxTriangles: 100 },
  texture: { seed: 1, prompt: 'rust', size: 8, mesh: meshIn },
  rig: { seed: 1, mesh: meshIn, maxBones: 4 },
  motion: { seed: 1, prompt: 'idle', skeleton: skelIn, seconds: 0.5, fps: 10 },
  hair: { seed: 1, mesh: meshIn },
  score: { seed: 1, images: [meshIn], rubric: 'silhouette' },
  cloth: { seed: 1, garment: meshIn, body: meshIn, frames: 12, pinAboveZ: 0.4 },
  fracture: { seed: 1, mesh: meshIn, pieces: 4 },
  'engine-check': { seed: 0, mesh: meshIn, engine: 'godot' },
  ktx2: { seed: 0, image: pngIn, mode: 'uastc' },
  meshopt: { seed: 0, mesh: meshIn, compress: true },
  groom: {
    seed: 0,
    mesh: meshIn,
    guides: skelIn,
    children: 4,
    cards: 2,
    points: 5,
    maxTriangles: 100,
  },
};

const job = <T extends NeuralTask>(task: T): NeuralJob<T> => ({ task, request: REQ[task], inputs });

describe('recipe cache: misses (failure first)', () => {
  test('offline miss → fallback + T3D_NEURAL_MISSING notice naming the command', () => {
    const c = neuralCache({ recipe: 'oak', offline: true });
    const r = c.get('image', REQ.image);
    expect(r.fallback).toBe(true);
    expect(r.fallback && r.notice.code).toBe('T3D_NEURAL_MISSING');
    expect(r.fallback && r.notice.fix).toContain('t3d neural run recipes/oak/oak.ts');
    expect(c.notices().length).toBe(1);
    expect(c.misses()).toEqual([{ task: 'image', request: REQ.image }]);
  });
  test('requireNeural → a miss throws T3D_NEURAL_MISSING', async () => {
    const c = neuralCache({ recipe: 'oak', requireNeural: true, offline: true });
    expect(() => c.get('mesh', REQ.mesh)).toThrow('T3D_NEURAL_MISSING');
    const e = await c.fill(mockAdapter(), job('mesh')).catch((x: unknown) => x);
    expect(e instanceof Ts23dError && e.code).toBe('T3D_NEURAL_MISSING');
  });
  test('over the cap (8 MB default) → T3D_NEURAL_FAILED, nothing stored', async () => {
    const c = neuralCache({ recipe: 'big', capBytes: 64 });
    const e = await c.fill(mockAdapter(), job('image')).catch((x: unknown) => x);
    expect(e instanceof Ts23dError && e.code).toBe('T3D_NEURAL_FAILED');
    expect(c.entries().length).toBe(0);
    expect(NEURAL_CAP_BYTES).toBe(8 * 1024 * 1024);
  });
  test('a tampered committed output → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const c = neuralCache({ recipe: 'oak' });
    const { entry } = await c.fill(mockAdapter(), job('image'));
    const file = entry.record.outputs[0]?.file ?? '';
    expect(() => entryOf(entry.record, new Map([[file, new Uint8Array([1])]]))).toThrow(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });
});

describe('recipe cache: every task round-trips through mockAdapter', () => {
  for (const task of NEURAL_TASKS)
    test(task, async () => {
      const adapter = mockAdapter();
      const fill = neuralCache({ recipe: 'oak' });
      const a = await fill.fill(adapter, job(task));
      const b = await fill.fill(adapter, job(task));
      expect([a.cached, b.cached, adapter.calls()]).toEqual([false, true, 1]);
      // Commit: record.json + output files → a fresh offline cache (CI) serves the same bytes.
      const record = parseRecord(recordJson(a.entry.record), 'record.json');
      const files = new Map(
        record.outputs.map((o, i) => [o.file, a.entry.outputs[i]?.bytes ?? new Uint8Array()]),
      );
      const ci = neuralCache({ recipe: 'oak', offline: true, entries: [entryOf(record, files)] });
      provideNeural(ci);
      const hit = providedNeural('oak').get(task, REQ[task]);
      expect(hit.fallback).toBe(false);
      if (!hit.fallback) {
        expect(hit.record.key).toBe(a.entry.record.key);
        expect(hit.result.outputs.map((o) => sha256Hex(o.bytes))).toEqual(
          a.entry.outputs.map((o) => sha256Hex(o.bytes)),
        );
        expect(hit.record.model.id).toBe(`mock-${task}`);
      }
      expect(providedNeural('oak').get(task, REQ[task], { model: 'other-model' }).fallback).toBe(
        true,
      );
      expect(ci.bytes()).toBeGreaterThan(0);
    });
});
