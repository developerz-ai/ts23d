// Strand cards over the sculpted hair of a face bust: the sculpt (hair.ts) is the cap and the far
// LOD, the cards carry the strand read, the soft hairline and the broken outline. One style per
// cut, written against the warped head so every race gets it in the right place: base clumps
// lying on the cap, swept locks away from a side parting, lifted crown locks, short wisps rooted
// along the hairline (they cover the cap's edge, so no bare band shows under it), flyaways; long
// hair adds falls over the shoulders, a crest stands, a beard hangs.

import { type CardLayer, type Field, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { beardlineOf, type HairSculpt, hairlineOf } from './hair.ts';
import { beardBody } from './hair-beard.ts';
import type { CardHairStyle } from './hair-cards.ts';
import type { HairStyle } from './hair-lines.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The card style for `cardHair`: roots on the sculpted hair `h`, falls round `collide` (the
 *  whole bust), or null when the head is bald and beardless. */
export function faceCardStyle(
  head: FaceHead,
  st: HairStyle,
  h: HairSculpt,
  collide: Field,
): CardHairStyle | null {
  const beard = st.beard === 'full';
  if (st.cut === 'none' && !beard) return null;
  const s = head.scale;
  const fh = head.map(MIDLINE.forehead);
  const occ = head.map(MIDLINE.occiput);
  const earTop = head.map(LEFT.earTop);
  const sub = head.map(MIDLINE.subnasale);
  const mouth = head.map(MIDLINE.stomionSup);
  const hairline = st.cut === 'none' ? (): number => 1 : hairlineOf(head, st.cut);
  const beardline = beard ? beardlineOf(head) : (): number => 1;
  const cheek = head.map(LEFT.cheek);
  // Beard cards root just below the cheek line (none may stray up over the lower lid) and all
  // over the beard's hanging body, down to its tip: no bare sculpt shows under them.
  const body = beard
    ? sculptField(beardBody(head, st.root, st.tip, 0), { color: st.root }).field
    : (): number => 1;
  const beardRoots: Field = (p) =>
    Math.min(Math.max(beardline(p), p[2] - (cheek[2] - 0.01 * s)), body(p) - 0.004 * s);
  // The parting sits on the head's left; hair leaves it sideways, then sweeps back and down.
  const part = 0.022 * s;
  const long = st.cut === 'long';
  const comb = (p: Vec3, n: Vec3): Vec3 => {
    if (beardline(p) < 0.004 * s || body(p) < 0.006 * s) {
      // Moustache out and down from under the nose; the beard straight down, a little forward.
      const lip = p[2] > mouth[2] && p[2] < sub[2] + 0.004 * s;
      return lip ? [0.2, Math.sign(p[1]) * 0.8, -0.6] : [0.22, Math.sign(p[1]) * 0.12, -1];
    }
    // A crest lies back along its ridge, rising a little: bristles, not a fan.
    if (st.cut === 'crest') return [-0.85, 0, 0.45];
    const t = clamp01((fh[0] - p[0]) / (fh[0] - occ[0]));
    const side = Math.abs(n[1]);
    const away = p[1] - part;
    const top = clamp01(n[2]) * clamp01(1 - Math.abs(away) / (0.05 * s));
    // Long hair above and in front of an ear's root is drawn back hard, not down: it passes
    // behind the ear, which stays in view (an elf's must at every LOD).
    const ear = long
      ? clamp01(1 - Math.hypot(p[0] - earTop[0], p[2] - earTop[2] - 0.03 * s) / (0.065 * s))
      : 0;
    return [
      -(long ? 1.25 : 0.95 - 0.35 * t) * (1 - 0.6 * top) - 0.7 * ear,
      // Long hair is combed straight back off the parting; a short cut is pushed to the side.
      Math.sign(away) * (0.12 * (1 - t) + (long ? 0.3 : 0.9) * top),
      // Up off the forehead first (the cap's front edge faces forward: a comb with no rise
      // there would lay the fringe down over the eyes), then back and down.
      0.6 * clamp01(1 - 3.5 * t) - 0.1 - 0.8 * t - (long ? 0.55 : 0.35) * side * (1 - 0.5 * ear),
    ];
  };
  const warm: Vec3 = [1.1, 1.02, 0.88];
  const layers: CardLayer[] = [];
  if (st.cut === 'short' || st.cut === 'long') {
    // Top locks long, sides and back short (short cut); long hair is long everywhere.
    const length = (p: Vec3): number => {
      const up = clamp01((p[2] - (earTop[2] + 0.01 * s)) / (0.05 * s));
      // Long hair: short at the brow (it is drawn back, not left to hang over the eyes).
      const t = clamp01((fh[0] - p[0]) / (fh[0] - occ[0]));
      // (Long enough to run from the brow over the crown: short cards there read as thatch.)
      return (long ? (0.12 + 0.05 * up) * (0.55 + 0.45 * clamp01(t * 3)) : 0.045 + 0.055 * up) * s;
    };
    // A long cut is drawn back clear of the ears (an elf's must show): no long card roots within
    // 4 cm of an ear, root to tip; only the short base clumps grow there.
    const tragion = head.map(LEFT.tragion);
    const nearEar = (p: Vec3): number => {
      const side = p[1] >= 0 ? 1 : -1;
      const a: Vec3 = [tragion[0], side * Math.abs(tragion[1]), tragion[2]];
      const b = head.earTips[side > 0 ? 0 : 1];
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const k = clamp01(
        ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2,
      );
      return (
        0.04 * s -
        Math.hypot(p[0] - a[0] - ab[0] * k, p[1] - a[1] - ab[1] * k, p[2] - a[2] - ab[2] * k)
      );
    };
    const grown: Field = long ? (p) => Math.max(hairline(p), nearEar(p)) : hairline;
    const crown: Field = (p) => Math.max(grown(p), earTop[2] + 0.035 * s - p[2]);
    layers.push(
      {
        name: 'hair_base',
        kind: 'hair',
        region: hairline,
        density: long ? 3600 : 5200,
        length: (p) => length(p) * 0.75,
        width: 0.026 * s,
        lift: 0.04,
        bend: 0.9,
        droop: 0.08,
        roll: long ? 0.08 : 0.2,
        fold: 0,
        tone: [0.5, 0.78],
        hug: 1,
      },
      {
        name: 'hair_mid',
        kind: 'hair',
        region: grown,
        density: long ? 3400 : 5000,
        length,
        width: 0.018 * s,
        lift: long ? 0.06 : 0.09,
        bend: 0.85,
        droop: 0.1,
        roll: long ? 0.15 : 0.35,
        fold: 0.55,
        clump: 3,
        tone: [0.72, 1.08],
        tint: warm,
        hug: 0.85,
      },
      {
        name: 'hair_top',
        kind: 'hair',
        region: crown,
        density: long ? 1000 : 1500,
        length: (p) => length(p) * 1.15,
        width: 0.013 * s,
        lift: long ? 0.09 : 0.15,
        bend: 0.8,
        droop: 0.12,
        roll: long ? 0.2 : 0.4,
        fold: 0.6,
        clump: 2,
        tone: [0.88, 1.2],
        tint: warm,
        hug: 0.6,
      },
      // Short fine strands on the edge band: the hair grows out of the skin, no cap edge.
      {
        name: 'hair_edge',
        kind: 'wisp',
        // (Dense enough to hide the mass's edge at the brow, flat enough not to bristle: 60 000
        // of them lifted off the skin stood round the head like a wreath.)
        region: (p) => Math.max(hairline(p) - 0.003 * s, -hairline(p) - 0.016 * s),
        density: 24000,
        length: 0.034 * s,
        width: 0.012 * s,
        lift: 0.025,
        bend: 0.8,
        droop: 0.05,
        roll: 0.3,
        fold: 0,
        tone: [0.6, 0.92],
        hug: 1,
      },
      {
        name: 'hair_fly',
        kind: 'wisp',
        region: hairline,
        density: long ? 0 : 240,
        length: 0.06 * s,
        width: 0.01 * s,
        lift: 0.16,
        bend: 0.45,
        roll: 0.6,
        fold: 0,
        tone: [0.9, 1.25],
        tint: warm,
        hug: 0.3,
      },
    );
    if (long) {
      // The fall: long locks from the sides and back, draped over the shoulders.
      // Rooted behind the ears only: a fall from the temples would hang in front of the face.
      const earBack = head.map(LEFT.earBack);
      const low: Field = (p) =>
        Math.max(grown(p), p[2] - (earTop[2] + 0.045 * s), p[0] - (earBack[0] + 0.004 * s));
      layers.push({
        name: 'hair_fall',
        kind: 'hair',
        region: low,
        density: 2400,
        length: (p) => (0.2 + 0.07 * clamp01((p[2] - earTop[2]) / (0.05 * s))) * s,
        width: 0.02 * s,
        lift: 0.05,
        bend: 0.9,
        droop: 0.55,
        roll: 0.3,
        fold: 0.5,
        clump: 3,
        tone: [0.7, 1.15],
        tint: warm,
        hug: 0.7,
      });
    }
  }
  if (st.cut === 'crest')
    layers.push(
      {
        name: 'crest',
        kind: 'beard',
        region: hairline,
        density: 16000,
        length: 0.04 * s,
        width: 0.012 * s,
        lift: 0.35,
        bend: 0.4,
        droop: 0.05,
        roll: 0.5,
        clump: 3,
        fold: 0.4,
        tone: [0.6, 1.25],
        hug: 0.3,
      },
      {
        name: 'crest_fly',
        kind: 'wisp',
        region: hairline,
        density: 3000,
        length: 0.03 * s,
        width: 0.01 * s,
        lift: 0.5,
        bend: 0.4,
        roll: 0.7,
        fold: 0,
        tone: [0.85, 1.35],
        hug: 0.2,
      },
    );
  if (beard)
    layers.push(
      {
        name: 'beard',
        kind: 'beard',
        region: beardRoots,
        density: 9000,
        length: 0.06 * s,
        width: 0.012 * s,
        lift: 0.3,
        bend: 0.6,
        droop: 0.45,
        clump: 3,
        fold: 0,
        tone: [0.6, 1.15],
        tint: warm,
      },
      // Short hair lying on the cheeks and the jaw: the beard's upper edge grows out of the
      // skin, with no bare band of the mass between the cheek line and the hanging locks.
      {
        name: 'beard_cheek',
        kind: 'beard',
        // (Lifted off the mass: cards hugging it at their 3 mm root sink lay buried in it.)
        region: beardline,
        density: 20000,
        length: 0.034 * s,
        width: 0.013 * s,
        lift: 0.22,
        bend: 0.7,
        droop: 0.4,
        fold: 0,
        tone: [0.6, 1.05],
        tint: warm,
        hug: 0.5,
      },
    );
  return {
    field: h.field,
    bounds: h.box,
    cell: 0.004 * s,
    comb,
    collide,
    color: mix(st.root, st.tip, 0.35),
    layers,
    ...(long ? { segments: 6 } : {}),
  };
}
