// Hair and beard for the face busts, sculpted against the warped scalp: the head is turned into a
// distance field (mesh-field.ts), a hair mass grows out of it inside a hairline that eases to zero
// thickness (no cap edge), and locks flow over it along hair-lines.ts — overlapping clumps on the
// scalp, a curtain mass under a long fall, beard locks and a moustache. One `hair` part.

import {
  dmath,
  type Field,
  type Mesh,
  type SculptEdit,
  sculpt,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { flowLocks, hairMass } from '../bust/hair.ts';
import { surface } from '../bust/kit.ts';
import { beardBody } from './hair-beard.ts';
import { type HairStyle, scalpLines } from './hair-lines.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { keepLarge } from './lod2.ts';
import { meshField } from './mesh-field.ts';
import { quadToMesh, stripUv } from './quad.ts';
import { segDist } from './relief.ts';

export type { HairStyle } from './hair-lines.ts';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

/** The head and neck (not the shoulders) as a distance field, and its box. */
export function scalpOf(head: FaceHead): { field: Field; box: [Vec3, Vec3] } {
  const s = head.scale;
  const neckZ = head.map(MIDLINE.menton)[2] - 0.09 * s;
  const q = head.mesh.q.filter((_, i, a) => {
    const f0 = i - (i % 4);
    for (let k = 0; k < 4; k++)
      if ((head.mesh.p[(a[f0 + k] ?? 0) * 3 + 2] ?? 0) < neckZ) return false;
    return true;
  });
  const skin = quadToMesh({ p: head.mesh.p, q }, () => [0.5, 0.5, 0.5], stripUv('plain'));
  const f = meshField(skin, 0.0045 * s, 4);
  const [lo, hi] = f.bounds;
  return {
    field: f.field,
    box: [
      [lo[0] - 0.03, lo[1] - 0.03, lo[2]],
      [hi[0] + 0.03, hi[1] + 0.03, hi[2] + 0.03],
    ],
  };
}

/** Hairline (≤ 0 inside): above a line from the forehead to the nape, above the ears at the
 *  sides; a crest keeps a narrow strip. */
export function hairlineOf(head: FaceHead, cut: HairStyle['cut']): Field {
  const s = head.scale;
  const fh = head.map(MIDLINE.forehead);
  const nape = head.map(MIDLINE.nape);
  const occ = head.map(MIDLINE.occiput);
  const earTop = head.map(LEFT.earTop);
  const earBack = head.map(LEFT.earBack);
  const tragion = head.map(LEFT.tragion);
  const euryon = head.map(LEFT.euryon);
  return (p) => {
    const t = (fh[0] - p[0]) / (fh[0] - occ[0]);
    // Not a ruled line: the temples recede (an M), and the edge wanders a few millimetres.
    const out = Math.min(1, Math.abs(p[1]) / (Math.abs(earTop[1]) || 1));
    const temple = 0.014 * s * out * out * Math.max(0, 1 - t * 2.5) * (cut === 'crest' ? 0 : 1);
    const wander = (dmath.sin(p[1] * 140 + 1.3) + dmath.sin(p[1] * 310)) * 0.0022 * s;
    // (The front line a brow's height above the brows: 4 cm lower it sat ON them, the fringe
    // hid the forehead and the eyebrows, and the face read as a mask under a bowl.)
    const line = lerp(fh[2] - 0.01 * s, nape[2] + 0.03 * s, t * t) + temple + wander;
    // Above the ear only behind its front edge: the temples follow the front line.
    const side =
      Math.abs(p[1]) > Math.abs(earTop[1]) * 0.78 &&
      p[0] > earBack[0] - 0.012 * s &&
      p[0] < tragion[0] + 0.004 * s;
    const ears = side ? earTop[2] + 0.006 * s - p[2] : -1;
    const strip = cut === 'crest' ? Math.abs(p[1]) - 0.03 * s : -1;
    // Keep 1.5 cm clear of each ear from its root to its (deformed) tip.
    const tr = p[1] >= 0 ? tragion : [tragion[0], -tragion[1], tragion[2]];
    const tp = head.earTips[p[1] >= 0 ? 0 : 1];
    const ear = 0.015 * s - segDist(p, tr as Vec3, tp);
    // Never outside the skull's own width: the back of a long ear's blade is further than that
    // from the root → tip line, and a lock rooted on it hangs in the air beside the head.
    const wide = Math.abs(p[1]) - Math.abs(euryon[1]) - 0.006 * s;
    return Math.max(line - p[2], ears, strip, ear, wide);
  };
}

/** Beard region (≤ 0 inside): below the cheek line, in front of the ears, round the mouth. */
export function beardlineOf(head: FaceHead): Field {
  const s = head.scale;
  const mouth = head.map(MIDLINE.stomionSup);
  const menton = head.map(MIDLINE.menton);
  const cheek = head.map(LEFT.cheek);
  const tragion = head.map(LEFT.tragion);
  const sub = head.map(MIDLINE.subnasale);
  return (p) => {
    const cheekZ = cheek[2] - 0.006 * s - (p[0] - cheek[0]) * 0.25;
    const hole = dmath.hypot((p[0] - mouth[0]) * 1.3, p[1], (p[2] - mouth[2]) * 2) - 0.022 * s;
    const front = tragion[0] - 0.006 * s - p[0];
    const throat = menton[2] - 0.035 * s - p[2];
    // Never inside the mouth cavity (the skin's field is positive in there too). (Down to the
    // lower lip's base only: reaching the menton it also took the chin, which sits behind the
    // lips' front, and left a bare pale patch between the lip and the beard.)
    const cavity = Math.min(
      mouth[0] - 0.006 * s - p[0],
      0.032 * s - Math.abs(p[1]),
      p[2] - (mouth[2] - 0.011 * s),
      sub[2] - p[2],
    );
    return Math.max(p[2] - cheekZ, front, -hole, throat, cavity);
  };
}

/** Scalp lock lines either side of a parting (degrees about the front–back axis; the gap past
 *  +8° is the parting) and each lock's width against the mean: no two neighbours alike. */
const LOCKS: readonly (readonly [number, number])[] = [
  [-72, 1.1],
  [-61, 0.8],
  [-52, 1.05],
  [-41, 0.75],
  [-32, 1.2],
  [-20, 0.9],
  [-10, 1.05],
  [0, 0.8],
  [17, 0.95],
  [27, 1.2],
  [38, 0.8],
  [49, 1.1],
  [58, 0.78],
  [69, 1.05],
];

/** The lock lines' angles (the hair's intended creases follow the same lines). */
export const LOCK_DEGS: readonly number[] = LOCKS.map(([deg]) => deg);

/** Long hair's fall as a solid mass (a curtain down the back, widening over the shoulders): the
 *  volume under the strand cards, and all that is left of the length at the far LOD. */
function fallMass(head: FaceHead, root: Vec3): SculptEdit[] {
  const s = head.scale;
  const occ = head.map(MIDLINE.occiput);
  const nape = head.map(MIDLINE.nape);
  // One broad curtain behind the neck, flat front to back, down to the shoulder line.
  return [
    {
      shape: 'ellipsoid',
      at: [occ[0] + 0.014 * s, 0, nape[2] - 0.045 * s],
      size: [0.026 * s, 0.085 * s, 0.12 * s],
      blend: 0.02 * s,
      color: root,
    },
  ];
}

/** The sculpted mass's tone against the hair's mid colour: close to the cards' own, so the hair
 *  reads as one mass with locks over it (at 0.62 of the root the gaps between cards were dark
 *  holes, and the cards read as chopped straw on a dark cap). */
const SHADE = 0.8;
/** The mass's tone against the hair's root colour under the lock-style cards (LOD0/1). */
const DEEP = 0.55;

export interface HairSculpt {
  readonly mesh: Mesh;
  /** The head with its hair mass (negative inside): what strand cards root on. */
  readonly field: Field;
  readonly box: [Vec3, Vec3];
}

/** The sculpted hair (the cap under the strand cards, the far LOD's whole hair) and its field. */
export function hairSculpt(head: FaceHead, st: HairStyle, lod: number): HairSculpt | null {
  const beard = st.beard === 'full';
  if (st.cut === 'none' && !beard) return null;
  const s = head.scale;
  const { field: scalp, box: head0 } = scalpOf(head);
  // Long hair falls past the neck: the box reaches the shoulders.
  const box: [Vec3, Vec3] =
    st.cut === 'long'
      ? [[head0[0][0] - 0.03 * s, head0[0][1] - 0.02 * s, head0[0][2] - 0.1 * s], head0[1]]
      : head0;
  const { tip } = st;
  // The mass is hair in the shade of the locks over it: a gap between cards reads as depth, not
  // as a flat patch of the root colour.
  const mid: Vec3 = [
    st.root[0] + (tip[0] - st.root[0]) * 0.35,
    st.root[1] + (tip[1] - st.root[1]) * 0.35,
    st.root[2] + (tip[2] - st.root[2]) * 0.35,
  ];
  const far: Vec3 = [mid[0] * SHADE, mid[1] * SHADE, mid[2] * SHADE];
  // Under the lock-style cards (LOD0/1) the mass is the root colour in shadow: the gaps between
  // locks read as depth. At 0.8 of the mid tone it showed through them as pale flat chips, and
  // its lock relief (toned toward the tip) as light patches. The far LOD keeps the mid tone.
  const root: Vec3 = lod < 2 ? [st.root[0] * DEEP, st.root[1] * DEEP, st.root[2] * DEEP] : far;
  const edits: SculptEdit[] = [];
  if (st.cut !== 'none') {
    // Thicker over the crown than a cap: the volume a head of hair has.
    const thick = (st.cut === 'crest' ? 0.022 : st.cut === 'long' ? 0.012 : 0.011) * s;
    const top: [Vec3, Vec3] = [
      [head.map(MIDLINE.occiput)[0] - 0.05 * s, box[0][1], head.map(MIDLINE.nape)[2]],
      [head.map(MIDLINE.forehead)[0] + 0.03 * s, box[1][1], box[1][2]],
    ];
    edits.push(hairMass(scalp, thick, hairlineOf(head, st.cut), top, root, 0.03 * s));
    if (st.cut === 'long') edits.push(...fallMass(head, root));
  }
  if (beard) {
    const menton = head.map(MIDLINE.menton);
    const _low: [Vec3, Vec3] = [
      [head.map(LEFT.tragion)[0] - 0.02 * s, box[0][1], menton[2] - 0.05 * s],
      [box[1][0], box[1][1], head.map(LEFT.cheek)[2] + 0.01 * s],
    ];
    // (No mass on the cheeks and the jaw: a slab of it showed between the cards there. The skin
    // under the beard is painted hair-dark instead (bust.ts), and the cards root on it.)
    edits.push(...beardBody(head, root, tip, lod));
  }
  const massField = sculptField([...edits, { field: scalp, bounds: box }], { color: root }).field;
  if (lod < 2) {
    const hair = surface(massField);
    const m = { root, tip: far, mirror: false };
    // Locks only where the hair grows (a line's start may be under the hairline).
    const line = hairlineOf(head, st.cut);
    const inside = (ls: Vec3[][]): Vec3[][] =>
      ls.map((l) => l.filter((p) => line(p) < -0.012 * s)).filter((l) => l.length >= 3);
    if (st.cut === 'short' || st.cut === 'long')
      for (const [deg, wide] of LOCKS)
        edits.push(...flowLocks(hair, inside(scalpLines(head, [deg])), 0.0068 * s * wide, m));
    if (st.cut === 'crest')
      edits.push(
        ...flowLocks(hair, inside(scalpLines(head, [-10, -5, 0, 5, 10], 20, 200)), 0.011 * s, m),
      );
    // (No sculpted ribbons down a long fall: at portrait distance they read as one flat slab
    // behind the ear; the fall is strand cards over the curtain mass.)
  }
  // Drop crumbs (a sliver cut off by the clearance round an ear tip).
  const mesh = keepLarge(
    sculpt({
      edits,
      // The strand cards carry the strand read at every LOD, so the mass under them is coarse:
      // it only has to hold the volume and the broad lock relief the cards lie on.
      resolution: [0.0075, 0.012, 0.017][lod] ?? 0.017,
      color: root,
      strip: 'plain',
    }),
    0.02,
  );
  return { mesh, field: massField, box };
}

export function hairMesh(head: FaceHead, st: HairStyle, lod: number): Mesh | null {
  return hairSculpt(head, st, lod)?.mesh ?? null;
}
