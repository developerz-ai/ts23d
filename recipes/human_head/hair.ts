// Human hair and beard as sculpted locks: a swept-back hair mass inside a rounded hairline with
// clumps flowing front → crown → nape and grooves between them, a lifted front lock; a clipped
// beard mass along the jaw with downward locks and a drooping moustache of two locks.
// Card hair (`hairBaseEdits` + `HUMAN_CARD_HAIR`): the masses stay as the dense base layer and
// strand cards (swept back, beard down, moustache) break the outline instead of sculpted locks.

import { type Field, type SculptEdit, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { flowLocks, hairMass, lock, mix } from '../_lib/bust/hair.ts';
import { headBlock } from '../_lib/bust/head.ts';
import { C, H, L, SPEC, TORSO } from '../_lib/bust/human/spec.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';

/** The torso (neck, trapezius) the hair and beard must stop short of. */
const neck: Field = sculptField(torsoEdits(L, TORSO), { color: C.skin, mirror: 'y' }).field;

/** Hairline: keep hair above a plane rising from the nape to the forehead, above the ears. */
export const hairline: Field = (p) => {
  const front = L.gx + 0.02 * H;
  const zFront = L.mz + 0.86 * H;
  const zBack = L.mz + 0.42 * H;
  const t = Math.min(1, Math.max(0, (front - p[0]) / (front - L.back)));
  const above = zFront + (zBack - zFront) * t;
  // Above the ears at the sides.
  const ears = L.mz + 0.62 * H - Math.abs(p[1]) * 0.0;
  // …and 12 mm short of the neck and trapezius, so the nape edge never folds into them.
  return Math.max(
    above - p[2],
    Math.abs(p[1]) > L.ear[1] * 0.9 ? ears - p[2] : -1,
    0.012 - neck(p),
  );
};

export const beardline: Field = (p) => {
  // The beard: below the cheek line, in front of the ears, outside a mouth hole.
  const cheek = L.mz + 0.3 * H - (p[0] - L.gx) * 0.3;
  const mouth = Math.hypot((p[0] - L.mouth[0]) * 1.2, p[1], (p[2] - L.mouth[2]) * 2.2) - 0.11 * H;
  // Under the jaw the beard thins out 12 mm short of the neck, so it never folds into the throat.
  // The sideburn stops 1.5 cm in front of the ear root, so the beard never runs into the ear.
  return Math.max(p[2] - cheek, L.back + 0.54 * H - p[0], -mouth, 0.012 - neck(p));
};

const box: [V, V] = [
  [L.back - 0.05, -0.12, L.mz - 0.06 * H],
  [L.gx + 0.06, 0.12, L.crown + 0.04],
];

export function hairEdits(scalp: Field, lod: number): SculptEdit[] {
  const mass = hairMass(scalp, 0.008, hairline, box, C.hairRoot, 0.045);
  const beard = hairMass(scalp, 0.006, beardline, box, C.hairRoot, 0.015);
  const out: SculptEdit[] = [mass, beard];
  if (lod === 2) return out;
  const hair: Surface = surface(
    sculptField([mass, beard, { field: scalp, bounds: box }], { color: C.hairRoot }).field,
  );
  out.push(...flowLocks(hair, hairLines(), 0.0068, { root: C.hairRoot, tip: C.hairTip }));
  // Beard locks down the jaw, and the moustache.
  out.push(...flowLocks(hair, beardLines(), 0.0045, { root: C.hairRoot, tip: C.hairTip }));
  out.push(...lock(moustache(), 0.0075, 0.0025, C.hairRoot, C.hairTip));
  return out;
}

/** Swept-back lock lines from the hairline over the crown to the nape (left half, mirrored). */
export function hairLines(): V[][] {
  const lines: V[][] = [];
  for (let i = 0; i < 5; i++) {
    const y = 0.007 + i * 0.0135;
    lines.push(
      spline(
        [
          [L.gx + 0.0, y * 0.9, L.mz + 0.88 * H],
          [L.gx - 0.25 * H, y * 1.1, L.crown + 0.01],
          [L.back + 0.12 * H, y * 1.25, L.mz + 0.8 * H],
          [L.back + 0.04 * H, y * 1.3, L.mz + 0.5 * H],
        ],
        8,
      ),
    );
  }
  return lines;
}

/** Beard lock lines down the jaw (left half, mirrored). */
export function beardLines(): V[][] {
  const lines: V[][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * 70;
    const t = (a * Math.PI) / 180;
    const c: V = [
      L.mouth[0] - 0.12 * H * (1 - Math.cos(t)),
      0.12 * H * Math.sin(t) + 0.004,
      L.mouth[2] - 0.06 * H,
    ];
    lines.push(
      spline(
        [c, [c[0] - 0.01, c[1] * 1.05, L.mz + 0.08 * H], [c[0] - 0.03, c[1] * 1.05, L.mz - 0.01]],
        6,
      ),
    );
  }
  return lines;
}

/** The drooping moustache lock (left half, mirrored). */
export function moustache(): V[] {
  return spline(
    [
      [L.subnasale[0] - 0.005, 0.004, L.subnasale[2] - 0.006],
      [L.mouth[0] + 0.004, 0.022, L.mouth[2] + 0.004],
      [L.mouth[0] - 0.01, 0.034, L.mouth[2] - 0.016],
    ],
    8,
  );
}

/** The base layer under card hair: the hair and beard masses alone (the LOD2 sculpt). */
export const hairBaseEdits = (scalp: Field, _lod: number): SculptEdit[] => hairEdits(scalp, 2);

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Distance to the moustache line (both sides) minus its half-width: negative on the lip. */
const MOUSTACHE = moustache();
const moustacheline: Field = (p) =>
  Math.min(...MOUSTACHE.map((q) => Math.hypot(p[0] - q[0], Math.abs(p[1]) - q[1], p[2] - q[2]))) -
  0.009;

/** The parting's y (left of centre). */
const PART = 0.028;

/** Swept back from the hairline over the crown, falling at the nape and sides; beard downward. */
const comb = (p: Vec3, n: Vec3): Vec3 => {
  if (beardline(p) < 0.004 || moustacheline(p) < 0.004)
    return moustacheline(p) < 0.004 ? [0.2, Math.sign(p[1]) * 0.8, -0.6] : [0.25, 0, -1];
  const t = clamp01((L.gx - p[0]) / (L.gx - L.back));
  const side = Math.abs(n[1]);
  // Side parting on the left: hair leaves the part line sideways, then sweeps back and down.
  const away = p[1] - PART;
  const top = clamp01(n[2]) * clamp01(1 - Math.abs(away) / 0.05);
  return [
    -(0.95 - 0.35 * t) * (1 - 0.6 * top),
    Math.sign(away) * (0.1 * (1 - t) + 0.9 * top),
    -0.1 - 0.8 * t - 0.35 * side,
  ];
};

/** Card hairstyle for `cardHair` (recipes/_lib/face/hair-cards.ts): swept-back hair, beard. */
export function humanCardHair() {
  const scalp = sculptField([headBlock(SPEC, 2)], { color: SPEC.skin, mirror: 'y' }).field;
  const base = hairEdits(scalp, 2);
  const field = sculptField([...base, { field: scalp, bounds: box }], {
    color: C.hairRoot,
    mirror: 'y',
  }).field;
  return {
    field,
    bounds: box,
    cell: 0.004,
    comb,
    // Long hair falls around the head block and the shoulders, never through them.
    collide: sculptField([headBlock(SPEC, 2), ...torsoEdits(L, TORSO)], {
      color: SPEC.skin,
      mirror: 'y',
    }).field,
    color: mix(C.hairRoot, C.hairTip, 0.3),
    layers: [
      // Base: dense cards hugging the mass, hiding it with strands.
      {
        name: 'hair_base',
        kind: 'hair',
        region: hairline,
        density: 9000,
        length: 0.055,
        width: 0.018,
        lift: 0.08,
        bend: 0.9,
        droop: 0.08,
      },
      // Volume: longer, a little lifted, swept back.
      {
        name: 'hair_top',
        kind: 'hair',
        region: hairline,
        density: 6500,
        length: 0.09,
        width: 0.014,
        lift: 0.12,
        bend: 0.85,
        droop: 0.12,
        clump: 4,
      },
      // Flyaways: thin, lifted, they break the outline.
      {
        name: 'hair_fly',
        kind: 'hair',
        region: hairline,
        density: 500,
        length: 0.07,
        width: 0.007,
        lift: 0.3,
        bend: 0.4,
        roll: 1.2,
      },
      {
        name: 'beard',
        kind: 'beard',
        region: beardline,
        density: 14000,
        length: 0.022,
        width: 0.009,
        lift: 0.35,
        bend: 0.6,
        droop: 0.4,
        clump: 3,
      },
      {
        name: 'moustache',
        kind: 'beard',
        region: moustacheline,
        density: 26000,
        length: 0.026,
        width: 0.008,
        lift: 0.2,
        bend: 0.5,
        droop: 0.5,
      },
    ] as const,
  };
}
