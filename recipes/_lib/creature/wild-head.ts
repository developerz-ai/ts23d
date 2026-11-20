// The planes of a mammal's face over the creature kind's head block-out (wolf, fox, bear share
// it): the kind's head reads as one soft blob from muzzle to crown, so these forms break it into
// the planes an artist blocks first — a brow ridge shelving over each eye, the cheekbone
// (zygomatic arch) running back under it, the hollow between the eye and the muzzle — and paint
// the eye a dark rim, so it reads as an almond and not as a dot; and a velvet of short face cards
// (`faceFur`) so the face between the kind's guard hairs is not painted plastic. Head-local
// (+X to the nose, origin at the atlas, left = +Y; the sculpt mirrors them), sized from the eye.

import {
  type CreatureInfo,
  dmath,
  type Lod,
  type SculptEdit,
  strandCells,
  type Vec3,
} from '@developerz.ai/ts23d';
import { smooth } from './wild-paint.ts';
import type { GroomLayer } from './wild-parts.ts';

type Head = CreatureInfo['head'];

export interface FacePlanes {
  /** Brow ridge proud of the socket, × the eyeball radius (default 0.9). */
  readonly brow?: number;
  /** Cheekbone proud of the face, × the eyeball radius (default 0.75). */
  readonly cheek?: number;
  /** Depth of the hollow in front of and under the eye, × the eyeball radius (default 0.5). */
  readonly hollow?: number;
  /** The dark rim painted round the eye (lid margin and the fur ring), linear RGB; null = none. */
  readonly rim?: Vec3 | null;
  /** Rim size, × the eyeball radius (default 1.5). */
  readonly rimSize?: number;
  /**
   * The length every other number multiplies, metres (default the eyeball radius). A small eye
   * on a big head (a bear's) sizes the planes off the head instead: forms under two sculpt cells
   * fold into creases and never read.
   */
  readonly unit?: number;
  /** Sculpt the brow, cheekbone and hollow (default true); false paints the rim only. */
  readonly forms?: boolean;
}

/** The face's planes as sculpt edits, in the order the head's own forms take them. */
export function facePlanes(l: Head, o: FacePlanes = {}): SculptEdit[] {
  const [ex, ey, ez] = l.eye.centre;
  const r = o.unit ?? l.eye.r;
  const brow = (o.brow ?? 0.9) * r;
  const cheek = (o.cheek ?? 0.75) * r;
  const hollow = (o.hollow ?? 0.5) * r;
  const out: SculptEdit[] = [];
  if (o.forms !== false)
    out.push(
      // Brow ridge: a shelf over the eye, longer than it is tall, sloping down toward the stop.
      {
        shape: 'ellipsoid',
        at: [ex - 0.3 * r, ey * 0.92, ez + 1.05 * r],
        size: [2 * r, 1.1 * r, brow],
        rotate: [0, 12, -8],
        blend: 0.7 * r,
      },
      // Cheekbone: the zygomatic arch running back from under the eye toward the ear.
      {
        shape: 'ellipsoid',
        at: [ex - 1.9 * r, ey * 1.02 + 0.2 * r, ez - 1.15 * r],
        size: [2.6 * r, cheek, 0.7 * r],
        rotate: [0, -6, 4],
        blend: 0.8 * r,
      },
      // The hollow between the eye and the muzzle: the plane change under the stop.
      {
        shape: 'ellipsoid',
        at: [ex + 1.6 * r, ey * 1.08 + 0.35 * r, ez - 0.55 * r],
        size: [1.3 * r, hollow + 0.25 * r, 0.75 * r],
        op: 'subtract',
        blend: 0.6 * r,
      },
    );
  if (o.rim !== null) {
    const s = (o.rimSize ?? 1.5) * l.eye.r;
    // The rim: lid margin and the ring of short dark fur round the eye, stretched to an almond
    // toward the nose (the canthus line), so the eye reads at the hero's distance.
    out.push({
      shape: 'ellipsoid',
      at: [ex + 0.25 * l.eye.r, ey, ez],
      size: [s * 1.25, s, s * 0.8],
      op: 'paint',
      blend: 0.4 * l.eye.r,
      color: o.rim ?? [0.03, 0.025, 0.022],
    });
  }
  return out;
}

export interface FaceFur {
  /** Cards per m² of face (LOD0; LOD1 grows none: the kind's own head cards carry it there). */
  readonly density: number;
  /** Card length on the muzzle and over the crown, metres. */
  readonly length: readonly [number, number];
  /** Card width, metres. */
  readonly width: number;
}

/**
 * A velvet of short cards over the face (a `Wild.groom` head layer, head-local), off the kind's
 * bare skin (nose leather, eye rims, lips): the kind's own head cards are sparse guard hairs, so
 * between them the face read as smooth painted plastic. Combed back from the nose and out over
 * the cheeks, so the hair's lie draws the face's planes.
 */
export function faceFur(
  info: CreatureInfo,
  lod: Lod,
  o: FaceFur,
): { head: GroomLayer[]; comb: (p: Vec3) => Vec3 } {
  const l = info.head;
  const skin = info.bare;
  const d = (p: Vec3, q: Vec3): number =>
    dmath.hypot(p[0] - q[0], Math.abs(p[1]) - Math.abs(q[1]), p[2] - q[2]);
  const bare = (p: Vec3): boolean =>
    d(p, skin.nose) < skin.noseR * 1.5 ||
    d(p, skin.eye) < skin.eyeR * 1.35 ||
    (p[0] > skin.muzzle && Math.abs(p[2] - skin.lips) < skin.noseR * 0.5) ||
    (skin.ears !== undefined && p[2] > skin.ears);
  const comb = (p: Vec3): Vec3 => [-1, Math.sign(p[1]) * 0.35, -0.1];
  if (lod !== 0) return { head: [], comb };
  const [muzzle, crown] = o.length;
  return {
    head: [
      {
        name: 'face-velvet',
        density: (p) => (bare(p) ? 0 : o.density),
        length: (p) => muzzle + (crown - muzzle) * smooth(l.lc * 1.1, l.lc * 0.4, p[0]),
        width: o.width,
        lift: 0.3,
        bend: 0.6,
        droop: 0.02,
        roll: 0.3,
        cells: strandCells('fur_clumps', 'fur'),
        tone: [0.72, 1.3],
        sink: 0.002,
        segments: 2,
      },
    ],
    comb,
  };
}
