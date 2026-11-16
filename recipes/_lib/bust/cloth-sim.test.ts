import { afterEach, describe, expect, it } from 'bun:test';
import {
  type Mesh,
  type NeuralAdapter,
  neuralCache,
  provideNeural,
  taskResult,
} from '@developerz.ai/ts23d';
import { clothJob, drapeGarment, glbOf } from './cloth-sim.ts';

/** One triangle with distinct coordinates, so an axis mix-up shows. */
const tri = (dz: number): Mesh => ({
  positions: new Float32Array([0.1, 0.2, 1.5 + dz, 0.3, -0.2, 1.4 + dz, -0.1, 0, 1.6 + dz]),
  normals: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
  uvs: new Float32Array(6),
  colors: new Float32Array(9).fill(1),
  indices: new Uint32Array([0, 1, 2]),
});
const sim = { garment: tri(0), body: tri(-0.5), frames: 12 };

/** A stand-in cloth tool: the garment dropped 0.2 m. */
const dropper: NeuralAdapter = {
  id: 'drop',
  tasks: ['cloth'],
  models: () => Promise.resolve([{ id: 'drop', task: 'cloth', licence: 'own' }]),
  run: (job) =>
    Promise.resolve({
      result: taskResult(job.task, [
        { bytes: glbOf('draped', tri(-0.2)), mime: 'model/gltf-binary' },
      ]),
      model: { id: 'drop', task: 'cloth', licence: 'own' },
    }),
};

afterEach(() => provideNeural(neuralCache({ recipe: 'cloth_sim_test', offline: true })));

describe('cloth-sim', () => {
  it('no cached drape → fallback with a T3D_NEURAL_MISSING notice (the stroke folds stay)', () => {
    const d = drapeGarment('cloth_sim_test', sim);
    expect(d.fallback).toBe(true);
    expect(d.fallback && d.notice.code).toBe('T3D_NEURAL_MISSING');
    expect(d.fallback && d.notice.fix).toContain('t3d neural run');
  });

  it('a cached drape comes back in the ts23d frame', async () => {
    const cache = neuralCache({ recipe: 'cloth_sim_test' });
    await cache.fill(dropper, { task: 'cloth', ...clothJob(sim) });
    provideNeural(cache);
    const d = drapeGarment('cloth_sim_test', sim);
    expect(d.fallback).toBe(false);
    if (!d.fallback) {
      const want = tri(-0.2).positions;
      for (const [i, v] of d.mesh.positions.entries())
        expect(v).toBeCloseTo(want[i] ?? Number.NaN, 5);
      expect(d.record.task).toBe('cloth');
    }
  });

  it('the request is a function of the meshes and settings', () => {
    const a = clothJob(sim).request;
    expect(clothJob(sim).request).toEqual(a);
    expect(clothJob({ ...sim, pinAboveZ: 1.5 }).request).not.toEqual(a);
    expect(a.frames).toBe(12);
  });
});
