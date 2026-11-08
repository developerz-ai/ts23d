// Test fixtures for /physics (not exported): closed boxes and cylinders on a chosen strip row,
// built with the core MeshBuilder so the module's tests need no sideways import of /primitives.

import type { Mesh, Vec3 } from '../core/index.ts';
import { MeshBuilder } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

const vOf = (strip: string): number => {
  const r = stripRect(strip as StripId);
  return (r.v0 + r.v1) / 2;
};

/** Closed, outward-wound box of `size` centred at `at` (hard edges: 24 vertices). */
export function boxMesh(size: Vec3, at: Vec3 = [0, 0, 0], strip = 'plain'): Mesh {
  const b = new MeshBuilder();
  const v = vOf(strip);
  const h: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const corner = (sx: number, sy: number, sz: number): Vec3 => [
    at[0] + sx * h[0],
    at[1] + sy * h[1],
    at[2] + sz * h[2],
  ];
  // Each face: normal axis, sign, and two tangent axes ordered so (t1 × t2) = outward normal.
  const faces: readonly (readonly [0 | 1 | 2, 1 | -1])[] = [
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [2, 1],
    [2, -1],
  ];
  for (const [axis, sign] of faces) {
    const t1 = ((axis + 1) % 3) as 0 | 1 | 2;
    const t2 = ((axis + 2) % 3) as 0 | 1 | 2;
    const n: Vec3 = [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0];
    const pt = (a: number, c: number): Vec3 => {
      const s = [0, 0, 0];
      s[axis] = sign;
      s[t1] = a;
      s[t2] = c;
      return corner(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0);
    };
    const ids = [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)].map((p) =>
      b.vertex({ p, n, uv: [0.5, v], color: [1, 1, 1] }),
    );
    const [a, c, d, e] = [ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0, ids[3] ?? 0];
    if (sign > 0) b.quad(a, c, d, e);
    else b.quad(a, e, d, c);
  }
  return b.build();
}

/** Closed cylinder along Z: `segments` sides, flat caps, centred at the origin. */
export function cylinderMesh(radius: number, length: number, segments = 32, strip = 'plain'): Mesh {
  const b = new MeshBuilder();
  const v = vOf(strip);
  const ring = (z: number): number[] =>
    Array.from({ length: segments }, (_, i) => {
      const a = (2 * Math.PI * i) / segments;
      const p: Vec3 = [Math.cos(a) * radius, Math.sin(a) * radius, z];
      return b.vertex({ p, n: [Math.cos(a), Math.sin(a), 0], uv: [0.5, v], color: [1, 1, 1] });
    });
  const lo = ring(-length / 2);
  const hi = ring(length / 2);
  const cLo = b.vertex({ p: [0, 0, -length / 2], n: [0, 0, -1], uv: [0.5, v], color: [1, 1, 1] });
  const cHi = b.vertex({ p: [0, 0, length / 2], n: [0, 0, 1], uv: [0.5, v], color: [1, 1, 1] });
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    b.quad(lo[i] ?? 0, lo[j] ?? 0, hi[j] ?? 0, hi[i] ?? 0);
    b.tri(cHi, hi[i] ?? 0, hi[j] ?? 0);
    b.tri(cLo, lo[j] ?? 0, lo[i] ?? 0);
  }
  return b.build();
}
