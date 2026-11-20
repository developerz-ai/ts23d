import { expect, it } from 'bun:test';
import { dmath, MeshBuilder } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { mikkTangents, tangentsOf } from './tangents.ts';
import { plate } from './texture-fixtures.ts';

it('gives unit tangents perpendicular to the normal, with w = ±1', () => {
  const m = box({ size: [2, 1, 3], color: [1, 1, 1], strip: 'brick' });
  const t = tangentsOf(m);
  for (let v = 0; v < m.positions.length / 3; v++) {
    const [x = 0, y = 0, z = 0, w = 0] = t.subarray(v * 4, v * 4 + 4);
    expect(dmath.hypot(x, y, z)).toBeCloseTo(1, 5);
    const d =
      x * (m.normals[v * 3] ?? 0) +
      y * (m.normals[v * 3 + 1] ?? 0) +
      z * (m.normals[v * 3 + 2] ?? 0);
    expect(d).toBeCloseTo(0, 5);
    expect(Math.abs(w)).toBe(1);
  }
});

it('follows +U, and its bitangent points to decreasing glTF v (box front: v grows with world up)', () => {
  const m = box({
    size: [1, 1, 1],
    color: [1, 1, 1],
    omit: ['back', 'left', 'right', 'top', 'bottom'],
  });
  const [x, y, z, w] = tangentsOf(m).subarray(0, 4);
  expect([x, y, z]).toEqual([0, 1, 0]);
  // cross(N = +X, T = +Y) = +Z (world up = increasing v), so w flips it to point down.
  expect(w).toBe(-1);
});

it('falls back to any perpendicular when UVs are degenerate', () => {
  const b = new MeshBuilder();
  const at = (p: [number, number, number]): number =>
    b.vertex({ p, n: [0, 0, 1], uv: [0.5, 0.5], color: [1, 1, 1] });
  b.tri(at([0, 0, 0]), at([1, 0, 0]), at([0, 1, 0]));
  const t = tangentsOf(b.build());
  expect(dmath.hypot(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0)).toBeCloseTo(1, 5);
  expect(t[2]).toBeCloseTo(0, 6);
});

it('mikkTangents: a mirrored UV island flips w, not the tangent convention', () => {
  // Plate facing −Y: u runs along +X, glTF v runs DOWN the plate (−Z), so B = +Z needs w = +1.
  const m = plate(2);
  const t = mikkTangents(m);
  for (let v = 0; v < m.positions.length / 3; v++)
    expect([...t.subarray(v * 4, v * 4 + 4)]).toEqual([1, 0, 0, 1]);
  // cross(N = −Y, T = +X) = +Z: the bitangent points to decreasing v (image up).
  const mirrored = { ...m, uvs: m.uvs.map((x, i) => (i % 2 === 0 ? 1 - x : x)) };
  const f = mikkTangents(mirrored);
  expect([...f.subarray(0, 4)]).toEqual([-1, 0, 0, -1]);
});

it('mikkTangents: weights by corner angle, so a sliver cannot swing a smooth vertex', () => {
  // Two triangles share vertex 0 (normal +Z): a right-angle corner whose u runs along +X and a
  // thin 5.7° corner whose u runs along +Y. Angle weighting keeps the tangent near +X; summing
  // raw dP/du (tangentsOf) is pulled far toward the sliver's long edge.
  const b = new MeshBuilder();
  const at = (p: [number, number, number], uv: [number, number]): number =>
    b.vertex({ p, n: [0, 0, 1], uv, color: [1, 1, 1] });
  const o = at([0, 0, 0], [0, 1]);
  b.tri(o, at([1, 0, 0], [1, 1]), at([0, 1, 0], [0, 0]));
  b.tri(o, at([0, -10, 0], [-10, 1]), at([1, -10, 0], [-10, 0]));
  const m = b.build();
  const mikk = mikkTangents(m);
  const plain = tangentsOf(m);
  expect(dmath.hypot(mikk[0] ?? 0, mikk[1] ?? 0, mikk[2] ?? 0)).toBeCloseTo(1, 6);
  expect(mikk[0] ?? 0).toBeGreaterThan(0.99);
  expect(plain[0] ?? 0).toBeLessThan(mikk[0] ?? 0);
});

it('mikkTangents: falls back to a unit perpendicular when UVs are degenerate', () => {
  const t = mikkTangents(plate(1, [1, 1, 1], 0));
  expect(dmath.hypot(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0)).toBeCloseTo(1, 6);
  expect(t[1]).toBeCloseTo(0, 6);
  expect(Math.abs(t[3] ?? 0)).toBe(1);
});
