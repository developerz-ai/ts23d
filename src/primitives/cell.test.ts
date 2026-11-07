import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { cellRect, stripRect } from '../material/index.ts';
import { cell } from './cell.ts';

const C = [0.8, 0.8, 0.7] as const;

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** A 1 × 1.6 m window on a +X-facing wall at x = 0. */
const win = (extra: Partial<Parameters<typeof cell>[0]> = {}): Mesh =>
  cell({
    origin: [0, -0.5, 1],
    u: [0, 1, 0],
    v: [0, 0, 1.6],
    color: C,
    cell: 'window_sash',
    ...extra,
  });

const centroid = (m: Mesh, t: number): number[] =>
  [0, 1, 2].map((k) =>
    [0, 1, 2].reduce((s, j) => s + (m.positions[(m.indices[t * 3 + j] ?? 0) * 3 + k] ?? 0) / 3, 0),
  );

describe('cell', () => {
  it('throws T3D_RECIPE_INVALID with a fix on degenerate input', () => {
    const e = fails(() => win({ u: [0, 0, 1] }));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.fix).toContain('perpendicular');
    expect(fails(() => win({ inset: Number.NaN })).fix).toContain('finite');
    expect(fails(() => win({ inset: 0.1, doubleSided: true })).fix).toContain('doubleSided');
  });

  it('maps the whole cell rect, inside its edges', () => {
    const r = cellRect('window_sash');
    const m = win();
    expect(triangleCount(m)).toBe(2);
    for (let i = 0; i < m.uvs.length; i += 2) {
      expect(m.uvs[i] ?? 0).toBeGreaterThan(r.u0);
      expect(m.uvs[i] ?? 1).toBeLessThan(r.u1);
      expect(m.uvs[i + 1] ?? 0).toBeGreaterThan(r.v0);
      expect(m.uvs[i + 1] ?? 1).toBeLessThan(r.v1);
    }
    // V grows with world up: the top corners carry the larger V.
    expect(m.uvs[5] ?? 0).toBeGreaterThan(m.uvs[1] ?? 1);
  });

  it('insets the panel and adds 4 reveal faces (2 + 8 triangles) facing into the opening', () => {
    const m = win({ inset: 0.15 });
    expect(triangleCount(m)).toBe(10);
    const bb = boundsOf(m);
    [-0.15, -0.5, 1, 0, 0.5, 2.6].forEach((x, k) => {
      expect(k < 3 ? bb.min[k] : bb.max[k - 3]).toBeCloseTo(x, 6);
    });
    expect(m.normals[0]).toBeCloseTo(1, 6);
    // Reveal triangles: the normal points from the face centroid toward the opening axis.
    for (let t = 2; t < 10; t++) {
      const [, y = 0, z = 0] = centroid(m, t);
      const i = (m.indices[t * 3] ?? 0) * 3;
      const toAxis = [0 - y, 1.8 - z];
      expect(
        (m.normals[i + 1] ?? 0) * (toAxis[0] ?? 0) + (m.normals[i + 2] ?? 0) * (toAxis[1] ?? 0),
      ).toBeGreaterThan(0);
    }
    // Reveal UVs sit on the reveal strip.
    const s = stripRect('stone');
    const r = win({ inset: 0.15, reveal: 'stone' });
    for (let i = 4 * 2 + 1; i < r.uvs.length; i += 2) {
      expect(r.uvs[i] ?? 0).toBeGreaterThan(s.v0);
      expect(r.uvs[i] ?? 1).toBeLessThan(s.v1);
    }
  });

  it('a negative inset raises a plaque whose sides face outward', () => {
    const m = win({ inset: -0.05 });
    expect(boundsOf(m).max[0]).toBeCloseTo(0.05, 6);
    const [, y = 0] = centroid(m, 2);
    const i = (m.indices[6] ?? 0) * 3;
    expect((m.normals[i + 1] ?? 0) * y).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and double-sided on request', () => {
    expect(win({ inset: 0.1 })).toEqual(win({ inset: 0.1 }));
    expect(triangleCount(win({ doubleSided: true, cell: 'foliage_maple' }))).toBe(4);
  });
});
