// Shared profile helpers for the parts kit: closed lathe loops (counter-clockwise in (r, z), so the
// solid faces out), the house colours, and placing a mesh along an arbitrary axis.

import {
  type Affine,
  applyAffine,
  cross,
  hex,
  type Mesh,
  NATURAL,
  normalize,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

/** Tint for material strips that carry their own measured colour. */
export const NAT: Vec3 = NATURAL;
export const STEEL = hex('#8a8d91');
export const DARK_STEEL = hex('#3c3e42');
export const ZINC = hex('#b9bcbf');
export const BRASS = hex('#c9a45a');
export const PAINT_RED = hex('#9a2b22');
export const PAINT_GREEN = hex('#3f5a3a');
export const DOOR_GREEN = hex('#2f4c3c');
export const PAINT_YELLOW = hex('#d9a520');
export const RUBBER = hex('#2a2a2a');
export const WOOD = hex('#8a6440');
export const WARM_LIGHT = hex('#ffe2a8');

/** A flat ring (washer, rim band) from ri to ro, z0 → z1, chamfer c on the outer edges. */
export function ringProfile(ri: number, ro: number, z0: number, z1: number, c = 0): Vec2[] {
  return c > 0
    ? [
        [ri, z0],
        [ro - c, z0],
        [ro, z0 + c],
        [ro, z1 - c],
        [ro - c, z1],
        [ri, z1],
        [ri, z0],
      ]
    : [
        [ri, z0],
        [ro, z0],
        [ro, z1],
        [ri, z1],
        [ri, z0],
      ];
}

/** A round tube bent into a ring: major radius R, tube radius r, n points round the section. */
export function torusProfile(R: number, r: number, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i): Vec2 => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [R + r * Math.cos(t), r * Math.sin(t)];
  });
}

/** Rotate a mesh authored along +Z onto `dir`, then move it to `at`. */
export function alongAxis(m: Mesh, dir: Vec3, at: Vec3): Mesh {
  const w = normalize(dir);
  const ref: Vec3 = Math.abs(w[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = normalize(cross(ref, w));
  const v = cross(w, u);
  const a: Affine = { m: [u[0], v[0], w[0], u[1], v[1], w[1], u[2], v[2], w[2]], t: at };
  return applyAffine(m, a);
}
