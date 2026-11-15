import { describe, expect, it } from 'bun:test';
import { tex } from '../material/index.ts';
import { deriveMaps, graphHeight } from './maps.ts';
import type { Texels } from './texels.ts';

/** A 1 m × 1 m flat patch facing +Z on an N² atlas: texel (x, y) at world (x/N, −y/N, 0). */
function patch(N: number, rough = 150): Texels {
  const position = new Float32Array(N * N * 3);
  const normal = new Float32Array(N * N * 3);
  const orm = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      position.set([x / N, -y / N, 0], i * 3);
      normal.set([0, 0, 1], i * 3);
      orm.set([255, rough, 40, 255], i * 4);
    }
  return {
    size: N,
    part: new Int32Array(N * N).fill(0),
    position,
    normal,
    base: new Uint8Array(N * N * 4).fill(128),
    orm,
  };
}

const N = 16;
const grey = new Uint8Array(N * N * 4).fill(128);

describe('deriveMaps', () => {
  it('rejects an albedo of another atlas size', () => {
    expect(() => deriveMaps(patch(N), new Uint8Array(4))).toThrow('T3D_FINISH_INVALID');
  });

  it('no height: flat normal, trim roughness and metal, whatever the albedo says', () => {
    const noisy = grey.map((_, i) => (i * 97) % 256);
    const m = deriveMaps(patch(N), noisy);
    for (let i = 0; i < N * N; i++) {
      expect([...m.normal.slice(i * 4, i * 4 + 3)]).toEqual([128, 128, 255]);
      expect(m.orm[i * 4 + 1]).toBe(150);
      expect(m.orm[i * 4 + 2]).toBe(40);
    }
  });

  it('a height rising along +X tilts the normal toward −X by its slope', () => {
    const m = deriveMaps(patch(N), grey, { height: (x) => x * 0.5 });
    const i = (N / 2) * N + N / 2;
    const nx = (m.normal[i * 4] ?? 0) / 127.5 - 1;
    const nz = (m.normal[i * 4 + 2] ?? 0) / 127.5 - 1;
    expect(nx / nz).toBeCloseTo(-0.5, 1);
  });

  it('concave height roughens; convex does not', () => {
    const bowl = deriveMaps(patch(N), grey, { height: (x, y) => (x - 0.5) ** 2 + (y + 0.5) ** 2 });
    const dome = deriveMaps(patch(N), grey, {
      height: (x, y) => -((x - 0.5) ** 2) - (y + 0.5) ** 2,
    });
    const i = (N / 2) * N + N / 2;
    expect(bowl.orm[i * 4 + 1] ?? 0).toBeGreaterThan(150);
    expect(dome.orm[i * 4 + 1]).toBe(150);
  });
});

describe('graphHeight', () => {
  const g = tex.material({
    height: tex.noise({ size: 0.05 }),
    albedo: tex.constant(0.5),
    roughness: 0.6,
    depth: 0.004,
  });

  it('rejects 0 texels', () => {
    expect(() => graphHeight(g, 1, 0)).toThrow('T3D_FINISH_INVALID');
  });

  it('metres of relief within depth, tiles every metre on each plane, deterministic', () => {
    const h = graphHeight(g, 3);
    const a = h(0.31, 0.27, 0.9, 0, 0, 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0.004);
    expect(h(1.31, 2.27, 0.9, 0, 0, 1)).toBeCloseTo(a, 9);
    expect(graphHeight(g, 3)(0.31, 0.27, 0.9, 0, 0, 1)).toBe(a);
    expect(h(0.31, 0.27, 0.9, 1, 0, 0)).not.toBe(a);
  });
});
