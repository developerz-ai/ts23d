import { expect, it } from 'bun:test';
import { MeshBuilder } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { tangentsOf } from './tangents.ts';

it('gives unit tangents perpendicular to the normal, with w = ±1', () => {
  const m = box({ size: [2, 1, 3], color: [1, 1, 1], strip: 'brick' });
  const t = tangentsOf(m);
  for (let v = 0; v < m.positions.length / 3; v++) {
    const [x = 0, y = 0, z = 0, w = 0] = t.subarray(v * 4, v * 4 + 4);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
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
  expect(Math.hypot(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0)).toBeCloseTo(1, 5);
  expect(t[2]).toBeCloseTo(0, 6);
});
