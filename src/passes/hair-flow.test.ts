import { describe, expect, test } from 'bun:test';
import { dmath, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { chainSeed, flowAt, flowDivergence, hairFlow, tangentOf } from './hair-flow.ts';

/** Open cylinder along +X, radius r, length len (shared vertices). */
export function cylinder(r = 0.1, len = 1, rings = 24, around = 24): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const n: Vec3 = [0, dmath.cos(a), dmath.sin(a)];
      b.vertex({ p: [(i / rings) * len, r * n[1], r * n[2]], n, uv: [0, 0], color: [1, 1, 1] });
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const v = (ii: number, jj: number): number => ii * around + (jj % around);
      b.quad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  return b.build();
}

/** Flat grid in z = 0, size s, normal +Z. */
function plane(s = 1, k = 20): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i <= k; i++)
    for (let j = 0; j <= k; j++)
      b.vertex({
        p: [(i / k - 0.5) * s, (j / k - 0.5) * s, 0],
        n: [0, 0, 1],
        uv: [0, 0],
        color: [1, 1, 1],
      });
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      const v = (ii: number, jj: number): number => ii * (k + 1) + jj;
      b.quad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  return b.build();
}

describe('hairFlow', () => {
  test('fails: a seed that returns NaN is rejected with a fix', () => {
    expect(() => hairFlow(cylinder(), () => [Number.NaN, 0, 0])).toThrow(/seed returned \[NaN/);
  });

  test('a seed along the surface normal still yields unit tangents (no NaN)', () => {
    const m = cylinder();
    const f = hairFlow(m, (_p, n) => n);
    for (let i = 0; i < f.length / 3; i++) {
      const d: Vec3 = [f[i * 3] ?? 0, f[i * 3 + 1] ?? 0, f[i * 3 + 2] ?? 0];
      const n: Vec3 = [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 0];
      expect(dmath.norm(d)).toBeCloseTo(1, 4);
      expect(Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2])).toBeLessThan(1e-4);
    }
  });

  test('flow combed along a cylinder is divergence-free; a source is not', () => {
    const m = cylinder();
    // Noisy seed along +X: smoothing removes the noise, the comb has no sources.
    let s = 1;
    const noise = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647 - 0.5;
    };
    expect(
      flowDivergence(
        m,
        hairFlow(m, () => [1, 0, 0]),
      ),
    ).toBeLessThan(1e-6);
    const noisy = (o: { iterations: number; keep: number }): number => {
      s = 1;
      return flowDivergence(
        m,
        hairFlow(m, () => [1, noise() * 0.6, noise() * 0.6], o),
      );
    };
    expect(noisy({ iterations: 20, keep: 0.1 })).toBeLessThan(
      noisy({ iterations: 0, keep: 0.1 }) * 0.15,
    );
    const p = plane();
    const source = hairFlow(p, (q) => [q[0], q[1], 0], { iterations: 0 });
    // A radial source on a 1 m plane: div of a unit radial field is 1/r ≈ ≥ 2 per metre.
    expect(flowDivergence(p, source)).toBeGreaterThan(2);
  });

  test('smoothing pulls a lone wrong vertex into line with its neighbours', () => {
    const m = cylinder();
    const f = hairFlow(m, (q) => (q[0] > 0.48 && q[0] < 0.52 ? [-1, 0, 0] : [1, 0, 0]), {
      iterations: 12,
      keep: 0.2,
    });
    const mid = 12 * 24;
    expect(f[mid * 3] ?? 0).toBeGreaterThan(0);
  });

  test('flowAt interpolates and normalises', () => {
    const m = cylinder();
    const f = hairFlow(m, () => [1, 0, 0]);
    const d = flowAt(m, f, 5, 0.3, 0.3);
    expect(d[0]).toBeCloseTo(1, 3);
  });
});

describe('chainSeed', () => {
  test('fails: no chain and no gravity', () => {
    expect(() => chainSeed([{ points: [[0, 0, 0]] }])).toThrow(/no chain/);
  });

  test('nearest chain wins; gravity pulls down', () => {
    const seed = chainSeed(
      [
        {
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
        {
          points: [
            [0, 1, 0],
            [0, 2, 0],
          ],
        },
      ],
      { gravity: 0.5 },
    );
    const a = seed([0.5, 0.05, 0.1], [0, 0, 1]);
    expect(a[0]).toBeGreaterThan(0.9);
    expect(a[2]).toBeCloseTo(-0.5, 3);
    const b = seed([0.05, 1.5, 0], [1, 0, 0]);
    expect(b[1]).toBeGreaterThan(0.9);
  });

  test('tangentOf falls back deterministically when v ∥ n', () => {
    const t = tangentOf([0, 0, 2], [0, 0, 1]);
    expect(dmath.norm(t)).toBeCloseTo(1, 6);
    expect(t[2]).toBeCloseTo(0, 6);
  });
});
