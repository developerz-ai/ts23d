import { describe, expect, test } from 'bun:test';
import { boundsOf } from '../core/index.ts';
import { cube } from './fixtures.ts';
import { localGenerator } from './generator.ts';
import { writeMeshGlb } from './glb-write.ts';
import type { WireFetch } from './wire.ts';

const glb64 = Buffer.from(writeMeshGlb([{ name: 'rock', mesh: cube([2, 4, 1]) }])).toString(
  'base64',
);
const json = (v: unknown) => Promise.resolve(Response.json(v));

/** A t3d-neural/1 server as an injected fetch: one mesh model, every job done at once. */
const server =
  (outputs: unknown): WireFetch =>
  (url) => {
    if (url.endsWith('/v1/models')) return json([{ id: 'sf3d', task: 'mesh', licence: 'MIT' }]);
    if (url.endsWith('/v1/jobs')) return json({ id: 'j' });
    return json({ status: 'done', outputs });
  };

describe('localGenerator (mesh task wrapper)', () => {
  test('a mesh over targetTriangles → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const g = localGenerator({
      model: 'sf3d',
      endpoint: 'http://gpu:8190',
      fetch: server([{ mime: 'model/gltf-binary', data: glb64 }]),
    });
    const req = { prompt: 'rock', seed: 1, fit: [1, 1, 1] as const, targetTriangles: 6 };
    await expect(g.generate(req)).rejects.toThrow('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('returns the model mesh Z-up, fitted into the box', async () => {
    const g = localGenerator({
      model: 'sf3d',
      endpoint: 'http://gpu:8190',
      fetch: server([{ mime: 'model/gltf-binary', data: glb64 }]),
    });
    const m = await g.generate({ prompt: 'rock', seed: 1, fit: [1, 1, 1], targetTriangles: 100 });
    const b = boundsOf(m);
    expect(m.indices.length / 3).toBe(12);
    expect(Math.max(...[0, 1, 2].map((k) => (b.max[k] ?? 0) - (b.min[k] ?? 0)))).toBeCloseTo(1, 5);
    expect(b.min[2]).toBeCloseTo(0, 5);
  });
});
