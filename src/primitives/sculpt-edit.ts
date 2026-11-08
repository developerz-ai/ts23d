// One sculpt edit → its distance field (rotated, optionally mirrored across Y) and its bounds.
// Rotation is precomputed into a 3×3 matrix; evaluation is scalar maths, no allocation.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import { type Field, shapes } from './sdf-ops.ts';

export type SculptShape = 'sphere' | 'ellipsoid' | 'capsule' | 'roundBox' | 'cone' | 'torus';

/** An edit: one shape, a ready-made field, or a group folded on its own first (local trims). */
export type SculptEdit = SculptShapeEdit | SculptGroup | SculptFieldEdit;

/**
 * A ready-made 1-Lipschitz field inside `bounds` as one edit, e.g. a visual hull from drawings:
 * `{ ...visualHull({ front, side, scale }), blend: 0.01 }` (sculpt-field.ts clamps it to bounds).
 */
export interface SculptFieldEdit {
  readonly field: Field;
  readonly bounds: readonly [Vec3, Vec3];
  readonly op?: 'add' | 'subtract' | 'intersect' | 'paint';
  readonly blend?: number;
  readonly color?: Vec3;
  readonly mirror?: boolean;
}

/**
 * Edits folded on their own (from nothing), then applied to the sculpt as ONE edit with this
 * op/blend/colour: subtract or intersect inside the group trims only the group's shapes (a
 * half-sphere eyelid, a hair cap stopped at the hairline) and leaves earlier edits alone.
 */
export interface SculptGroup {
  readonly group: readonly SculptEdit[];
  readonly op?: 'add' | 'subtract' | 'intersect';
  readonly blend?: number;
  /** Default colour of the group's own edits (and its colour when it carves). */
  readonly color?: Vec3;
  /** Default mirror for the group's edits. */
  readonly mirror?: boolean;
}

export interface SculptShapeEdit {
  readonly shape: SculptShape;
  /** Centre (sphere, ellipsoid, roundBox, torus), base centre (cone) or start (capsule). */
  readonly at: Vec3;
  /**
   * sphere: radius · ellipsoid: [rx, ry, rz] · roundBox: full [x, y, z] · cone: [base radius,
   * top radius, height] along local +Z · torus: [ring radius, tube radius] in local XY ·
   * capsule: radius (segment `at` → `to`).
   */
  readonly size: number | readonly [number, number] | Vec3;
  /** Capsule end point. */
  readonly to?: Vec3;
  /** Degrees about X, then Y, then Z (world axes), around `at`. */
  readonly rotate?: Vec3;
  /** roundBox edge radius, metres. */
  readonly round?: number;
  readonly op?: 'add' | 'subtract' | 'intersect' | 'paint';
  /** Smooth-blend radius in metres (0 = hard edge). For paint: the colour falloff width. */
  readonly blend?: number;
  readonly color?: Vec3;
  /** Override the sculpt's `mirror` for this edit (e.g. one scar). */
  readonly mirror?: boolean;
}

const dims = (e: SculptShapeEdit): Vec3 => {
  if (typeof e.size === 'number') return [e.size, e.size, e.size];
  const [a, b, c] = e.size;
  return [a, b, c ?? b];
};

export function sculptShape(e: SculptShapeEdit, i: number, mirrorAll: boolean): Field {
  const [a, b, c] = dims(e);
  const where = `sculpt edit ${i} (${e.shape})`;
  if (![a, b, c].every((x) => Number.isFinite(x) && x > 0))
    invalid(`${where}: size has a value ≤ 0`, 'give every size component in metres, > 0');
  if ((e.blend ?? 0) < 0 || !Number.isFinite(e.blend ?? 0))
    invalid(`${where}: blend is ${e.blend}`, 'use a blend radius ≥ 0 m (0.01 = 1 cm fillet)');
  if (e.shape === 'capsule' && !e.to)
    invalid(`${where}: capsule needs \`to\``, 'add to: [x, y, z], the far end');
  const [rx, ry, rz] = (e.rotate ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx ?? 0),
    Math.sin(rx ?? 0),
    Math.cos(ry ?? 0),
    Math.sin(ry ?? 0),
    Math.cos(rz ?? 0),
    Math.sin(rz ?? 0),
  ];
  // R = Rz · Ry · Rx; local = Rᵀ (p − at).
  const m = [
    cz * cy,
    cz * sy * sx - sz * cx,
    cz * sy * cx + sz * sx,
    sz * cy,
    sz * sy * sx + cz * cx,
    sz * sy * cx - cz * sx,
    -sy,
    cy * sx,
    cy * cx,
  ];
  const [m0 = 1, m1 = 0, m2 = 0, m3 = 0, m4 = 1, m5 = 0, m6 = 0, m7 = 0, m8 = 1] = m;
  const [ox, oy, oz] = e.at;
  const to = e.to ?? e.at;
  const [dx, dy, dz] = [to[0] - ox, to[1] - oy, to[2] - oz];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const round = Math.min(e.round ?? 0, a / 2, b / 2, c / 2);
  // The shape kernel in local coordinates, chosen once (no per-call switch).
  const kernel: (x: number, y: number, z: number) => number =
    e.shape === 'sphere'
      ? (x, y, z) => shapes.sphere(x, y, z, a)
      : e.shape === 'ellipsoid'
        ? (x, y, z) => shapes.ellipsoid(x, y, z, a, b, c)
        : e.shape === 'roundBox'
          ? (x, y, z) => shapes.roundBox(x, y, z, a / 2, b / 2, c / 2, round)
          : e.shape === 'cone'
            ? (x, y, z) => shapes.cone(x, y, z, a, b, c)
            : (x, y, z) => shapes.torus(x, y, z, a, b);
  const rotated = e.rotate?.some((d) => d !== 0) ?? false;
  const one =
    e.shape === 'capsule'
      ? (px: number, py: number, pz: number): number => {
          // Capsule in world space along at → to.
          const wx = px - ox;
          const wy = py - oy;
          const wz = pz - oz;
          const t =
            len > 0 ? Math.min(1, Math.max(0, (wx * dx + wy * dy + wz * dz) / (len * len))) : 0;
          return Math.sqrt((wx - dx * t) ** 2 + (wy - dy * t) ** 2 + (wz - dz * t) ** 2) - a;
        }
      : rotated
        ? (px: number, py: number, pz: number): number => {
            const wx = px - ox;
            const wy = py - oy;
            const wz = pz - oz;
            return kernel(
              m0 * wx + m3 * wy + m6 * wz,
              m1 * wx + m4 * wy + m7 * wz,
              m2 * wx + m5 * wy + m8 * wz,
            );
          }
        : // Identity rotation: 1·x + 0·y + 0·z is x, so skipping the product changes no bits.
          (px: number, py: number, pz: number): number => kernel(px - ox, py - oy, pz - oz);
  if (!(e.mirror ?? mirrorAll)) return (p) => one(p[0], p[1], p[2]);
  // Mirrored: min of the shape and its copy across y = 0. Evaluate the nearer copy first; the
  // other only if its bound could undercut it (min is order-free, so this is exact).
  const { c: sc, r: sr, scale, inside } = shapeSphere(e);
  const bound = (dist: number): number => {
    const out = dist - sr;
    return out > 0 ? scale * out : inside ? out : Number.NEGATIVE_INFINITY;
  };
  return (p) => {
    const dx0 = p[0] - sc[0];
    const dz0 = p[2] - sc[2];
    const near = Math.sqrt(dx0 * dx0 + (p[1] - sc[1]) ** 2 + dz0 * dz0);
    const far = Math.sqrt(dx0 * dx0 + (p[1] + sc[1]) ** 2 + dz0 * dz0);
    // Scalar branches (no [first, second, bound] tuple per evaluation).
    const nearer = near <= far;
    const first = nearer ? p[1] : -p[1];
    const v = one(p[0], first, p[2]);
    return bound(nearer ? far : near) >= v ? v : Math.min(v, one(p[0], -first, p[2]));
  };
}

/**
 * A sphere the shape lies in, and how its field compares with the distance to it: every shape's
 * value v satisfies v ≥ scale · (|p − centre| − radius) outside the sphere (scale 1 = exact SDFs;
 * the ellipsoid approximation only guarantees (r_min / r_max)², and nothing inside its sphere).
 */
export function shapeSphere(e: SculptShapeEdit): {
  c: Vec3;
  r: number;
  scale: number;
  inside: boolean;
} {
  const [a, b, c] = dims(e);
  const to = e.to ?? e.at;
  const centre: Vec3 =
    e.shape === 'capsule'
      ? [(e.at[0] + to[0]) / 2, (e.at[1] + to[1]) / 2, (e.at[2] + to[2]) / 2]
      : e.at;
  const r =
    e.shape === 'sphere'
      ? a
      : e.shape === 'ellipsoid'
        ? Math.max(a, b, c)
        : e.shape === 'roundBox'
          ? Math.hypot(a, b, c) / 2
          : e.shape === 'cone'
            ? c + Math.max(a, b) // loose but unchanged: it also sets the grid bounds
            : e.shape === 'torus'
              ? a + b
              : a + Math.hypot(to[0] - e.at[0], to[1] - e.at[1], to[2] - e.at[2]) / 2;
  const ell = e.shape === 'ellipsoid';
  const lo = Math.min(a, b, c);
  return { c: centre, r, scale: ell ? (lo / r) ** 2 : 1, inside: !ell };
}

/** Conservative world bounds of an add edit (bounding sphere), grown by its blend radius. */
export function editBounds(e: SculptEdit, mirrorAll: boolean): [Vec3, Vec3] {
  if ('group' in e) return groupBounds(e, mirrorAll);
  let k = e.blend ?? 0;
  let [b0, b1]: readonly [Vec3, Vec3] = 'field' in e ? e.bounds : [e.at, e.at];
  // A field's surface can lie ON its bounds (a visual hull's flat faces): pad so the meshing
  // grid's border never coincides with it.
  if ('field' in e) k += 0.03 * Math.max(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]);
  if (!('field' in e)) {
    const { c, r } = shapeSphere(e);
    b0 = [c[0] - r, c[1] - r, c[2] - r];
    b1 = [c[0] + r, c[1] + r, c[2] + r];
  }
  const lo: [number, number, number] = [b0[0] - k, b0[1] - k, b0[2] - k];
  const hi: [number, number, number] = [b1[0] + k, b1[1] + k, b1[2] + k];
  if (e.mirror ?? mirrorAll) {
    const [l, h] = [lo[1], hi[1]];
    lo[1] = Math.min(l, -h);
    hi[1] = Math.max(h, -l);
  }
  return [lo, hi];
}

function groupBounds(g: SculptGroup, mirrorAll: boolean): [Vec3, Vec3] {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const k = g.blend ?? 0;
  for (const e of g.group) {
    if ((e.op ?? 'add') !== 'add') continue;
    const [a, b] = editBounds(e, g.mirror ?? mirrorAll);
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i] ?? 0, (a[i] ?? 0) - k);
      hi[i] = Math.max(hi[i] ?? 0, (b[i] ?? 0) + k);
    }
  }
  return [lo, hi];
}
