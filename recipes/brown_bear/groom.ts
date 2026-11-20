// The brown bear's coat, lock by lock (the spec turns the creature kind's own cards off: its
// even 1 800 cards per m² spent 54 000 triangles on this much skin and still left the flanks
// bare). Three body layers — a short dense undercoat everywhere above the paws, clumped guard
// hair whose length follows the real coat (long on the back, breeches, belly fringe and the back
// of the forelegs, short down the legs), and the hump: a mane of long locks standing off the
// withers — and two head layers (short face fur with bare nose, lips and eye rims; a cheek ruff
// and fuzzy round ears). LOD1 grows a quarter of the cards, 1.5× wider; LOD2 a few dozen big
// locks on the hump, back and breeches so the outline keeps its shag.

import {
  CREATURE_MATERIALS,
  type CreatureInfo,
  defineMaterial,
  dmath,
  type Lod,
  strandCells,
  type Vec3,
} from '@developerz.ai/ts23d';
import { smooth } from '../_lib/creature/wild-paint.ts';
import type { GroomLayer } from '../_lib/creature/wild-parts.ts';
import { earDisc } from './head.ts';

// The cutout strand atlas every card maps into (the kind registers it only when it grows cards).
defineMaterial(CREATURE_MATERIALS.fur_clumps);

/** The shoulder hump on the topline (the spec's `build.topline` point and the mane's centre):
 *  `at` 0 = croup → 1 = withers, `rise` ÷ shoulder height. */
export const HUMP = { at: 0.88, rise: 0.07 } as const;

const dist = (p: Vec3, q: Vec3): number =>
  dmath.hypot(p[0] - q[0], Math.abs(p[1]) - Math.abs(q[1]), p[2] - q[2]);

export function bearGroom(
  info: CreatureInfo,
  lod: Lod,
): {
  body: GroomLayer[];
  head: GroomLayer[];
  comb: (p: Vec3) => Vec3;
  box: { y: number; z: number };
} {
  const b = info.bones;
  const H = b.height;
  const fur = strandCells('fur_clumps', 'fur');
  const guard = strandCells('fur_clumps', 'guard');
  const withers = b.spine[b.spine.length - 1] ?? [0.65, 0, H];
  const fore = b.legs.find((l) => l.name === 'fore');
  const hind = b.legs.find((l) => l.name === 'hind');
  const elbow = fore?.joints[1] ?? [0.6, 0.2, 0.47];
  const hip = hind?.joints[0] ?? [-0.53, 0.19, 0.85];
  // Hump centre: the top of the hump mass the spec raises on the topline (`build.topline`).
  const croup = b.spine[1] ?? [-0.5, 0, H];
  const hump: Vec3 = [
    croup[0] + HUMP.at * (withers[0] - croup[0]),
    0,
    withers[2] + (HUMP.rise - 0.03) * H,
  ];
  const onHump = (p: Vec3): number => Math.max(0, 1 - dmath.pow(dist(p, hump) / (H * 0.3), 2));
  const breeches = (p: Vec3): number =>
    Math.max(0, 1 - dmath.pow(dist(p, [hip[0] - 0.2, hip[1], hip[2] - 0.25]) / (H * 0.3), 2));
  // Behind the forearm, elbow → wrist: the feathering a bear's foreleg carries.
  const feather = (p: Vec3): number =>
    Math.max(0, 1 - dmath.pow(dist(p, [elbow[0] - 0.1, elbow[1], elbow[2] - 0.12]) / (H * 0.2), 2));
  // Short tight fur from the wrists and heels down; none on the soles.
  const leg = (p: Vec3): number => smooth(H * 0.1, H * 0.36, p[2]);
  const sole = (p: Vec3): number => smooth(H * 0.035, H * 0.07, p[2]);
  const under = (n: Vec3): number => smooth(-0.25, -0.7, n[2]);
  const guardLength = (p: Vec3, n: Vec3): number => {
    const back = 0.075 + 0.055 * smooth(0.3, 0.85, n[2]);
    const long = Math.max(
      back,
      0.15 * onHump(p),
      0.13 * breeches(p),
      0.11 * feather(p),
      0.12 * under(n) * smooth(H * 0.38, H * 0.48, p[2]),
    );
    // Shorter on the body's widest faces: the coat lies flat down the sides of a bear.
    const side = 1 - 0.45 * smooth(0.75, 0.95, Math.abs(n[1]));
    return (0.03 + (long - 0.03) * leg(p)) * side;
  };
  // The dossier's envelope: 0.71 m wide, 1.30 m to the top of the hump (±5 % is the gate's, not
  // the coat's to spend): no lock past 0.36 m off the midline or above 1.335 m.
  const box = { y: 0.36, z: 1.335 };
  const k = lod === 0 ? 1 : 0.25;
  const wide = lod === 0 ? 1 : 1.5;
  if (lod === 2)
    return {
      body: [
        {
          name: 'far',
          density: (p, n) =>
            60 *
            Math.max(
              smooth(0.3, 0.75, n[2]) * smooth(H * 0.8, H * 0.92, p[2]),
              onHump(p) * 1.6,
              breeches(p) * 0.8,
            ),
          length: (p) => 0.11 + 0.04 * onHump(p),
          width: 0.1,
          lift: 0.26,
          bend: 0.5,
          droop: 0.1,
          roll: 0.6,
          cells: guard,
          tone: [0.9, 1.2],
          sink: 0.006,
          segments: 1,
        },
      ],
      head: [],
      comb: () => [-1, 0, -0.15],
      box,
    };
  const body: GroomLayer[] = [
    {
      name: 'undercoat',
      density: (p) => 850 * k * sole(p),
      length: (p) => 0.022 + 0.022 * leg(p),
      width: 0.016 * wide,
      lift: 0.28,
      bend: 0.6,
      droop: 0.03,
      roll: 0.3,
      cells: fur,
      tone: [0.93, 1.22],
      sink: 0.003,
      segments: 2,
    },
    {
      name: 'guard',
      density: (p, n) =>
        230 *
        k *
        sole(p) *
        (0.25 + 0.75 * leg(p)) *
        (0.8 + 1.4 * Math.max(breeches(p), feather(p), under(n) * 0.8)),
      length: guardLength,
      width: 0.022 * wide,
      lift: 0.3,
      bend: 0.6,
      droop: 0.14,
      roll: 0.8,
      clump: 4,
      fold: lod === 0 ? 0.6 : 0,
      cells: guard,
      tone: [0.95, 1.28],
      sink: 0.003,
      segments: lod === 0 ? 3 : 2,
    },
    {
      // The hump: long locks standing off the shoulders, pale-tipped (the "grizzle").
      name: 'hump',
      density: (p, n) => 900 * k * smooth(0.15, 0.6, onHump(p)) * smooth(0.25, 0.6, n[2]),
      length: (p) => 0.08 + 0.05 * onHump(p),
      width: 0.022 * wide,
      // A mound that lies back over the shoulders: stood any straighter the locks read as quills.
      lift: 0.42,
      bend: 0.75,
      droop: 0.2,
      roll: 0.7,
      clump: 5,
      fold: lod === 0 ? 0.6 : 0,
      cells: guard,
      tone: [0.9, 1.45],
      sink: 0.004,
      segments: lod === 0 ? 3 : 2,
    },
  ];
  // Head-local: +X to the nose, origin at the atlas.
  const l = info.head;
  // The kind's own map of bare skin (nose leather, eye rims, lips).
  const skin = info.bare;
  const bare = (p: Vec3): boolean =>
    dist(p, skin.nose) < skin.noseR * 1.4 ||
    dist(p, skin.eye) < skin.eyeR * 1.5 ||
    (p[0] > skin.muzzle && Math.abs(p[2] - skin.lips) < skin.noseR * 0.45);
  // The cheek ruff below the eye line, and all round the back of the skull: the long fur that
  // carries the head into the neck (without it the skull ends in a hard collar).
  const ruff = (p: Vec3): number =>
    Math.max(
      smooth(l.lc, l.lc * 0.25, p[0]) * smooth(l.eye.centre[2], l.zm, p[2]),
      smooth(l.lc * 0.45, l.lc * 0.1, p[0]),
    );
  const disc = earDisc(l);
  const ear = (p: Vec3): number => smooth(disc.r * 1.25, disc.r * 0.85, dist(p, disc.at));
  const head: GroomLayer[] = [
    {
      name: 'face',
      density: (p) => (bare(p) ? 0 : 2600 * k * (1 + 0.8 * ear(p))),
      // Velvet on the muzzle, thickening over the forehead and crown.
      length: (p) => (0.016 + 0.026 * smooth(l.lc * 1.05, l.lc * 0.5, p[0])) * (1 - 0.3 * ear(p)),
      width: 0.009 * wide,
      lift: 0.34,
      bend: 0.6,
      droop: 0.02,
      roll: 0.3,
      cells: fur,
      tone: [0.78, 1.3],
      sink: 0.0025,
      segments: 2,
    },
    {
      name: 'ruff',
      density: (p) => (bare(p) ? 0 : 800 * k * smooth(0.15, 0.6, ruff(p)) * (1 - ear(p))),
      length: (p) => 0.05 + 0.07 * ruff(p),
      width: 0.016 * wide,
      lift: 0.4,
      bend: 0.55,
      droop: 0.12,
      roll: 0.7,
      clump: 4,
      fold: lod === 0 ? 0.6 : 0,
      cells: guard,
      tone: [0.95, 1.28],
      sink: 0.003,
      segments: lod === 0 ? 3 : 2,
    },
  ];
  // Back from the nose, flaring out and down over the cheeks; short and close on the ears.
  const comb = (p: Vec3): Vec3 => [-1, Math.sign(p[1]) * (0.2 + 0.5 * ruff(p)), -0.2 * ruff(p)];
  return { body, head, comb, box };
}
