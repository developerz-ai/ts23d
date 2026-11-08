// Torso + neck: the trunk sculpt the legs, paws and tail stump fuse into (one mirrored sculpt, so
// every join is a smooth blend). Sculpted in stages, each its own function:
//   block-out  ribcage barrel, loin, pelvis; the neck as a thick skin into the back of the head
//   planes     laterally compressed flanks (a cat is deep and narrow), a level back
//   features   scapulae rolling under the skin at the withers, the deep brisket and pectorals
//              between the forelegs, the costal arch, tucked waist, the loose primordial belly
//              fold, gluteals and the croup sloping to the tail root, the winter nape mane
//   (no carved creases: QA connections showed them as glued seams; the folds come from blends)

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { skin, tube } from '../_lib/creature/skin.ts';
import { SK } from './skeleton.ts';

type E3 = readonly [number, number, number];
const mass = (s: { at: E3; r: E3 }, blend: number): SculptEdit => ({
  shape: 'ellipsoid',
  at: s.at,
  size: s.r,
  blend,
});

/** Block-out: the three trunk masses and the neck. */
export function blockOut(): SculptEdit[] {
  return [
    mass(SK.chest, 0),
    mass(SK.ribs, 0.14),
    mass(SK.loin, 0.12),
    mass(SK.pelvis, 0.1),
    skin(
      SK.neck.map((at, i) => ({ at, r: SK.neckR[i] ?? 0.13 })),
      { blend: 0.08 },
    ),
  ];
}

/** Planes: none on the trunk — a cat's back and flanks are round; the narrow, deep trunk comes
 *  from the masses' radii (tried: scraped flanks and a skimmed back read as a box). */
export function planes(): SculptEdit[] {
  return [];
}

/** Features: the landmarks and muscle groups the body is read from. */
export function features(lod: number): SculptEdit[] {
  const f = SK.fore;
  const out: SculptEdit[] = [
    // Scapula: a long flat blade on the ribs, top at the withers, rolling under the skin.
    {
      shape: 'ellipsoid',
      at: [0.49, 0.135, 0.8],
      size: [0.085, 0.05, 0.17],
      rotate: [0, -28, 0],
      blend: 0.14,
    },
    // Withers: the scapula tops standing proud of the spine.
    {
      shape: 'ellipsoid',
      at: [f.scapula[0], 0.075, f.scapula[2] - 0.035],
      size: [0.1, 0.06, 0.055],
      blend: 0.06,
    },
    // Brisket: the deep keel of the chest running down between the forelegs.
    { shape: 'ellipsoid', at: [0.47, 0, 0.5], size: [0.2, 0.1, 0.1], blend: 0.1 },
    // Pectorals: forward of the forelegs, the chest's front plane.
    {
      shape: 'ellipsoid',
      at: [0.62, 0.075, 0.58],
      size: [0.1, 0.08, 0.14],
      rotate: [0, 15, 0],
      blend: 0.08,
    },
    // Ribcage side: the widest point behind the shoulder.
    { shape: 'ellipsoid', at: [0.12, 0.07, 0.67], size: [0.28, 0.088, 0.18], blend: 0.1 },
    // Loose primordial belly fold hanging between the legs (more toward the hind legs).
    { shape: 'ellipsoid', at: [-0.3, 0, 0.52], size: [0.22, 0.105, 0.07], blend: 0.1 },
    // Gluteals: the rump's round masses either side of the sacrum.
    {
      shape: 'ellipsoid',
      at: [-0.68, 0.085, 0.8],
      size: [0.17, 0.075, 0.12],
      rotate: [0, 18, 0],
      blend: 0.07,
    },
    // Croup → tail root: the tail leaves the top of the rump.
    skin(
      // The stump runs on past the root inside the tail, so the tail leaves it tangentially.
      tube([SK.pelvis.at, [-0.76, 0, 0.84], SK.tailRoot, [-0.9, 0, 0.77]], (t) => 0.1 - 0.054 * t),
      { blend: 0.08 },
    ),
    // Winter mane on the nape: long fur at the top of the neck (Geptner & Sludskij: 70–110 mm).
    skin(
      [
        { at: [0.45, 0, 0.92], r: 0.07 },
        { at: [0.6, 0, 0.9], r: 0.076 },
        { at: [0.72, 0, 0.86], r: 0.08 },
      ],
      { blend: 0.07 },
    ),
    // Throat: the ventral neck fur hanging under the jaw (winter: 70–95 mm).
    {
      shape: 'ellipsoid',
      at: [0.7, 0, 0.62],
      size: [0.1, 0.085, 0.09],
      rotate: [0, 30, 0],
      blend: 0.08,
    },
  ];
  if (lod < 2)
    out.push(
      // Spine: the dorsal line as a soft ridge (the dark dorsal stripe sits on it).
      skin(
        tube(
          SK.spine.map((p): Vec3 => [p[0], p[1], p[2] - 0.045]),
          () => 0.04,
        ),
        { blend: 0.08 },
      ),
    );
  return out;
}
