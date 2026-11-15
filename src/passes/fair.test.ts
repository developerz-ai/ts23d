import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh, MeshBuilder, Ts23dError, type Vec3 } from '../core/index.ts';
import { fair } from './fair.ts';

/** Lat-long sphere with shared vertices, radius jittered by ±`ripple` (voxel-like noise). */
function bumpySphere(ripple: number, rings = 24, segs = 48): Mesh {
  const b = new MeshBuilder();
  const rng = createRng(3);
  const v = (p: Vec3): number => {
    const r = 1 + rng.range(-ripple, ripple);
    const l = Math.hypot(...p);
    return b.vertex({
      p: [(p[0] * r) / l, (p[1] * r) / l, (p[2] * r) / l],
      n: [p[0] / l, p[1] / l, p[2] / l],
      uv: [0, 0],
      color: [1, 1, 1],
    });
  };
  const south = v([0, 0, -1]);
  const ring: number[][] = [];
  for (let i = 1; i < rings; i++) {
    const th = Math.PI * (i / rings - 0.5);
    ring.push(
      Array.from({ length: segs }, (_, j) => {
        const ph = (2 * Math.PI * j) / segs;
        return v([Math.cos(th) * Math.cos(ph), Math.cos(th) * Math.sin(ph), Math.sin(th)]);
      }),
    );
  }
  const north = v([0, 0, 1]);
  const at = (i: number, j: number): number => ring[i]?.[j % segs] ?? 0;
  for (let j = 0; j < segs; j++) {
    b.tri(south, at(0, j + 1), at(0, j));
    b.tri(north, at(rings - 2, j), at(rings - 2, j + 1));
    for (let i = 0; i + 1 < rings - 1; i++)
      b.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  return b.build();
}

/** Unit cube, each face an n × n grid with its own vertices (flat normals, split at the edges). */
function gridCube(n = 6): Mesh {
  const b = new MeshBuilder();
  for (const [axis, sign] of [
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [2, 1],
    [2, -1],
  ] as const) {
    const u = (axis + 1) % 3;
    const w = (axis + 2) % 3;
    const nrm: [number, number, number] = [0, 0, 0];
    nrm[axis] = sign;
    const id: number[] = [];
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const p: [number, number, number] = [0, 0, 0];
        p[axis] = sign * 0.5;
        p[u] = i / n - 0.5;
        p[w] = j / n - 0.5;
        id.push(b.vertex({ p, n: nrm, uv: [0, 0], color: [1, 1, 1] }));
      }
    const at = (i: number, j: number): number => id[i * (n + 1) + j] ?? 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (sign > 0) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
        else b.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  return b.build();
}

/** Enclosed volume (divergence theorem). */
function volume(m: Mesh): number {
  let v = 0;
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (m.indices[t + k] ?? 0) * 3) as [number, number, number];
    v +=
      ((P[a] ?? 0) * ((P[b + 1] ?? 0) * (P[c + 2] ?? 0) - (P[b + 2] ?? 0) * (P[c + 1] ?? 0)) -
        (P[a + 1] ?? 0) * ((P[b] ?? 0) * (P[c + 2] ?? 0) - (P[b + 2] ?? 0) * (P[c] ?? 0)) +
        (P[a + 2] ?? 0) * ((P[b] ?? 0) * (P[c + 1] ?? 0) - (P[b + 1] ?? 0) * (P[c] ?? 0))) /
      6;
  }
  return v;
}

/** Standard deviation of |p| over the vertices: the ripple left on a sphere. */
function ripple(m: Mesh): number {
  const r: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3)
    r.push(Math.hypot(m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0));
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / r.length);
}

describe('fair', () => {
  it('throws T3D_RECIPE_INVALID with a fix on bad iterations or crease angle', () => {
    for (const o of [{ iterations: -1 }, { iterations: 2.5 }, { iterations: 5, creaseAngle: 0 }]) {
      try {
        fair(bumpySphere(0.01), o);
        throw new Error('expected a throw');
      } catch (e) {
        expect(e).toBeInstanceOf(Ts23dError);
        if (e instanceof Ts23dError) {
          expect(e.code).toBe('T3D_RECIPE_INVALID');
          expect(e.fix.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('irons out ripple and keeps the volume within 1 %', () => {
    // Half-cell ripple on a lat-long sphere; the uniform umbrella leaves a tessellation bias of
    // ~0.4 of it, so "halved" is the honest bar.
    const m = bumpySphere(0.005);
    const f = fair(m, { iterations: 8 });
    expect(ripple(f)).toBeLessThan(ripple(m) * 0.5);
    expect(Math.abs(volume(f) / volume(m) - 1)).toBeLessThan(0.01);
  });

  it("keeps creases: a cube's edges stay put unless keep is 'none'", () => {
    const cube = gridCube();
    const kept = fair(cube, { iterations: 10 });
    const corner = (m: Mesh): number => {
      let best = 0;
      for (let i = 0; i < m.positions.length; i += 3)
        best = Math.max(
          best,
          Math.abs(m.positions[i] ?? 0) +
            Math.abs(m.positions[i + 1] ?? 0) +
            Math.abs(m.positions[i + 2] ?? 0),
        );
      return best;
    };
    expect(corner(kept)).toBeCloseTo(1.5, 6);
    expect(Math.abs(volume(kept) - 1)).toBeLessThan(1e-6);
    const melted = fair(cube, { iterations: 10, keep: 'none' });
    expect(corner(melted)).toBeLessThan(1.45);
  });

  it('is deterministic, keeps every other attribute, and 0 iterations is a no-op', () => {
    const m = bumpySphere(0.02);
    const a = fair(m, { iterations: 4 });
    const b = fair(m, { iterations: 4 });
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
    expect(a.indices).toBe(m.indices);
    expect(a.uvs).toBe(m.uvs);
    expect(a.colors).toBe(m.colors);
    expect(fair(m, { iterations: 0 })).toBe(m);
  });

  it('never moves an open boundary', () => {
    const b = new MeshBuilder();
    const rng = createRng(1);
    const id: number[] = [];
    for (let i = 0; i <= 8; i++)
      for (let j = 0; j <= 8; j++)
        id.push(
          b.vertex({
            p: [i / 8, j / 8, rng.range(-0.02, 0.02)],
            n: [0, 0, 1],
            uv: [0, 0],
            color: [1, 1, 1],
          }),
        );
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++)
        b.quad(
          id[i * 9 + j] ?? 0,
          id[(i + 1) * 9 + j] ?? 0,
          id[(i + 1) * 9 + j + 1] ?? 0,
          id[i * 9 + j + 1] ?? 0,
        );
    const m = b.build();
    const f = fair(m, { iterations: 6, keep: 'none' });
    for (let k = 0; k < m.positions.length; k += 3) {
      const [x, y] = [m.positions[k] ?? 0, m.positions[k + 1] ?? 0];
      if (x === 0 || y === 0 || x === 1 || y === 1)
        expect(f.positions[k + 2]).toBe(m.positions[k + 2] ?? 0);
    }
  });
});
