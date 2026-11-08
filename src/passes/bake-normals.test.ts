import { describe, expect, test } from 'bun:test';
import { type Mesh, MeshBuilder } from '../core/index.ts';
import { bakeNormals } from './bake-normals.ts';

const H = 0.1;
const SIGMA = 0.15;
const height = (x: number, y: number): number =>
  H * Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) / (SIGMA * SIGMA));

/** A dense grid over the unit square carrying a Gaussian bump; analytic normals; red on the bump. */
function bumpy(n: number): Mesh {
  const b = new MeshBuilder();
  const id: number[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const y = j / n;
      const h = height(x, y);
      const k = (-2 / (SIGMA * SIGMA)) * h;
      const g = [k * (x - 0.5), k * (y - 0.5)];
      const l = Math.hypot(g[0] ?? 0, g[1] ?? 0, 1);
      id.push(
        b.vertex({
          p: [x, y, h],
          n: [-(g[0] ?? 0) / l, -(g[1] ?? 0) / l, 1 / l],
          uv: [x, y],
          color: h > 0.01 ? [1, 0, 0] : [0, 0, 1],
        }),
      );
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = (a: number, c: number): number => id[c * (n + 1) + a] ?? 0;
      b.quad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  return b.build();
}

/** The flat low: two triangles, UV = XY. */
function flat(): Mesh {
  const b = new MeshBuilder();
  const v = (x: number, y: number): number =>
    b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [x, y], color: [0.5, 0.5, 0.5] });
  b.quad(v(0, 0), v(1, 0), v(1, 1), v(0, 1));
  return b.build();
}

describe('bakeNormals', () => {
  test('rejects a bad size', () => {
    expect(() => bakeNormals(bumpy(8), flat(), { size: 100 })).toThrow('T3D_BAKE_INVALID');
  });
  test('recovers a known bump in tangent space', () => {
    const S = 64;
    const r = bakeNormals(bumpy(96), flat(), { size: S, cage: 0.2 });
    expect(r.hitRate).toBe(1);
    const at = (x: number, y: number): number[] => {
      const t = (Math.floor(y * S) * S + Math.floor(x * S)) * 4;
      return [0, 1, 2].map((k) => ((r.normal[t + k] ?? 0) / 255) * 2 - 1);
    };
    // Far from the bump: straight up.
    const corner = at(0.05, 0.05);
    expect(corner[2] ?? 0).toBeGreaterThan(0.99);
    // On the +X flank the surface leans toward +X = +U (red up); on the +Y flank toward +V, which
    // is image DOWN — glTF normal maps are green-up, so green goes below 0.5 there.
    for (const [x, y, axis, sign] of [
      [0.6, 0.5, 0, 1],
      [0.5, 0.62, 1, -1],
    ] as const) {
      const n = at(x, y);
      const cx = Math.floor(x * S) / S + 0.5 / S;
      const cy = Math.floor(y * S) / S + 0.5 / S;
      const k = (-2 / (SIGMA * SIGMA)) * height(cx, cy);
      const g = [k * (cx - 0.5), k * (cy - 0.5)];
      const l = Math.hypot(g[0] ?? 0, g[1] ?? 0, 1);
      const want = -(g[axis] ?? 0) / l;
      expect(want).toBeGreaterThan(0.3);
      expect(Math.abs((n[axis] ?? 0) - sign * want)).toBeLessThan(0.04);
    }
    // Albedo: red where the bump is.
    const t = (Math.floor(0.5 * S) * S + Math.floor(0.5 * S)) * 4;
    expect(r.albedo[t] ?? 0).toBeGreaterThan(200);
    expect(r.albedo[t + 2] ?? 0).toBeLessThan(50);
  });
  test('deterministic', () => {
    const a = bakeNormals(bumpy(32), flat(), { size: 32 });
    const b = bakeNormals(bumpy(32), flat(), { size: 32 });
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
  });
});
