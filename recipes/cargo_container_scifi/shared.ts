// Shared by the container's near build (cargo_container_scifi.ts) and its far LOD (far.ts): the
// palette and its strip rules, the ISO 668 / ISO 1161 numbers, the door geometry and mount, and
// the two small mesh helpers both use.

import { box, hex, type Mesh, type PartOptions, planar, type Vec3 } from '@developerz.ai/ts23d';
import type { StripRule } from '../_lib/finish/finish.ts';

// Authoring colour → material: painted steel shell and frame (chips show steel), cast corner
// castings, galvanised lock bars/hinges/bolts. Plain strips stay for stencils, hazard and glow.

// ── palette: deep teal shell, off-white frame, orange accent ────────────────────────────────────
export const SHELL = hex('#2f5c63');
export const SHELL_DARK = hex('#244a50');
export const FRAME = hex('#c9c8bf');
export const CAST = hex('#3a3d40');
export const DARK = hex('#1c1f21');
export const METAL = hex('#6b7075');
export const ACCENT = hex('#d0661e');
export const HAZARD = hex('#d9a421');
export const BLACK = hex('#17181a');
export const GLOW = hex('#5dffb0');
/** Soft stains on the weather grids: dark rain-run grime and a rust bloom. */
export const GRIME = hex('#1a2a2c');
export const RUST_STAIN = hex('#6a3a22');
export const STENCIL = hex('#e4e2d8');
export const RULES: readonly StripRule[] = [
  { from: SHELL, strip: 'steel_painted' },
  { from: SHELL_DARK, strip: 'steel_painted' },
  { from: FRAME, strip: 'steel_painted' },
  { from: CAST, strip: 'iron_cast', color: hex('#b8b4ae') },
  { from: METAL, strip: 'steel_galvanised', color: hex('#c8ccd0') },
  { from: DARK, strip: 'rubber', color: hex('#9a9a9a') },
];
/** ISO 6346-style marking for an invented owner code; check digit computed (AXSU 204118 → 1). */
export const ID_LINES = ['AXSU', '204118 1', '22G1'] as const;

// ── ISO 668 / ISO 1161 numbers ─────────────────────────────────────────────────────────────────
export const L = 6.058;
export const W = 2.438;
export const H = 2.591;
export const CL = 0.178; // casting length (X)
export const CW = 0.162; // casting width (Y)
export const CH = 0.118; // casting height (Z)
export const POST = 0.16;
export const HL = L / 2;
export const HW = W / 2;
export const RECESS = 0.14; // side skin sits this far inside the frame face (bays 9 cm deep, plate 12)
// Door leaves fill the rear opening like a real ISO box: between the corner posts, from the sill
// (bottom end rail, top at 0.182 m) to the header (top end rail, underside at 2.441 m), outer
// face flush with the frame's rear face. The hinge axis sits just outside the posts, so the leaf
// swings out without its edge ever entering the post.
export const HINGE_OUT = 0.035; // hinge axis behind the rear frame face (pin radius)
export const DOOR_T = 0.06; // leaf thickness
export const DOOR_X = -HL - HINGE_OUT; // hinge axis x
export const LEAF_X = HINGE_OUT + DOOR_T / 2; // leaf mid-plane, in hinge space (+X = into the box)
export const HINGE_Y = HW - POST - 0.003; // leaf hinge edge: 3 mm off the post inner face (swing clearance)
export const LEAF = HINGE_Y - 0.002; // leaf width to the centre line: a 4 mm gasket seam between leaves
export const DOOR_Z0 = 0.182; // sill top
export const DOOR_Z1 = 2.441; // header underside
export const SWING = 90; // doors rest closed and swing one way, outward, to square with the box
export const DEG = Math.PI / 180;

export const bevelled = (size: Vec3, color: Vec3, bevel: number, at: Vec3 = [0, 0, 0]): Mesh =>
  box({ size, color, at, bevel: bevel > 0 && bevel < Math.min(...size) / 2 ? bevel : 0 });

/** A flat quad lifted `off` along its normal; CCW seen from the side it faces. */
export function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3, off = 0.003): Mesh {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  const lift = (p: Vec3): Vec3 => [
    p[0] + (n[0] / l) * off,
    p[1] + (n[1] / l) * off,
    p[2] + (n[2] / l) * off,
  ];
  return planar({ points: [lift(a), lift(b), lift(c), lift(d)], color });
}

/** How a door leaf hangs (s = +1 the leaf named `r`): closed at rest, one-way 90° outward. */
export const doorMount = (root: string, s: number, side: string): PartOptions => ({
  parent: root,
  at: [DOOR_X, s * HINGE_Y, DOOR_Z0],
  motion: { kind: 'sway', axis: [0, 0, -s], degrees: SWING, hz: 0.15, oneWay: true },
  clearOf: [`hinge_${side}`], // knuckles turn on the hinge pins: a real interlock
});
