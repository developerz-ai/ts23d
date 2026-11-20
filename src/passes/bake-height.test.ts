import { describe, expect, test } from 'bun:test';
import { dmath, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { bakeHeight, fieldHit } from './bake-height.ts';
import { bakeNormals } from './bake-normals.ts';

/** A plane z = 0 with a sphere bump: centre (0.5, 0.5, −0.15), radius 0.2 → 5 cm proud. */
const C: Vec3 = [0.5, 0.5, -0.15];
const R = 0.2;
const field = (p: Vec3): number =>
  Math.min(p[2], dmath.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) - R);

/** The flat low: two triangles, UV = XY. */
function flat(): Mesh {
  const b = new MeshBuilder();
  const v = (x: number, y: number): number =>
    b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [x, y], color: [0.5, 0.5, 0.5] });
  b.quad(v(0, 0), v(1, 0), v(1, 1), v(0, 1));
  return b.build();
}

const S = 64;
const decode = (n: Uint8Array, x: number, y: number): Vec3 => {
  const t = (y * S + x) * 4;
  const v = [0, 1, 2].map((k) => ((n[t + k] ?? 0) / 255) * 2 - 1);
  const l = dmath.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l];
};
const deg = (a: Vec3, b: Vec3): number =>
  (dmath.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;

describe('fieldHit', () => {
  test('finds no crossing outside the cage, the exact one inside', () => {
    expect(fieldHit(field, [0.5, 0.5, 0], [0, 0, 1], 0.01)).toBeNull();
    expect(fieldHit(field, [0.5, 0.5, 0], [0, 0, 1], 0.1) ?? 0).toBeCloseTo(0.05, 4);
    expect(fieldHit(field, [0.05, 0.05, 0.02], [0, 0, 1], 0.1) ?? 0).toBeCloseTo(-0.02, 4);
  });
});

describe('bakeHeight', () => {
  test('rejects a bad size or cell', () => {
    expect(() => bakeHeight(field, flat(), { size: 100, cell: 0.001 })).toThrow('T3D_BAKE_INVALID');
    expect(() => bakeHeight(field, flat(), { size: 64, cell: 0 })).toThrow('T3D_BAKE_INVALID');
  });

  test('a cage too tight misses the bump', () => {
    const r = bakeHeight(field, flat(), { size: S, cell: 0.002, cage: 0.01 });
    expect(r.hitRate).toBeLessThan(0.99);
    const mid = 32 * S + 32;
    expect(r.hit[mid]).toBe(0);
    expect(r.height[mid]).toBe(0);
  });

  test('recovers the sphere bump: height and normal within 2° of analytic', () => {
    const r = bakeHeight(field, flat(), { size: S, cell: 0.002, cage: 0.1 });
    expect(r.hitRate).toBe(1);
    let worst = 0;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const px = (x + 0.5) / S;
        const py = (y + 0.5) / S;
        const d = dmath.hypot(px - C[0], py - C[1]);
        // The bump meets the plane at d = √(R² − C.z²) ≈ 0.132: skip the crease ring.
        if (d > 0.12 && d < 0.145) continue;
        const z = d < 0.132 ? C[2] + Math.sqrt(R * R - d * d) : 0;
        expect(r.height[y * S + x] ?? 0).toBeCloseTo(z, 4);
        const n: Vec3 = d < 0.132 ? [(px - C[0]) / R, (py - C[1]) / R, (z - C[2]) / R] : [0, 0, 1];
        // Tangent frame of the flat quad: T = +x, B = −y (green up = decreasing v), N = +z.
        const m = decode(r.normal, x, y);
        worst = Math.max(worst, deg([m[0], -m[1], m[2]], n));
      }
    expect(worst).toBeLessThan(2);
  });

  test('crevices read occluded and concave, open plane does not', () => {
    const r = bakeHeight(field, flat(), { size: S, cell: 0.002, cage: 0.1, aoReach: 0.03 });
    const at = (x: number, y: number): number => y * S + x;
    expect(r.ao[at(2, 2)]).toBeCloseTo(1, 3);
    // Just outside the crease ring (d ≈ 0.14): the bump's wall shadows the plane.
    const ring = at(Math.floor((0.5 + 0.14) * S), 32);
    expect(r.ao[ring] ?? 1).toBeLessThan(0.97);
    // On the bump top: convex, H ≈ 1/R.
    expect(r.curvature[at(32, 32)] ?? 0).toBeCloseTo(1 / R, 0);
  });

  test('is deterministic', () => {
    const a = bakeHeight(field, flat(), { size: 32, cell: 0.002, cage: 0.1 });
    const b = bakeHeight(field, flat(), { size: 32, cell: 0.002, cage: 0.1 });
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
    expect(Buffer.from(a.height.buffer).equals(Buffer.from(b.height.buffer))).toBe(true);
  });
});

describe('bakeNormals from a field', () => {
  test('the bump top tilts like the sphere, the plane stays flat', () => {
    const r = bakeNormals(field, flat(), { size: S, cage: 0.1 });
    expect(r.hitRate).toBe(1);
    const x = Math.floor((0.5 + 0.08) * S);
    const m = decode(r.normal, x, 32);
    const px = (x + 0.5) / S;
    const py = 32.5 / S;
    const z = C[2] + Math.sqrt(R * R - dmath.pow(px - C[0], 2) - dmath.pow(py - C[1], 2));
    expect(
      deg([m[0], -m[1], m[2]], [(px - C[0]) / R, (py - C[1]) / R, (z - C[2]) / R]),
    ).toBeLessThan(2);
    expect(deg(decode(r.normal, 2, 2), [0, 0, 1])).toBeLessThan(1);
  });
});
