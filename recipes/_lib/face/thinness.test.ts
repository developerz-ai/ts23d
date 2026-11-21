import { describe, expect, it } from 'bun:test';
import type { QuadMesh } from './base.ts';
import { quadNormals } from './quad.ts';
import { thinness } from './thinness.ts';

/** A closed box `w` thick (x), 4 cm square in y and z, as six quads per face of a 4 × 4 grid. */
function slab(w: number): QuadMesh {
  const p: number[] = [];
  const q: number[] = [];
  const n = 4;
  const face = (o: number[], u: number[], v: number[]): void => {
    const base = p.length / 3;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++)
        p.push(
          (o[0] ?? 0) + ((u[0] ?? 0) * i + (v[0] ?? 0) * j) / n,
          (o[1] ?? 0) + ((u[1] ?? 0) * i + (v[1] ?? 0) * j) / n,
          (o[2] ?? 0) + ((u[2] ?? 0) * i + (v[2] ?? 0) * j) / n,
        );
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        q.push(a, a + 1, a + n + 2, a + n + 1);
      }
  };
  const S = 0.04;
  // Front (+x) and back (−x) faces, counter-clockwise from outside.
  face([w / 2, 0, 0], [0, S, 0], [0, 0, S]);
  face([-w / 2, S, 0], [0, -S, 0], [0, 0, S]);
  return { p: new Float64Array(p), q: new Uint32Array(q) };
}

describe('thinness (D522: light through an ear rim)', () => {
  it('fails if a 3 mm sheet reads thick or a 2 cm slab reads thin', () => {
    for (const [w, lo, hi] of [
      [0.003, 0.4, 1],
      [0.02, 0, 0],
    ] as const) {
      const m = slab(w);
      const t = thinness(m, quadNormals(m), 0.006);
      const mean = t.reduce((a, b) => a + b, 0) / t.length;
      expect(mean).toBeGreaterThanOrEqual(lo);
      expect(mean).toBeLessThanOrEqual(hi);
    }
  });
});
