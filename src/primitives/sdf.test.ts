import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  createRng,
  type Mesh,
  Ts23dError,
  triangleCount,
  type Vec3,
} from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { nonManifoldEdges, openEdges, windingFlips } from './closed.ts';
import { sdf } from './sdf.ts';
import { sampleGrid } from './sdf-grid.ts';
import { sd } from './sdf-ops.ts';
import { valueNoise } from './value-noise.ts';

const C: Vec3 = [0.5, 0.5, 0.5];
const B: readonly [Vec3, Vec3] = [
  [-1.2, -1.2, -1.2],
  [1.2, 1.2, 1.2],
];
const ball = (resolution: number, mesher?: 'nets' | 'cubes'): Mesh =>
  sdf({
    field: sd.sphere([0, 0, 0], 1),
    bounds: B,
    resolution,
    color: C,
    ...(mesher ? { mesher } : {}),
  });

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** Grid edges where the sampled value changes sign: nets emits exactly one quad per edge. */
function crossings(resolution: number): number {
  const g = sampleGrid(sd.sphere([0, 0, 0], 1), B, resolution, 1.25);
  let n = 0;
  const v = (x: number, y: number, z: number): number => g.values[x + g.nx * (y + g.ny * z)] ?? 1;
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) {
        const s = v(x, y, z) < 0;
        if (x + 1 < g.nx && s !== v(x + 1, y, z) < 0) n++;
        if (y + 1 < g.ny && s !== v(x, y + 1, z) < 0) n++;
        if (z + 1 < g.nz && s !== v(x, y, z + 1) < 0) n++;
      }
  return n;
}

describe('sdf', () => {
  it('throws T3D_RECIPE_INVALID with a fix on bad bounds, resolution and empty fields', () => {
    const inv = fails(() =>
      sdf({ field: sd.sphere([0, 0, 0], 1), bounds: [B[1], B[0]], resolution: 0.1, color: C }),
    );
    expect(inv.code).toBe('T3D_RECIPE_INVALID');
    expect(inv.fix).toContain('max > min');
    expect(fails(() => ball(0)).fix).toContain('metres');
    expect(fails(() => ball(0.00001)).fix).toContain('cells ≥');
    expect(
      fails(() => sdf({ field: () => 1, bounds: B, resolution: 0.2, color: C })).fix,
    ).toContain('negative');
    expect(
      fails(() => sdf({ field: () => Number.NaN, bounds: B, resolution: 0.2, color: C })).fix,
    ).toContain('finite');
  });

  it('meshes a unit sphere: bounds within a cell, closed, outward, smooth radial normals', () => {
    for (const mesher of ['nets', 'cubes'] as const) {
      const m = ball(0.1, mesher);
      const b = boundsOf(m);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs((b.max[k] ?? 0) - 1)).toBeLessThan(0.1);
        expect(Math.abs((b.min[k] ?? 0) + 1)).toBeLessThan(0.1);
      }
      expect([mesher, openEdges(m), nonManifoldEdges(m)]).toEqual([mesher, 0, 0]);
      expect([mesher, windingFlips(m)]).toEqual([mesher, 0]);
      for (let i = 0; i < m.positions.length; i += 3) {
        const p = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
        const r = Math.hypot(...p);
        expect(p.reduce((s, x, k) => s + (x / r) * (m.normals[i + k] ?? 0), 0)).toBeGreaterThan(
          0.98,
        );
      }
    }
  });

  it('triangles = 2 × crossing grid edges (nets), ~quadrupling as resolution halves', () => {
    for (const r of [0.2, 0.1]) expect(triangleCount(ball(r))).toBe(2 * crossings(r));
    const ratio = triangleCount(ball(0.05)) / triangleCount(ball(0.1));
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  it('the sparse pass changes nothing: same mesh as a dense sample', () => {
    const f = sd.smoothUnion(
      0.2,
      sd.sphere([0, 0, 0], 0.7),
      sd.box([0.5, 0, 0], [0.8, 0.6, 0.6], 0.05),
    );
    const sparse = sdf({ field: f, bounds: B, resolution: 0.03, color: C });
    const dense = sdf({ field: f, bounds: B, resolution: 0.03, color: C, lipschitz: 1e6 });
    expect(sparse).toEqual(dense);
  });

  it('clips to bounds so a field that overflows them is still closed', () => {
    const m = sdf({ field: sd.sphere([0, 0, 0], 2), bounds: B, resolution: 0.2, color: C });
    expect(openEdges(m)).toBe(0);
    expect(boundsOf(m).max[0]).toBeCloseTo(1.2, 2); // samples keep |v| ≥ h / 100
  });

  it('keeps V on the strip, colours per vertex, and is deterministic with seeded noise', () => {
    const rock = (seed: number): Mesh =>
      sdf({
        field: sd.displace(
          sd.ellipsoid([0, 0, 0.4], [1, 0.8, 0.5]),
          valueNoise(createRng(seed), { scale: 0.4 }),
          0.12,
        ),
        bounds: [
          [-1.3, -1.1, -0.3],
          [1.3, 1.1, 1.1],
        ],
        resolution: 0.08,
        strip: 'stone',
        color: (_p, n) => (n[2] > 0.7 ? [0.3, 0.5, 0.2] : [0.5, 0.5, 0.5]),
      });
    const m = rock(7);
    const r = stripRect('stone');
    for (let i = 1; i < m.uvs.length; i += 2) {
      expect(m.uvs[i] ?? 0).toBeGreaterThan(r.v0);
      expect(m.uvs[i] ?? 1).toBeLessThan(r.v1);
    }
    expect(m.colors.some((c, i) => i % 3 === 1 && Math.abs(c - 0.5) < 1e-6)).toBe(true);
    expect(m.colors.some((c, i) => i % 3 === 1 && Math.abs(c - 0.3) > 0.1 && c < 0.45)).toBe(false);
    expect(rock(7)).toEqual(m);
    expect(rock(8)).not.toEqual(m);
    expect(openEdges(m)).toBe(0);
  });
});
