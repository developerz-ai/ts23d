// Wing shoulders (bat / pterosaur anatomy): a scapula plate on the upper back behind the
// forelegs, the flight-muscle (pectoral / deltoid) mass wrapping it, and the humeral boss the wing
// articulates on — all part of the body sculpt, so the shoulder is smooth-unioned into the back.
// The outer end of the boss is split off as its own static part (`shoulder_l` / `_r`), sharing
// the body's field: the declared joint wing ↔ shoulder then compares a humerus with its socket,
// not with the whole torso. Far LOD: the socket is a short tapered tube.

import { type Field, type Mesh, place, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { v3 } from '../_lib/creature/curve.ts';
import { skinTube } from '../_lib/creature/lowpoly.ts';
import { roundCone, skin } from '../_lib/creature/skin.ts';
import { C } from './palette.ts';
import { SK } from './skeleton.ts';

const W = SK.wing;
/** Humerus direction (unit), shoulder → elbow, left wing. */
export const HUMERUS: Vec3 = v3.norm(v3.sub(W.elbow, W.root));
/** The shoulder joint: where the wing's humerus leaves its socket (left). */
export const JOINT: Vec3 = v3.add(W.root, v3.mul(HUMERUS, 0.17));
/** Humerus radius at the joint; the socket matches it. */
export const JOINT_R = 0.15;

/** Shoulder forms for the body sculpt (left; the sculpt mirrors). */
export function shoulderEdits(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    // Scapula: a flat plate on the upper back, tilted toward the spine.
    {
      shape: 'ellipsoid',
      at: [0.6, 0.3, 2.06],
      size: [0.44, 0.2, 0.15],
      rotate: [-18, 6, -10],
      blend: 0.15,
    },
    // Flight muscle: from the chest up over the shoulder into the boss.
    {
      shape: 'ellipsoid',
      at: [0.72, 0.47, 1.88],
      size: [0.32, 0.2, 0.26],
      rotate: [-30, 0, 0],
      blend: 0.16,
    },
    // Humeral boss: the socket the wing turns in, tapering to the joint.
    skin(
      [
        { at: v3.sub(JOINT, v3.mul(HUMERUS, 0.32)), r: 0.23 },
        { at: v3.sub(JOINT, v3.mul(HUMERUS, 0.12)), r: 0.18 },
        { at: JOINT, r: JOINT_R },
      ],
      { blend: 0.12, color: C.back },
    ),
  ];
  if (lod < 2)
    // Scapular spine: a ridge along the plate, the crease muscles hang from.
    out.push({
      shape: 'capsule',
      at: [0.86, 0.28, 2.16],
      to: [0.42, 0.36, 2.12],
      size: 0.035,
      blend: 0.06,
    });
  return out;
}

/** The socket region (negative inside): a capsule along the humerus around the boss's end. */
export function socketRegion(grow: number, side: 1 | -1 = 1): Field {
  const flip = (p: Vec3): Vec3 => [p[0], p[1] * side, p[2]];
  return roundCone(
    flip(v3.sub(JOINT, v3.mul(HUMERUS, 0.28))),
    flip(v3.add(JOINT, v3.mul(HUMERUS, 0.25))),
    0.19 + grow,
    0.19 + grow,
  );
}

/** Both sockets as one region (the body's hole), symmetric. */
export const socketsRegion = (grow: number): Field => {
  const l = socketRegion(grow, 1);
  return (p) => l([p[0], Math.abs(p[1]), p[2]]);
};

/** Box around the left socket region (for meshing the plug alone). */
export function socketBounds(side: 1 | -1): [Vec3, Vec3] {
  const a = v3.sub(JOINT, v3.mul(HUMERUS, 0.28));
  const b = v3.add(JOINT, v3.mul(HUMERUS, 0.25));
  const r = 0.3;
  const ys = [a[1] * side, b[1] * side];
  return [
    [Math.min(a[0], b[0]) - r, Math.min(...ys) - r, Math.min(a[2], b[2]) - r],
    [Math.max(a[0], b[0]) + r, Math.max(...ys) + r, Math.max(a[2], b[2]) + r],
  ];
}

/** Far LOD socket: a tapered tube from inside the back to the joint (left). */
export function socketLowpoly(side: 1 | -1): Mesh {
  const m = skinTube(
    [
      { at: v3.sub(JOINT, v3.mul(HUMERUS, 0.3)), r: 0.22 },
      { at: JOINT, r: JOINT_R },
    ],
    { sides: 6, color: C.back },
  );
  return side === 1 ? m : place(m, { scale: [1, -1, 1] });
}
