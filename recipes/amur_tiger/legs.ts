// Legs (left; the body sculpt mirrors): the bone chains through the real pivots, then the muscle
// masses a big cat is read from. Fore leg: steep scapula, shoulder forward, elbow back and tucked
// against the chest, a heavy vertical forearm (the grappling arm), short pastern sloping forward.
// Hind leg: high hip, stifle forward, long tibia back to the hock, near-vertical metatarsus —
// digitigrade, the hock at ~⅓ of the leg's height. Paws are paws.ts.

import { type Mesh, merge, place, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { spline } from '../_lib/creature/curve.ts';
import { blob, tubeMesh } from '../_lib/creature/lowpoly.ts';
import { type SkinNode, skin } from '../_lib/creature/skin.ts';
import { C } from './palette.ts';
import { pawEdits } from './paws.ts';
import { SK } from './skeleton.ts';

/** A limb chain through landmarks with radii per landmark, smoothed by a spline. */
export function limb(pts: readonly Vec3[], radii: readonly number[], per: number): SkinNode[] {
  const path = spline(pts, per);
  const n = path.length - 1;
  return path.map((at, i) => {
    const t = (i / n) * (radii.length - 1);
    const k = Math.floor(t);
    const a = radii[Math.min(k, radii.length - 1)] ?? 0.05;
    const b = radii[Math.min(k + 1, radii.length - 1)] ?? a;
    return { at, r: a + (b - a) * (t - k) };
  });
}

const f = SK.fore;
const h = SK.hind;

/** Bone + flesh chain of the fore leg: shoulder → elbow → wrist → top of the paw. */
export const foreChain = (per: number): SkinNode[] =>
  limb(
    [f.shoulder, f.elbow, f.wrist, [f.paw[0] - 0.01, f.paw[1], 0.075]],
    [0.09, 0.075, 0.052, 0.054],
    per,
  );

/** Hind leg: hip → stifle → hock → top of the paw. */
export const hindChain = (per: number): SkinNode[] =>
  limb([h.hip, h.knee, h.hock, [h.paw[0] - 0.01, h.paw[1], 0.075]], [0.1, 0.066, 0.04, 0.044], per);

/** Fore leg muscles (left). */
function foreLeg(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    ...(lod < 2 ? [skin(foreChain(lod === 0 ? 5 : 3), { blend: 0.05 })] : []),
    // Deltoid / shoulder point: the front of the shoulder joint.
    { shape: 'ellipsoid', at: [0.585, 0.137, 0.66], size: [0.07, 0.06, 0.08], blend: 0.05 },
    // Triceps: the big mass behind the upper arm, shoulder blade to the elbow.
    {
      shape: 'ellipsoid',
      at: [0.47, 0.142, 0.555],
      size: [0.095, 0.058, 0.13],
      rotate: [0, -32, 0],
      blend: 0.09,
    },
    // Forearm: extensors in front-outside, flexors behind; heavy, tapering to the wrist.
    {
      shape: 'ellipsoid',
      at: [0.44, 0.137, 0.33],
      size: [0.076, 0.068, 0.15],
      rotate: [0, -14, 0],
      blend: 0.05,
    },
    {
      shape: 'ellipsoid',
      at: [0.415, 0.132, 0.36],
      size: [0.05, 0.052, 0.1],
      rotate: [0, -14, 0],
      blend: 0.04,
    },
  ];
  if (lod < 2)
    // Elbow point (olecranon) behind, and the wrist knob.
    out.push(
      { shape: 'sphere', at: [0.37, 0.142, 0.455], size: 0.045, blend: 0.04 },
      { shape: 'ellipsoid', at: [0.47, 0.122, 0.15], size: [0.045, 0.048, 0.04], blend: 0.03 },
    );
  return out;
}

/** Hind leg muscles (left). */
function hindLeg(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    ...(lod < 2 ? [skin(hindChain(lod === 0 ? 5 : 3), { blend: 0.05 })] : []),
    // Thigh: quadriceps in front of the femur, hip to stifle.
    {
      shape: 'ellipsoid',
      at: [-0.54, 0.122, 0.62],
      size: [0.12, 0.068, 0.17],
      rotate: [0, -40, 0],
      blend: 0.07,
    },
    // Hamstrings: the back of the haunch, ischium down to below the stifle.
    {
      shape: 'ellipsoid',
      at: [-0.7, 0.107, 0.66],
      size: [0.1, 0.07, 0.16],
      rotate: [0, 20, 0],
      blend: 0.07,
    },
    // Gastrocnemius: the calf behind the tibia, tapering into the Achilles tendon.
    {
      shape: 'ellipsoid',
      at: [-0.63, 0.132, 0.4],
      size: [0.06, 0.048, 0.1],
      rotate: [0, 50, 0],
      blend: 0.05,
    },
    {
      shape: 'capsule',
      at: [-0.665, 0.127, 0.37],
      to: [-0.76, 0.112, 0.26],
      size: 0.022,
      blend: 0.055,
    },
  ];
  if (lod < 2)
    out.push(
      // Stifle (kneecap) and the hock point (calcaneus) standing out behind.
      { shape: 'sphere', at: [-0.455, 0.152, 0.505], size: 0.04, blend: 0.035 },
      { shape: 'sphere', at: [-0.76, 0.112, 0.26], size: 0.026, blend: 0.045 },
    );
  return out;
}

/** Both legs and their paws (left; the sculpt mirrors). */
export function legEdits(lod: number): SculptEdit[] {
  return [
    { group: [...foreLeg(lod), ...hindLeg(lod)], blend: 0.08 },
    ...(lod < 2 ? pawEdits(lod) : []),
  ];
}

/** Far LOD: both legs as tubes on the same chains + paw blobs, left and right (the sculpt keeps
 *  only the upper-leg muscles at LOD2; thin limbs would break up at its coarse cell). */
export function legsLowpoly(paint: (p: Vec3, c: Vec3) => Vec3): Mesh {
  const tube = (nodes: SkinNode[]): Mesh =>
    tubeMesh(
      nodes.map((n) => ({ at: n.at, r: n.r * 1.12 })),
      {
        sides: 6,
        colors: nodes.map((n) => paint([n.at[0], n.at[1] + n.r, n.at[2]], C.orange)),
      },
    );
  const pawBlob = (c: Vec3, r: Vec3): Mesh =>
    blob([c[0], c[1], r[2]], r, {
      rings: 3,
      sides: 6,
      color: paint([c[0], c[1] + r[1], 0.05], C.orange),
    });
  const left = merge([
    tube(foreChain(1)),
    tube(hindChain(1)),
    pawBlob([f.paw[0] + 0.02, f.paw[1], 0], [0.085, 0.075, 0.05]),
    pawBlob([h.paw[0] + 0.02, h.paw[1], 0], [0.08, 0.065, 0.048]),
  ]);
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}
