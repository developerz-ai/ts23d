// Human hair and beard as sculpted locks: a swept-back hair mass inside a rounded hairline with
// clumps flowing front → crown → nape and grooves between them, a lifted front lock; a clipped
// beard mass along the jaw with downward locks and a drooping moustache of two locks.
// Card hair (`hairBaseEdits` + `humanCardHair`): the masses, painted hair colour, are the scalp
// layer; strand cards root on the skull (`bustScalp`) inside a landmark hairline and lie in four
// layers (dark base clumps flat on the cap, swept mid locks from a left side parting round a crown
// whorl, a few long top locks for volume, flyaways), then the beard and moustache.

import { type Field, type SculptEdit, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import type { BustRecipe } from '../_lib/bust/bust.ts';
import { flowLocks, hairMass, lock, mix } from '../_lib/bust/hair.ts';
import { C, H, L, SK, TORSO } from '../_lib/bust/human/spec.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';
import { browLayers, withBrowComb } from '../_lib/face/brows.ts';
import { bustHairFields, type CardHairStyle, skullHairline } from '../_lib/face/hair-cards.ts';

/** The torso (neck, trapezius) the hair and beard must stop short of. */
const neck: Field = sculptField(torsoEdits(L, TORSO), { color: C.skin, mirror: 'y' }).field;

/** Where the hair grows on the skull: trichion 4.6 cm above the glabella, receding temples, the
 *  nape line 2.4 cm above the nape landmark, 1.2 cm of skin round each ear. */
const scalpLine: Field = skullHairline(SK, {
  front: 0.046,
  nape: 0.024,
  ear: 0.012,
  temple: 0.012,
});

/** Hairline: the skull line, and 12 mm short of the neck and trapezius so the nape edge never
 *  folds into them. */
export const hairline: Field = (p) => Math.max(scalpLine(p), 0.012 - neck(p));

/** The cap sits 8 mm inside the hairline: its edge is under the hairline cards, not on show. */
const capline: Field = (p) => hairline(p) + 0.008;

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
  // A 6 mm colour blend: the cap's edge on the skin is soft, not a stair-stepped line.
  const mass = { ...hairMass(scalp, 0.008, capline, box, C.hairRoot, 0.045), blend: 0.006 };
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

/** The parting's y (the man's left) and the crown whorl the back hair turns round. */
const PART = 0.03;
const WHORL: Vec3 = [SK.occiput[0] + 0.045, -0.012, SK.crown[2] - 0.012];

/** Swept back from the hairline, away from a side parting, turning round the crown whorl and
 *  falling at the nape and sides; beard downward, moustache out and down. */
const comb = (p: Vec3, n: Vec3): Vec3 => {
  if (moustacheline(p) < 0.004) return [0.2, Math.sign(p[1]) * 0.8, -0.6];
  if (beardline(p) < 0.004) return [0.25, Math.sign(p[1]) * 0.15, -1];
  const t = clamp01((SK.glabella[0] - p[0]) / (SK.glabella[0] - SK.occiput[0]));
  const side = Math.abs(n[1]);
  // Side parting: hair leaves the part line sideways, then sweeps back and down.
  const away = p[1] - PART;
  const top = clamp01(n[2]) * clamp01(1 - Math.abs(away) / 0.05);
  const base: Vec3 = [
    -(0.95 - 0.35 * t) * (1 - 0.6 * top),
    Math.sign(away) * (0.12 * (1 - t) + 0.9 * top),
    -0.1 - 0.8 * t - 0.35 * side,
  ];
  // Crown whorl: a clockwise swirl about the normal within ~4 cm of it.
  const r: Vec3 = [p[0] - WHORL[0], p[1] - WHORL[1], p[2] - WHORL[2]];
  const w = Math.max(0, 1 - Math.hypot(r[0], r[1], r[2]) / 0.04) ** 2;
  const swirl: Vec3 = [
    n[1] * r[2] - n[2] * r[1],
    n[2] * r[0] - n[0] * r[2],
    n[0] * r[1] - n[1] * r[0],
  ];
  const sl = Math.hypot(swirl[0], swirl[1], swirl[2]) || 1;
  const k = (w * 1.5) / sl;
  return [
    base[0] * (1 - w) + swirl[0] * k,
    base[1] * (1 - w) + swirl[1] * k,
    base[2] * (1 - w) + swirl[2] * k,
  ];
};

/** Top locks are long, sides and back short (a swept-back cut, 5–11 cm). */
const length = (p: Vec3): number => {
  const up = clamp01((p[2] - (SK.euryon[2] - 0.01)) / 0.05);
  return 0.05 + 0.06 * up;
};

/** Card hairstyle for `cardHair` (recipes/_lib/face/hair-cards.ts) on the human bust `b`. */
export function humanCardHair(b: BustRecipe, lod: number): CardHairStyle {
  // Roots on the finished head (cap, beard mass and all), falling round it.
  const { skin } = bustHairFields(b, lod);
  const warm: Vec3 = [1.08, 1.0, 0.86];
  return {
    field: skin,
    bounds: box,
    cell: 0.004,
    comb: withBrowComb(comb, SK, H),
    collide: skin,
    color: mix(C.hairRoot, C.hairTip, 0.3),
    layers: [
      // Base: dark clumps lying flat on the painted cap, hiding the scalp.
      {
        name: 'hair_base',
        kind: 'hair',
        region: hairline,
        density: 5000,
        length: (p: Vec3) => length(p) * 0.75,
        width: 0.026,
        lift: 0.04,
        bend: 0.9,
        droop: 0.08,
        roll: 0.2,
        fold: 0,
        tone: [0.45, 0.7],
        hug: 1,
      },
      // Mid: the swept locks, clumped in threes, curved across their width.
      {
        name: 'hair_mid',
        kind: 'hair',
        region: hairline,
        density: 5200,
        length,
        width: 0.018,
        lift: 0.09,
        bend: 0.85,
        droop: 0.1,
        roll: 0.35,
        fold: 0.55,
        clump: 3,
        tone: [0.7, 1.05],
        tint: warm,
        hug: 0.85,
      },
      // Top: a few longer locks over the crown for volume.
      {
        name: 'hair_top',
        kind: 'hair',
        region: (p: Vec3) => Math.max(hairline(p), SK.euryon[2] + 0.015 - p[2]),
        density: 1400,
        length: (p: Vec3) => length(p) * 1.15,
        width: 0.013,
        lift: 0.14,
        bend: 0.8,
        droop: 0.12,
        roll: 0.4,
        fold: 0.6,
        clump: 2,
        tone: [0.85, 1.15],
        tint: warm,
        hug: 0.6,
      },
      // Hairline: short fine strands rooted on the edge band, softening the cap's edge.
      {
        name: 'hair_edge',
        kind: 'wisp',
        region: (p: Vec3) => Math.max(hairline(p), -hairline(p) - 0.012),
        density: 30000,
        length: 0.03,
        width: 0.012,
        lift: 0.06,
        bend: 0.8,
        droop: 0.05,
        roll: 0.3,
        fold: 0,
        tone: [0.6, 0.9],
        hug: 1,
      },
      // Flyaways: stray strands, lifted, they break the outline.
      {
        name: 'hair_fly',
        kind: 'wisp',
        region: hairline,
        density: 220,
        length: 0.06,
        width: 0.01,
        lift: 0.14,
        bend: 0.45,
        roll: 0.6,
        fold: 0,
        tone: [0.9, 1.2],
        tint: warm,
        hug: 0.3,
      },
      {
        name: 'beard',
        kind: 'beard',
        region: beardline,
        density: 22000,
        length: 0.022,
        width: 0.009,
        lift: 0.35,
        bend: 0.6,
        droop: 0.4,
        clump: 3,
        fold: 0,
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
        fold: 0,
      },
      ...browLayers(SK, H),
    ],
  };
}
