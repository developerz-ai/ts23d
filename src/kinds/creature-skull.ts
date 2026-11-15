// Skull forms of the creature head that bridge the block-out to the neck and the jaw (head-local:
// origin at the atlas, +X along the skull, left = +Y, mirrored): the zygomatic arch, masseter,
// temporalis and occiput; the top of the neck inside the head (oval, its front end inside the
// skull behind the jaw angle, so the head grows out of the neck instead of sitting on it); and the
// lower jaw as its own part pivoting at the temporomandibular hinge.

import type { Vec3 } from '../core/index.ts';
import type { SculptEdit } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import type { Block } from './creature-head.ts';
import { blob, skin } from './creature-skin.ts';

/** Jaw hinge (temporomandibular joint), head-local, left: under the zygomatic arch's root. */
export const jawHinge = (l: Pick<Block, 'lc' | 'W' | 'H'>): Vec3 => [
  0.3 * l.lc,
  0.3 * l.W,
  -0.12 * l.H,
];

/** The lower jaw (its own part, pivoting at the hinge): ramus from the hinge, both mandibles to
 *  the chin, under the muzzle. Head-local; both halves are sculpted and blended, so the mirrored
 *  sculpt's fold at y = 0 leaves no crease under the chin. */
export function jawEdits(l: Block): SculptEdit[] {
  const { L, W, H, lc, rt, zt } = l;
  const half = (s: number): SculptEdit =>
    skin([
      { at: [jawHinge(l)[0], jawHinge(l)[1] * s, jawHinge(l)[2]], r: 0.09 * H },
      { at: [0.5 * lc, 0.28 * W * s, -0.26 * H], r: 0.13 * H },
      { at: [lc, 0.18 * W * s, zt - rt * 0.7], r: 0.1 * H },
      { at: [L - 2.2 * rt, 0.04 * W * s, zt - rt * 0.85], r: rt * 0.55 },
    ]);
  return [{ group: [half(1), { ...half(-1), blend: 0.05 * L }], kernel: 'cubic' }];
}

/** Skull masses that bridge braincase, cheek and neck: the zygomatic arch under the eye, the
 *  masseter over the jaw's ramus, the temporalis filling the braincase side, the occiput. */
export function skullForms(l: Block): SculptEdit[] {
  const { W, H, lc } = l;
  return [
    {
      shape: 'roundCone',
      at: [0.78 * lc, 0.36 * W, -0.02 * H],
      to: [0.3 * lc, 0.42 * W, -0.08 * H],
      size: [0.05 * H, 0.07 * H],
      blend: 0.03 * H,
      kernel: 'cubic',
    },
    blob([0.42 * lc, 0.34 * W, -0.2 * H], [0.24 * lc, 0.12 * W, 0.17 * H], 0.05 * H, [0, -20, 0]),
    blob([0.3 * lc, 0.3 * W, 0.16 * H], [0.32 * lc, 0.12 * W, 0.2 * H], 0.06 * H),
    blob([-0.05 * lc, 0, 0.18 * H], [0.16 * lc, 0.22 * W, 0.16 * H], 0.06 * H),
  ];
}

/** The top of the neck inside the head: an oval section along the neck's own direction, its
 *  front end inside the skull behind the jaw angle, so the head grows out of the neck. */
export function neckStub(b: Bones, l: Block): SculptEdit[] {
  const h = b.head;
  const prev = b.neck[b.neck.length - 2];
  const last = b.neck[b.neck.length - 1];
  if (!prev || !last) return [];
  const c = Math.cos(h.pitch);
  const s = Math.sin(h.pitch);
  const dx = prev.at[0] - h.atlas[0];
  const dz = prev.at[2] - h.atlas[2];
  // World → head-local (inverse of headToWorld's pitch).
  const back: Vec3 = v3.norm([c * dx - s * dz, 0, s * dx + c * dz]);
  const front: Vec3 = [0.15 * l.lc, 0, -0.12 * l.H];
  const r = (last.r + prev.r) / 2;
  // A fixed stub (a neck radius behind the atlas), so it does not bridge a neck that stops short.
  const end = v3.mul(back, Math.min(v3.len([dx, 0, dz]) * 0.55, r * 1.2));
  const u = v3.sub(end, front);
  return [
    {
      shape: 'ellipsoid',
      at: v3.lerp(front, end, 0.5),
      size: [r * 0.9, r, v3.len(u) / 2 + r * 0.4],
      // Long axis (local Z) along the neck, pitched in the head's sagittal plane.
      rotate: [0, (Math.atan2(u[0], u[2]) * 180) / Math.PI, 0],
      blend: r * 0.5,
      kernel: 'cubic',
    },
  ];
}
