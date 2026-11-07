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
