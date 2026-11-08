// Head (upper): sculpted like a portrait, in stages, on a stylised crocodile / monitor skull.
//   block-out  cranium egg, a long tapering muzzle (two masses), the occipital shelf
//   planes     skull table and muzzle bridge scraped flat, cheek planes, the palate cut at the
//              mouth line
//   features   brow ridge overhanging the eye and flowing back into the horn boss, sunken eye
//              socket, eyelids following the eyeball, cheekbone arch, a wide masseter behind the
//              eye and mouth corner, bony nasal ridge, nostril bosses near the tip with flared
//              nostrils, lip ridge, gum line, throat mass
//   secondary  labial scales along the lip, scutes on the muzzle bridge, brow wrinkles,
//              occipital bumps
// Horns, teeth and eyes are their own modules (finer meshes).

import { type Field, type Mesh, merge, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep, v3 } from '../_lib/creature/curve.ts';
import { blob } from '../_lib/creature/lowpoly.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { type SkinNode, skin } from '../_lib/creature/skin.ts';
import { EYE_R } from './eyes.ts';
import {
  bossBounds,
  bossLowpoly,
  bossRegion,
  bossRegions,
  hornBossEdits,
  mainHorns,
  minorHorns,
} from './horns.ts';
import { C } from './palette.ts';
import { SK } from './skeleton.ts';
import { teethMesh, upperTeeth } from './teeth.ts';

/** The mouth line (world z) the palate is cut at; the jaw closes onto it. */
export const MOUTH_Z = SK.head.hinge[2] + 0.01;
const E = SK.head.eye;
const NOSE = SK.head.nose;

/** Half-width of the upper jaw at x (the lip line), for lips, gums, teeth and scales. */
export const lipWidth = (x: number): number => 0.2 - 0.115 * smoothstep(2.6, NOSE[0], x);

/** Primary masses. */
function blockOut(): SculptEdit[] {
  return [
    // Cranium: a broad egg behind the eyes.
    { shape: 'ellipsoid', at: SK.head.cranium, size: [0.3, 0.26, 0.24], blend: 0 },
    // Muzzle: a long wedge, deep at the back, tapering to a narrow snout.
    { shape: 'ellipsoid', at: [2.9, 0, 3.32], size: [0.55, 0.205, 0.19], blend: 0.16 },
    { shape: 'ellipsoid', at: [3.36, 0, 3.27], size: [0.32, 0.13, 0.12], blend: 0.14 },
    // Back of the head: occipital shelf that hides the neck join.
    { shape: 'ellipsoid', at: [2.22, 0, 3.32], size: [0.2, 0.27, 0.22], blend: 0.12 },
  ];
}

/** Planes: scrape the skull top and muzzle flat, flatten the cheeks, cut the palate. */
function planes(): SculptEdit[] {
  return [
    // Skull table and muzzle bridge: one flat plane sloping down to the nose.
    {
      shape: 'roundBox',
      at: [2.9, 0, 3.98],
      size: [1.8, 0.8, 0.8],
      rotate: [0, 9, 0],
      op: 'subtract',
      blend: 0.08,
      color: C.back,
    },
    // Cheek planes: shave the muzzle's sides so it reads as a tapering box from the front.
    {
      shape: 'roundBox',
      at: [3.15, 0.5, 3.3],
      size: [1.7, 0.6, 0.6],
      rotate: [0, 0, -8],
      round: 0.05,
      op: 'subtract',
      blend: 0.06,
    },
    // Palate: everything forward of the hinge is cut flat at the mouth line.
    {
      shape: 'roundBox',
      at: [3.15, 0, MOUTH_Z - 0.3],
      size: [1.8, 0.8, 0.6],
      op: 'subtract',
      blend: 0.02,
      color: C.gum,
    },
  ];
}

/** The upper lip line from the mouth corner to the nose, `dz` above the mouth line. */
function lipLine(dz: number, inset: number, r: (t: number) => number): SkinNode[] {
  const xs = [2.42, 2.7, 2.98, 3.24, 3.46, NOSE[0] - 0.08];
  return xs.map((x, i) => ({
    at: [x, Math.max(0.02, lipWidth(x) - inset), MOUTH_Z + dz] as Vec3,
    r: r(i / (xs.length - 1)),
  }));
}

/** Features. */
function features(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    // Brow ridge: overhangs the eye, then flows back into the horn boss (a scowl).
    skin(
      [
        { at: [E[0] + 0.11, E[1] - 0.03, E[2] + 0.045], r: 0.035 },
        { at: [E[0] + 0.02, E[1] + 0.015, E[2] + 0.07], r: 0.058 },
        { at: [E[0] - 0.12, E[1] - 0.0, E[2] + 0.085], r: 0.065 },
        { at: [2.46, 0.15, 3.54], r: 0.07 },
      ],
      { blend: 0.07, color: C.back },
    ),
    // Horn bosses: the raised bony mounds every horn grows out of (horns.ts).
    ...hornBossEdits(),
    // Eye socket: sunk into the side of the head under the brow.
    {
      shape: 'sphere',
      at: [E[0] + 0.01, E[1] + 0.02, E[2]],
      size: 0.075,
      op: 'subtract',
      blend: 0.035,
      color: C.lid,
    },
    // Cheekbone arch below and behind the eye.
    skin(
      [
        { at: [2.42, 0.245, 3.3], r: 0.06 },
        { at: [2.62, 0.24, 3.34], r: 0.055 },
        { at: [2.82, 0.205, 3.36], r: 0.04 },
      ],
      { blend: 0.06 },
    ),
    // Masseter: the wide jaw-closing muscle behind the eye and the mouth corner.
    {
      shape: 'ellipsoid',
      at: [2.38, 0.21, 3.22],
      size: [0.17, 0.1, 0.13],
      rotate: [0, -25, 0],
      blend: 0.07,
    },
    // Nasal ridge: a bony keel down the middle of the muzzle bridge.
    {
      shape: 'capsule',
      at: [2.78, 0, 3.5],
      to: [NOSE[0] - 0.12, 0, 3.37],
      size: 0.045,
      blend: 0.06,
      color: C.back,
    },
    // Nostril bosses near the tip, and the flared nostrils bored outward and forward.
    {
      shape: 'ellipsoid',
      at: [NOSE[0] - 0.1, 0.065, 3.36],
      size: [0.08, 0.05, 0.04],
      rotate: [0, 0, 15],
      blend: 0.05,
    },
    {
      shape: 'ellipsoid',
      at: [NOSE[0] - 0.06, 0.08, 3.385],
      size: [0.034, 0.02, 0.018],
      rotate: [0, -20, 35],
      op: 'subtract',
      blend: 0.012,
      color: C.mouth,
    },
    // Upper lip ridge: the hard edge of the jaw from the corner to the nose.
    skin(
      lipLine(0.035, 0, (t) => 0.045 - 0.012 * t),
      { blend: 0.04 },
    ),
    // Gum line inside the lip, where the teeth are rooted.
    skin(
      lipLine(-0.005, 0.035, () => 0.026),
      { blend: 0.02, color: C.gum },
    ),
    // Back of the mouth: a dark throat mass that closes the gape behind the teeth.
    {
      shape: 'ellipsoid',
      at: [2.42, 0, MOUTH_Z - 0.04],
      size: [0.2, 0.15, 0.1],
      blend: 0.05,
      color: C.mouth,
    },
  ];
  // Eyelids follow the eyeball: an upper lid (sphere cut below a slanted plane) and a lower lid.
  // 8 cm round the 6.2 cm eye: the seat bored below leaves a lid ≥ 1.8 cm thick, which a 1.6 cm
  // cell meshes cleanly (7.4 cm left a knife rim with smoothed-over normals).
  const lid = (above: boolean): SculptEdit => ({
    group: [
      { shape: 'sphere', at: E, size: 0.08 },
      {
        shape: 'roundBox',
        at: [E[0], E[1], E[2] + (above ? 0.25 + 0.022 : -0.25 - 0.034)],
        size: [0.6, 0.6, 0.5],
        rotate: [0, above ? 14 : -6, 0],
        op: 'intersect',
      },
    ],
    blend: 0.025,
    color: C.lid,
  });
  out.push(lid(true), lid(false));
  // Back corner (canthus): the lids meet behind the eye, so the orbit closes round the eyeball.
  // Without it the skin left a 60° arc of the eyeball's back corner bare at its equator (the
  // eye_l_orbit socket joint measured it open on that side).
  out.push({
    shape: 'ellipsoid',
    at: [E[0] - 0.066, E[1] + 0.022, E[2] - 0.006],
    size: [0.03, 0.03, 0.034],
    blend: 0.04,
    color: C.lid,
  });
  // The eyeball's seat: a cavity the size of the eye bored through the lids, so the eye sits in
  // its orbit (a hole round it at the equator) instead of buried in solid lid. The socket joints
  // now measure that hole (13 cm round a 12.3 cm eye), not a fallback outline.
  if (lod < 2)
    out.push({
      shape: 'sphere',
      at: E,
      size: EYE_R + 0.002,
      op: 'subtract',
      blend: 0.012,
      color: C.lid,
    });
  if (lod < 2)
    // Brow wrinkles: two short creases above the ridge.
    for (let i = 0; i < 2; i++)
      out.push({
        shape: 'capsule',
        at: [E[0] - 0.12 + i * 0.07, E[1] - 0.04, E[2] + 0.16 + i * 0.01],
        to: [E[0] - 0.04 + i * 0.07, E[1] - 0.02, E[2] + 0.17 + i * 0.01],
        size: 0.012,
        op: 'subtract',
        blend: 0.012,
      });
  return out;
}

/** Secondary: labial scales, muzzle scutes, occipital bumps (LOD0/1). */
function secondary(lod: number): SculptEdit[] {
  if (lod === 2) return [];
  const out: SculptEdit[] = [];
  // Labial scales: a row of flat plates along the upper lip, shrinking toward the nose.
  const n = lod === 0 ? 11 : 6;
  for (let i = 0; i < n; i++) {
    const x = 2.5 + (i / (n - 1)) * (NOSE[0] - 2.62);
    const s = 1 - 0.4 * (i / (n - 1));
    out.push({
      shape: 'ellipsoid',
      at: [x, lipWidth(x) + 0.005, MOUTH_Z + 0.07],
      size: [0.045 * s, 0.018, 0.03 * s],
      blend: 0.015,
      color: C.belly,
    });
  }
  // Scutes along the muzzle bridge either side of the nasal ridge.
  for (let i = 0; i < 6; i++)
    out.push({
      shape: 'ellipsoid',
      at: [2.8 + i * 0.13, 0.07 - i * 0.004, 3.5 - i * 0.03],
      size: [0.05, 0.033, 0.022],
      blend: 0.022,
      color: C.back,
    });
  // Occipital bumps that lead into the neck spines.
  for (let i = 0; i < 3; i++)
    out.push({
      shape: 'ellipsoid',
      at: [2.2 - i * 0.04, 0.16 + i * 0.05, 3.5 - i * 0.07],
      size: [0.07, 0.04, 0.04],
      // Wide enough to swell out of the skin, not sit on it (0.03 left a glued ring: QA seam).
      blend: 0.06,
      color: C.back,
    });
  return out;
}

/** Head colour zones: the focal point, highest contrast — dark crimson top, ember sides, a pale
 *  lip line and throat. */
function headPaint(p: Vec3, c: Vec3): Vec3 {
  const top = smoothstep(3.34, 3.56, p[2]);
  const lip = smoothstep(MOUTH_Z + 0.1, MOUTH_Z + 0.04, p[2]) * smoothstep(2.4, 2.6, p[0]);
  const side = mixRgb(c, C.ember, 0.25 * (1 - top));
  return mixRgb(mixRgb(side, C.backDeep, top * 0.85), C.belly, lip * 0.4);
}

export const HEAD_RES = [0.016, 0.04, 0.14] as const;

export function headEdits(lod: number): SculptEdit[] {
  return [...blockOut(), ...planes(), ...features(lod), ...secondary(lod)];
}

/** Outward axis of the eye socket (left): the orbit opens sideways, a little forward and up. */
export const SOCKET_AXIS: Vec3 = v3.norm([0.35, 0.92, 0.12]);
/** The orbit region (negative inside) around the left eye, split off as `eye_socket_l`. */
const socketRegion = (grow: number, side: 1 | -1): Field => {
  const c: Vec3 = [E[0], E[1] * side, E[2]];
  const r = 0.088 + grow;
  return (p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
};
const socketBox = (side: 1 | -1): [Vec3, Vec3] => [
  [E[0] - 0.16, E[1] * side - 0.16, E[2] - 0.16],
  [E[0] + 0.16, E[1] * side + 0.16, E[2] + 0.16],
];

export interface HeadMeshes {
  /** Skull, minor horns, upper teeth. */
  readonly head: Mesh;
  /** Main horns, their bosses and the eye orbits, left then right. */
  readonly horns: readonly [Mesh, Mesh];
  readonly bosses: readonly [Mesh, Mesh];
  readonly sockets: readonly [Mesh, Mesh];
  readonly field: Field;
}

/**
 * The upper head in world space. The main-horn bosses and the eye orbits are split off the skull
 * sculpt as their own parts (same field, overlapping a hair, so no seam), so the horn ↔ boss and
 * eye ↔ orbit joints compare the pieces that actually fit together.
 */
export function headMeshes(lod: 0 | 1 | 2): HeadMeshes {
  const common = {
    edits: headEdits(lod),
    res: HEAD_RES[lod],
    color: C.flank,
    mirror: true,
    paint: headPaint,
    tone: { reach: 0.06, strength: 1 },
  };
  const holes: Field = (p) => {
    const q: Vec3 = [p[0], Math.abs(p[1]), p[2]];
    return Math.min(bossRegions(0)(q), socketRegion(0, 1)(q));
  };
  const skull = sculptPart(lod === 2 ? common : { ...common, cut: { field: holes, keep: 'out' } });
  const piece = (field: Field, box: [Vec3, Vec3], cell: number): Mesh =>
    sculptPart({
      ...common,
      res: Math.min(common.res, cell),
      cut: { field, keep: 'in' },
      clip: box,
      snap: false,
    }).mesh;
  const pair = <T>(f: (side: 1 | -1) => T): [T, T] => [f(1), f(-1)];
  const head = merge([skull.mesh, minorHorns(lod), teethMesh(upperTeeth(lod), lod)]);
  return {
    head,
    horns: mainHorns(lod),
    bosses: pair((s) =>
      lod === 2 ? bossLowpoly(s) : piece(bossRegion(0.03, s), bossBounds(s), 0.04),
    ),
    sockets: pair((s) =>
      lod === 2
        ? blob([E[0], E[1] * s, E[2]], [0.09, 0.07, 0.08], { rings: 3, sides: 6, color: C.lid })
        : // 1.8 cm at LOD1: 2.2 cm folded the bored lid rim (normals-winding).
          piece(socketRegion(0.03, s), socketBox(s), lod === 0 ? 0.016 : 0.018),
    ),
    field: skull.field,
  };
}
