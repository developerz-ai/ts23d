// The bust's anatomy, cut and plinth: ribcage, pectorals, deltoids, the trapezius sloping from
// behind the ear to the shoulder (it is what joins a head to a body), clavicles and the sternal
// notch — all scaled by `bust.mass` (0 bony … 1 brute) — trimmed by the classic collectible-bust
// cut (a U under the chest rising to the arms) and set on a turned socle + disc plinth.
// Head units, mirrored across Y; `torsoForms(f, g)` grows every form by g for clothing shells.

import type { Vec3 } from '../core/index.ts';
import { type Field, type SculptEdit, sd } from '../primitives/index.ts';
import { alongX } from './head-geom.ts';
import type { HeadLayout } from './head-layout.ts';
import type { HeadParams } from './head-params.ts';

/** Where the bust sits relative to the head: centre x, shoulder half-span, base, neck root… */
export interface BustFrame {
  readonly cx: number;
  readonly s: number;
  /** Reference z the torso is laid out from (the floor lifted by the build's hunch). */
  readonly b: number;
  /** The asset's floor: bottom of the plinth. */
  readonly floor: number;
  /** Neck root (top of the sternum), z. */
  readonly nz: number;
  readonly m: number;
  /** Neck radius. */
  readonly n: number;
  /** Where the trapezius meets the neck, z (high behind the ear on a brute). */
  readonly trapZ: number;
  /** Top of the plinth = bottom of the chest cut, z. */
  readonly cutZ: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const dist = (a: Vec3, b: Vec3): number => Math.hypot(...sub(a, b));

/** Plinth height, head units. */
const PLINTH = 0.17;

export function frameOf(p: HeadParams, l: HeadLayout): BustFrame {
  const m = p.bust.mass ?? 0.5;
  // A brute's shoulders ride up round its ears (the hunch): lift the torso, lengthen the socle.
  const b = l.base + 0.06 + 0.1 * m;
  const nz = b + 0.6;
  return {
    cx: l.cranium.at[0] + p.jaw.muzzle * 0.3,
    s: p.bust.shoulders,
    b,
    floor: l.base,
    nz,
    m,
    n: p.neck.radius,
    trapZ: nz + 0.12 + (l.hinge[1] - 0.2 - nz - 0.12) * m,
    cutZ: l.base + PLINTH + 0.06 + 0.1 * m,
  };
}

/** Anatomy volumes (plain adds), every one grown by `g`. */
export function torsoForms(f: BustFrame, g = 0): SculptEdit[] {
  const { cx, s, b, m, n } = f;
  const grow = (r: Vec3): Vec3 => [r[0] + g, r[1] + g, r[2] + g];
  const top: Vec3 = [cx - 0.12, n * 0.5, f.trapZ];
  const acromion: Vec3 = [cx - 0.05, s * 0.78, b + 0.62 + 0.05 * m];
  return [
    // Ribcage: the barrel everything hangs on.
    {
      shape: 'ellipsoid',
      at: [cx - 0.05, 0, b + 0.36],
      size: grow([0.25 + 0.07 * m, s * 0.66, 0.38]),
    },
    // Pectorals: two slabs angled up to the shoulder; their lower edge is the chest's shadow line.
    {
      shape: 'ellipsoid',
      at: [cx + 0.1 + 0.05 * m, s * 0.27, b + 0.46 + 0.02 * m],
      size: grow([0.09 + 0.06 * m, s * 0.27, 0.11 + 0.03 * m]),
      rotate: [-12, 0, 16],
      blend: 0.05,
    },
    // Deltoids: a cap over each shoulder joint.
    {
      shape: 'ellipsoid',
      at: [cx - 0.03, s * 0.8, b + 0.5 + 0.03 * m],
      size: grow([0.13 + 0.06 * m, 0.11 + 0.05 * m, 0.16 + 0.05 * m]),
      rotate: [-18, 0, 0],
      blend: 0.08,
    },
    // Trapezius: a broad flat sheet from the neck behind the ear down to the acromion — the slope
    // of a brute (local X along the slope, Y front-back, Z its thickness).
    {
      shape: 'ellipsoid',
      at: mid(top, acromion),
      size: [dist(top, acromion) / 2 + 0.08 + g, 0.11 + 0.12 * m + g, 0.05 + 0.1 * m + g],
      rotate: alongX(sub(acromion, top)),
      blend: 0.08 + 0.08 * m,
    },
    // Upper arm: a stump the bust cut ends, filling the shoulder under any pauldron.
    {
      shape: 'capsule',
      at: [cx - 0.04, s * 0.8, b + 0.55],
      to: [cx - 0.02, s * 0.9, b + 0.05],
      size: 0.12 + 0.05 * m + g,
      blend: 0.06,
    },
    // Clavicles: a bony ridge from the sternal notch out to the shoulder (clothes drape over it).
    {
      shape: 'capsule',
      at: [cx + 0.2 + 0.04 * m, 0.045, f.nz - 0.03],
      to: [cx + 0.0, s * 0.68, b + 0.6 + 0.04 * m],
      size: 0.02 + 0.006 * (1 - m) + g,
      blend: 0.035,
    },
    // Latissimus: widens the back under the armpit (a V-taper on a brute).
    {
      shape: 'ellipsoid',
      at: [cx - 0.1, s * 0.55, b + 0.3],
      size: grow([0.17 + 0.05 * m, 0.12 + 0.1 * m, 0.2]),
      blend: 0.08,
    },
    // Upper back: the hump of trapezius and rhomboids behind the neck.
    {
      shape: 'ellipsoid',
      at: [cx - 0.18, 0, f.nz + 0.04 + 0.08 * m],
      size: grow([0.12 + 0.06 * m, s * 0.32, 0.16 + 0.12 * m]),
      blend: 0.1,
    },
  ];
}

/** Signed distance to the bust-cut region (negative inside): ≈ 0 on the cut faces. */
export function cutField(f: BustFrame): Field {
  const rz = 0.64;
  const ry = f.s * 1.08;
  const cz = f.cutZ + rz;
  const e = sd.ellipsoid([f.cx, 0, cz], [1.6, ry, rz]);
  const box = sd.box([f.cx, 0, cz + 1], [3.2, ry * 2, 2]);
  return (q) => Math.min(e(q), box(q));
}

/** Keeps a group to the bust silhouette: the U-cut under the chest, rising to cut the arms. */
export function bustCut(f: BustFrame, g = 0): SculptEdit {
  const rz = 0.64;
  const ry = f.s * 1.08 + g;
  // (cutField mirrors these numbers.)
  const cz = f.cutZ + rz - g;
  return {
    group: [
      { shape: 'ellipsoid', at: [f.cx, 0, cz], size: [1.6, ry, rz] },
      { shape: 'roundBox', at: [f.cx, 0, cz + 1], size: [3.2, ry * 2, 2] },
    ],
    op: 'intersect',
    blend: 0.012,
  };
}

/** The bare body: anatomy in `color`, sternal notch and groove, then the bust cut. */
export function bodyEdits(p: HeadParams, f: BustFrame, color: Vec3): SculptEdit[] {
  const { cx, b, m, nz } = f;
  const shade = p.colors.shade;
  return [
    {
      group: [
        ...torsoForms(f),
        {
          shape: 'sphere',
          at: [cx + 0.24 + 0.04 * m, 0, nz - 0.04],
          size: 0.035,
          op: 'subtract',
          blend: 0.04,
          color: shade,
        },
        {
          shape: 'capsule',
          at: [cx + 0.26 + 0.06 * m, 0, b + 0.5],
          to: [cx + 0.26 + 0.05 * m, 0, b + 0.22],
          size: 0.01 + 0.006 * m,
          op: 'subtract',
          blend: 0.04,
          color: shade,
        },
        bustCut(f),
      ],
      color,
    },
  ];
}

/** Solid cylinder about Z from z0 to z1 (a capsule cut by a slab). */
const cylinder = (at: Vec3, r: number, z0: number, z1: number): SculptEdit => ({
  group: [
    { shape: 'capsule', at: [at[0], at[1], z0 - r], to: [at[0], at[1], z1 + r], size: r },
    {
      shape: 'roundBox',
      at: [at[0], at[1], (z0 + z1) / 2],
      size: [4, 4, z1 - z0],
      op: 'intersect',
    },
  ],
});

/** A turned plinth: wide disc with a bead moulding, then a narrower socle up to the chest cut.
 *  Both start below the floor, so the bust's flat base cut alone makes the underside. */
/** `minT`: floor for the disc's thickness (≈ a cell), so far LODs keep the bust on the ground. */
export function plinthEdits(p: HeadParams, f: BustFrame, minT = 0): SculptEdit[] {
  const c = p.colors.plinth ?? ([0.16, 0.15, 0.15] as Vec3);
  const light: Vec3 = [c[0] * 1.35, c[1] * 1.35, c[2] * 1.35];
  const x = f.cx - 0.04;
  const R = 0.3 + 0.08 * f.s;
  // Coarse cells would lose a thin disc: one solid drum from the floor to the chest cut instead.
  if (minT > 0.07)
    return [
      { ...cylinder([x, 0, 0], R * 1.05, f.floor - 0.1, f.cutZ + 0.02), color: c, mirror: false },
    ];
  const disc = f.floor + 0.07;
  return [
    { ...cylinder([x, 0, 0], R, f.floor - 0.1, disc), color: c, mirror: false },
    {
      shape: 'torus',
      at: [x, 0, disc],
      size: [R - 0.03, 0.025],
      color: light,
      blend: 0.01,
      mirror: false,
    },
    {
      ...cylinder([x, 0, 0], R * 0.62, disc, f.cutZ + 0.02),
      color: c,
      blend: 0.02,
      mirror: false,
    },
  ];
}
