import { describe, expect, test } from 'bun:test';
import { MeshBuilder } from './mesh.ts';
import { applyAffine, frame, place } from './transform.ts';

// One triangle in the XY plane, counter-clockwise seen from +Z, normal +Z.
const tri = () => {
  const b = new MeshBuilder();
  const n: [number, number, number] = [0, 0, 1];
  const a = b.vertex({ p: [0, 0, 0], n, uv: [0, 0], color: [1, 1, 1] });
  const c = b.vertex({ p: [1, 0, 0], n, uv: [0, 0], color: [1, 1, 1] });
  const d = b.vertex({ p: [0, 1, 0], n, uv: [0, 0], color: [1, 1, 1] });
  b.tri(a, c, d);
  return b.build();
};

/** Winding normal · stored normal: > 0 when the triangle faces where its normal points. */
const facing = (m: ReturnType<typeof tri>): number => {
  const at = (v: number, q: number): number => m.positions[(m.indices[v] ?? 0) * 3 + q] ?? 0;
  const u = [0, 1, 2].map((q) => at(1, q) - at(0, q));
  const v = [0, 1, 2].map((q) => at(2, q) - at(0, q));
  const c = (x: number, y: number): number => (u[x] ?? 0) * (v[y] ?? 0) - (u[y] ?? 0) * (v[x] ?? 0);
  const g = [c(1, 2), c(2, 0), c(0, 1)];
  return g.reduce((s, gi, q) => s + gi * (m.normals[q] ?? 0), 0);
};

describe('applyAffine winding', () => {
  test('a mirror keeps triangles facing their normals (was inside-out)', () => {
    const mirrored = applyAffine(tri(), frame([1, 0, 0], [0, -1, 0], [0, 0, 1]));
    expect(facing(mirrored)).toBeGreaterThan(0);
  });
  test('a rotation leaves the index order untouched', () => {
    const t = tri();
    const r = place(t, { at: [1, 2, 3], yaw: 1.2 });
    expect([...r.indices]).toEqual([...t.indices]);
    expect(facing(r)).toBeGreaterThan(0);
  });
});

describe('applyAffine normals', () => {
  // One triangle on the plane x + z = 1: its true normal is (1, 0, 1)/√2.
  const slanted = () => {
    const b = new MeshBuilder();
    const n: [number, number, number] = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const a = b.vertex({ p: [1, 0, 0], n, uv: [0, 0], color: [1, 1, 1] });
    const c = b.vertex({ p: [0, 0, 1], n, uv: [0, 0], color: [1, 1, 1] });
    const d = b.vertex({ p: [1, 1, 0], n, uv: [0, 0], color: [1, 1, 1] });
    b.tri(a, d, c);
    return b.build();
  };
  /** Angle in degrees between the stored normal of vertex 0 and the true face normal. */
  const errorDeg = (m: ReturnType<typeof slanted>): number => {
    const p = (k: number, q: number): number => m.positions[(m.indices[k] ?? 0) * 3 + q] ?? 0;
    const u = [0, 1, 2].map((q) => p(1, q) - p(0, q));
    const v = [0, 1, 2].map((q) => p(2, q) - p(0, q));
    const g = (x: number, y: number): number =>
      (u[x] ?? 0) * (v[y] ?? 0) - (u[y] ?? 0) * (v[x] ?? 0);
    const f = [g(1, 2), g(2, 0), g(0, 1)];
    const l = Math.sqrt(f.reduce((s, x) => s + x * x, 0));
    const cos = f.reduce((s, x, q) => s + (x / l) * (m.normals[q] ?? 0), 0);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  test('non-uniform scale keeps normals perpendicular to the surface (was 62° off)', () => {
    expect(errorDeg(place(slanted(), { scale: [1, 1, 4] }))).toBeLessThan(0.05);
  });
  test('non-uniform scale with rotation and a mirror stays exact and outward', () => {
    const m = place(slanted(), { scale: [2, -0.5, 3], yaw: 0.7, roll: 0.3 });
    expect(errorDeg(m)).toBeLessThan(0.05);
  });
  test('a shear frame keeps normals perpendicular', () => {
    expect(
      errorDeg(applyAffine(slanted(), frame([1, 0, 0], [0.6, 1, 0], [0.3, 0, 2]))),
    ).toBeLessThan(0.05);
  });
  test('rotation + uniform scale stays exact', () => {
    const r = place(slanted(), { scale: 2.5, yaw: 1.1, pitch: 0.2 });
    expect(errorDeg(r)).toBeLessThan(0.05);
  });
});
