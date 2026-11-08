// Warden Hall upper works: the team-colour gable roof (strips along the ridge, so damage can drop
// some and show the rafters), gable ends with an amber oculus, the rear drum towers with team
// cone caps and beacons, the chevron porch canopy and the gate. Each piece takes the stage and
// damage it is built for.

import {
  box,
  cylinder,
  type Lod,
  lathe,
  type Mesh,
  merge,
  place,
  prism,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  BONE,
  BONE_DARK,
  BRASS,
  chevronPlan,
  GLOW,
  IRON,
  pebble,
  SEG,
  TEAM,
  teamShade,
} from '../_lib/rts/style.ts';
import {
  COURSE,
  type Damage,
  DOOR_ROWS,
  EAVES,
  HALF_X,
  HALF_Y,
  PLINTH,
  type Stage,
  TOWER,
  WALL_T,
} from './plan.ts';

export const PITCH = (26 * Math.PI) / 180;
export const OVERHANG = 0.6;
const SLOPE_W = (HALF_Y + OVERHANG) / Math.cos(PITCH);
export const RIDGE = EAVES + HALF_Y * Math.tan(PITCH);
const STRIPS = 5;
const ROOF_T = 0.22;
/** Roof-strip lap and the odd strips' lift over their neighbours. */
const LAP = 0.08;
const LIFT = 0.05;
/** Oak timber (rafters, gable frame, porch posts) and the gate's tarred planks. */
export const WOOD: Vec3 = [0.23, 0.14, 0.08];
export const TIMBER: Vec3 = [0.3, 0.19, 0.1];
export const DOOR: Vec3 = [0.12, 0.08, 0.05];
/** Lime plaster on the gables. */
export const PLASTER: Vec3 = [0.74, 0.69, 0.57];

/** Roof slope strips (team) on side s (+1 = +Y), minus the `missing` ones. */
export function roofSlopes(lod: Lod, s: 1 | -1, missing: readonly number[]): Mesh | null {
  const len = (HALF_X + OVERHANG) * 2;
  const strip = len / STRIPS;
  const out: Mesh[] = [];
  // Slope centre: halfway from ridge to the overhang's edge, lifted so the underside meets the wall top.
  const midY = (s * (HALF_Y + OVERHANG)) / 2;
  const midZ = RIDGE - (Math.tan(PITCH) * (HALF_Y + OVERHANG)) / 2 + ROOF_T / 2 / Math.cos(PITCH);
  for (let i = 0; i < STRIPS; i++) {
    if (missing.includes(i)) continue;
    const x = -HALF_X - OVERHANG + strip * (i + 0.5);
    // Lapped like real roof sheets: every strip overlaps its neighbours by LAP, and the odd
    // strips ride LIFT higher, so each lap is a real contact face, not an edge.
    const lift = i % 2 === 1 ? LIFT : 0;
    const slab = box({
      size: [strip + (i > 0 && i < STRIPS - 1 ? LAP * 2 : LAP), SLOPE_W, ROOF_T],
      at: [i === 0 ? LAP / 2 : i === STRIPS - 1 ? -LAP / 2 : 0, 0, -ROOF_T / 2 + lift],
      color: TEAM,
      strip: 'slate',
      bevel: lod === 0 ? 0.03 : 0,
    });
    out.push(place(slab, { at: [x, midY, midZ], roll: -s * PITCH }));
    if (lod === 0)
      // Tile battens down the slope: shadow lines that read as a tiled roof.
      for (let k = 1; k < 8; k++) {
        const v = -SLOPE_W / 2 + (k / 8) * SLOPE_W;
        const bat = box({
          size: [strip - 0.06, 0.08, 0.05],
          at: [0, v, ROOF_T / 2 - 0.01 + lift],
          color: teamShade(0.8),
        });
        out.push(place(bat, { at: [x, midY, midZ], roll: -s * PITCH }));
      }
  }
  return out.length ? merge(out) : null;
}

/** Rafters under the roof, every 1.2 m: visible through missing strips and while building. */
export function rafters(lod: Lod, every = 1): Mesh | null {
  if (lod === 2) return null;
  const out: Mesh[] = [];
  const n = 9;
  for (let i = 0; i < n; i += every) {
    const x = -HALF_X + 0.6 + (i * (HALF_X * 2 - 1.2)) / (n - 1);
    for (const s of [1, -1] as const) {
      const r = box({
        size: [0.16, SLOPE_W * 0.92, 0.22],
        at: [0, 0, -0.11],
        color: WOOD,
      });
      out.push(
        place(r, { at: [x, (s * HALF_Y) / 2, (EAVES + RIDGE) / 2 - 0.12], roll: -s * PITCH }),
      );
    }
  }
  out.push(box({ size: [HALF_X * 2, 0.24, 0.3], at: [0, 0, RIDGE - 0.3], color: WOOD }));
  return merge(out);
}

/** Gable end walls (front and back): lime plaster infill in an oak frame (tie beam, raked
 *  rafters, king post, two struts), the oculus on the front. */
export function gables(lod: Lod): { walls: Mesh; frame: Mesh | null; oculus: Mesh | null } {
  const tri: Vec2[] = [
    [-HALF_Y, EAVES],
    [HALF_Y, EAVES],
    [0, RIDGE],
  ];
  const g = prism({ profile: tri, depth: WALL_T, plane: 'yz', color: PLASTER });
  const walls = merge([place(g, { at: [HALF_X, 0, 0] }), place(g, { at: [-HALF_X, 0, 0] })]);
  let frame: Mesh | null = null;
  if (lod < 2) {
    const beams: Mesh[] = [];
    // Beams stand 6 cm proud of the plaster and sink 6 cm into it: face contact.
    const beam = (x: number, a: Vec3, b: Vec3): Mesh => {
      const len = Math.hypot(b[1] - a[1], b[2] - a[2]);
      const roll = Math.atan2(b[2] - a[2], b[1] - a[1]);
      const m = box({
        size: [0.12, len, 0.26],
        at: [0, 0, -0.13],
        color: TIMBER,
        bevel: lod === 0 ? 0.02 : 0,
      });
      return place(m, {
        at: [x, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        roll,
      });
    };
    for (const sx of [1, -1]) {
      const x = sx * (HALF_X + WALL_T / 2);
      const h = RIDGE - EAVES;
      beams.push(
        beam(x, [0, -HALF_Y + 0.2, EAVES + 0.14], [0, HALF_Y - 0.2, EAVES + 0.14]),
        beam(x, [0, 0, EAVES + 0.14], [0, 0, RIDGE - 0.35]),
        beam(x, [0, -HALF_Y * 0.55, EAVES + 0.14], [0, -0.12, EAVES + h * 0.62]),
        beam(x, [0, HALF_Y * 0.55, EAVES + 0.14], [0, 0.12, EAVES + h * 0.62]),
      );
    }
    frame = merge(beams);
  }
  const oculus =
    lod < 2
      ? merge([
          cylinder({
            radius: 0.75,
            length: 0.16,
            segments: SEG(lod, 24, 12, 6),
            axis: 'x',
            at: [HALF_X + WALL_T / 2 + 0.04, 0, EAVES + 1.25],
            color: BRASS,
          }),
          cylinder({
            radius: 0.6,
            length: 0.18,
            segments: SEG(lod, 24, 12, 6),
            axis: 'x',
            at: [HALF_X + WALL_T / 2 + 0.05, 0, EAVES + 1.25],
            color: GLOW,
          }),
        ])
      : null;
  return { walls, frame, oculus };
}

/** A rear drum tower of `height` (m above ground) at side s; capped with a team cone if `cap`. */
export function tower(
  lod: Lod,
  s: 1 | -1,
  height: number,
  cap: boolean,
): { drum: Mesh; cap: Mesh | null; beacon: Mesh | null } {
  const at: Vec3 = [TOWER.x, s * TOWER.y, 0];
  const segs = SEG(lod, 28, 14, 7);
  const r = TOWER.r;
  // Coursed masonry in the profile itself: every 0.5 m course is chamfered back 2.5 cm at its
  // bed joint (LOD0/1), so the drum reads as laid blocks under raking light, not a pipe.
  const courses: Vec2[] = [];
  const top = height - 0.4;
  if (lod < 2)
    for (let z = 1.5; z < top - 0.2; z += 0.5)
      courses.push([r, z - 0.03], [r - 0.025, z], [r, z + 0.02]);
  const profile: Vec2[] = [
    [0.001, 0],
    [r + 0.2, 0],
    [r + 0.2, 0.9],
    [r, 1.0],
    ...courses,
    [r, top],
    [r + 0.15, height - 0.35],
    [r + 0.15, height],
    [0.001, height],
  ];
  const drum = lathe({ profile, segments: segs, at, color: BONE, strip: 'concrete' });
  if (!cap) return { drum, cap: null, beacon: null };
  const cone = lathe({
    profile: [
      [0.001, 0],
      [r + 0.45, 0],
      [r + 0.35, 0.25],
      [0.001, 2.6],
    ],
    segments: segs,
    at: [at[0], at[1], height],
    color: TEAM,
    strip: 'slate',
  });
  const beacon =
    lod < 2
      ? merge([
          // Brass collar seated on the cone where its radius matches, then the beacon mast.
          cylinder({
            radius: 0.28,
            length: 0.1,
            segments: SEG(lod, 12, 8, 4),
            at: [at[0], at[1], height + 2.3],
            color: BRASS,
          }),
          cylinder({
            radius: 0.05,
            length: 1.0,
            segments: 6,
            at: [at[0], at[1], height + 2.85],
            color: IRON,
          }),
          lathe({
            profile: [
              [0.001, 0],
              [0.22, 0.12],
              [0.22, 0.4],
              [0.001, 0.55],
            ],
            segments: SEG(lod, 12, 8, 4),
            at: [at[0], at[1], height + 3.3],
            color: GLOW,
          }),
        ])
      : null;
  return { drum, cap: cone, beacon };
}

/** The chevron porch canopy on two pillars (complete stage). */
export function porch(lod: Lod, damage: Damage): Mesh {
  const z = PLINTH + DOOR_ROWS * COURSE;
  const pillars = [1, -1].map((s) =>
    cylinder({
      radius: 0.28,
      length: z,
      segments: SEG(lod, 16, 8, 5),
      at: [HALF_X + 2.0, s * 2.1, z / 2],
      color: TIMBER,
    }),
  );
  const tilt = damage === 'damaged' ? 0.06 : 0;
  const canopy = place(chevronPlan([0, 0, 0], 3.4, 6.4, 1.7, 0.3, BONE_DARK), {
    at: [HALF_X + 1.6, 0, z],
    roll: tilt,
  });
  return merge([...pillars, canopy]);
}

/** The double gate filling the door opening (two bays wide, DOOR_ROWS courses tall). */
export function gate(lod: Lod, stage: Stage): Mesh | null {
  if (stage !== 'complete') return null;
  const h = DOOR_ROWS * COURSE;
  const leaf = (s: 1 | -1): Mesh =>
    pebble(lod, [0.18, 1.98, h], [HALF_X - 0.05, s * 1.0, PLINTH], DOOR);
  const out: Mesh[] = [leaf(1), leaf(-1)];
  if (lod === 0)
    for (const s of [1, -1])
      for (const z of [0.8, 1.9, 3.0])
        out.push(
          box({ size: [0.06, 1.7, 0.12], at: [HALF_X + 0.06, s * 1.0, PLINTH + z], color: IRON }),
        );
  return merge(out);
}
