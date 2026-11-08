// Hair and beard for the face busts, sculpted against the warped scalp: the head is turned into a
// distance field (mesh-field.ts), a hair mass grows out of it inside a hairline that eases to zero
// thickness (no cap edge), and locks flow over it along hair-lines.ts — overlapping clumps on the
// scalp, flat ribbons falling to the shoulders, beard locks and a moustache. One `hair` part.

import {
  type Field,
  type Mesh,
  type SculptEdit,
  sculpt,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { flowLocks, hairMass, lock, ribbon } from '../bust/hair.ts';
import { surface } from '../bust/kit.ts';
import { beardBody } from './hair-beard.ts';
import { beardLines, fallLines, type HairStyle, moustacheLines, scalpLines } from './hair-lines.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { keepLarge } from './lod2.ts';
import { meshField } from './mesh-field.ts';
import { quadToMesh, stripUv } from './quad.ts';

export type { HairStyle } from './hair-lines.ts';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

/** Distance from p to the segment ab. */
function segDist(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = (ab[0] ?? 0) ** 2 + (ab[1] ?? 0) ** 2 + (ab[2] ?? 0) ** 2 || 1;
  const t = Math.min(
    1,
    Math.max(
      0,
      ((p[0] - a[0]) * (ab[0] ?? 0) + (p[1] - a[1]) * (ab[1] ?? 0) + (p[2] - a[2]) * (ab[2] ?? 0)) /
        l2,
    ),
  );
  return Math.hypot(
    p[0] - a[0] - (ab[0] ?? 0) * t,
    p[1] - a[1] - (ab[1] ?? 0) * t,
    p[2] - a[2] - (ab[2] ?? 0) * t,
  );
}

/** The head and neck (not the shoulders) as a distance field, and its box. */
function scalpOf(head: FaceHead): { field: Field; box: [Vec3, Vec3] } {
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
  return (p) => {
    const t = (fh[0] - p[0]) / (fh[0] - occ[0]);
    const line = lerp(fh[2] - 0.042 * s, nape[2] + 0.03 * s, t * t);
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
    return Math.max(line - p[2], ears, strip, ear);
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
    const hole = Math.hypot((p[0] - mouth[0]) * 1.3, p[1], (p[2] - mouth[2]) * 2) - 0.022 * s;
    const front = tragion[0] - 0.006 * s - p[0];
    const throat = menton[2] - 0.035 * s - p[2];
    // Never inside the mouth cavity (the skin's field is positive in there too).
    const cavity = Math.min(
      mouth[0] - 0.006 * s - p[0],
      0.032 * s - Math.abs(p[1]),
      p[2] - (menton[2] + 0.012 * s),
      sub[2] - p[2],
    );
    return Math.max(p[2] - cheekZ, front, -hole, throat, cavity);
  };
}

export function hairMesh(head: FaceHead, st: HairStyle, lod: number): Mesh | null {
  const beard = st.beard === 'full';
  if (st.cut === 'none' && !beard) return null;
  const s = head.scale;
  const { field: scalp, box } = scalpOf(head);
  const { root, tip } = st;
  const edits: SculptEdit[] = [];
  if (st.cut !== 'none') {
    const thick = (st.cut === 'crest' ? 0.022 : st.cut === 'long' ? 0.01 : 0.008) * s;
    const top: [Vec3, Vec3] = [
      [head.map(MIDLINE.occiput)[0] - 0.05 * s, box[0][1], head.map(MIDLINE.nape)[2]],
      [head.map(MIDLINE.forehead)[0] + 0.03 * s, box[1][1], box[1][2]],
    ];
    edits.push(hairMass(scalp, thick, hairlineOf(head, st.cut), top, root, 0.03 * s));
  }
  if (beard) {
    const menton = head.map(MIDLINE.menton);
    const low: [Vec3, Vec3] = [
      [head.map(LEFT.tragion)[0] - 0.02 * s, box[0][1], menton[2] - 0.05 * s],
      [box[1][0], box[1][1], head.map(LEFT.cheek)[2] + 0.01 * s],
    ];
    edits.push(hairMass(scalp, 0.011 * s, beardlineOf(head), low, root, 0.045 * s));
    edits.push(...beardBody(head, root, tip, lod));
  }
  if (lod < 2) {
    const hair = surface(
      sculptField([...edits, { field: scalp, bounds: box }], { color: root }).field,
    );
    const m = { root, tip, mirror: false };
    // Locks only where the hair grows (a line's start may be under the hairline).
    const line = hairlineOf(head, st.cut);
    const inside = (ls: Vec3[][]): Vec3[][] =>
      ls.map((l) => l.filter((p) => line(p) < -0.012 * s)).filter((l) => l.length >= 3);
    if (st.cut === 'short' || st.cut === 'long')
      edits.push(
        ...flowLocks(
          hair,
          inside(scalpLines(head, [-66, -55, -44, -33, -22, -11, 0, 11, 22, 33, 44, 55, 66])),
          0.0072 * s,
          m,
        ),
      );
    if (st.cut === 'crest')
      edits.push(
        ...flowLocks(hair, inside(scalpLines(head, [-10, -5, 0, 5, 10], 20, 200)), 0.011 * s, m),
      );
    if (st.cut === 'long')
      for (const f of fallLines(head)) {
        const pts = f.pts;
        edits.push(
          ...ribbon(pts, f.facing, [0.026 * s, 0.016 * s], [0.0075 * s, 0.0042 * s], root, tip, {
            strands: 3,
            mirror: false,
          }),
        );
      }
    if (beard) {
      for (const l of beardLines(head)) {
        const pts = [hair.off(l[0] ?? [0, 0, 0], -0.004 * s), ...l.slice(1)];
        edits.push(...lock(pts, 0.0078 * s, 0.0026 * s, root, tip, { mirror: false }));
      }
      for (const l of moustacheLines(head))
        edits.push(...lock(l, 0.0088 * s, 0.0026 * s, root, tip, { mirror: false }));
    }
  }
  // Drop crumbs (a sliver cut off by the clearance round an ear tip).
  return keepLarge(
    sculpt({
      edits,
      resolution: [0.003, 0.0042, 0.012][lod] ?? 0.012,
      color: root,
      strip: 'plain',
    }),
    0.02,
  );
}
