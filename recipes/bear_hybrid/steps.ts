// The bear's Blender program (task `blender`, examples/blender/README.md), built from the fit: it
// runs after `transform(fit)`, so every coordinate here is in the asset frame at real size, and
// the spheres, capsules and bones come from the rig TS fitted on the committed proxy (kinds
// `modelRig`). Every number is in the cache key. Each step and what it is for:
//   clean    weld the generator's duplicate vertices, drop its loose shells
//   unweb    the stub tail lies on the hind legs: cut the bridges, 2 cm apart
//   retopo   closed voxel shell → 30 k triangles, three times the density on the head and round
//            the hips (edge loops where the haunch bends), twice on the paws
//   uv, bake fresh UVs; the model's colour, relief and AO baked from the 890 k source
//   bind     bone heat on the fitted skeleton (the pose the generator made)
//   isolate  the tail's skin takes only the tail's bones and the rump none of them
//   weights  the paw bone's weights smoothed round each wrist: the plantigrade walk folds it 84°
//   repose   pose the bound mesh to the straight, symmetric rest (nothing is mirrored)
//   lods     10 k and 5 k triangles from the 30 k (same UVs, maps and weights)
//   export   one GLB: three LODs, albedo 2048², normal and ORM 1024², one skin

import type { BlenderStep, ModelRig } from '@developerz.ai/ts23d';

/** LOD triangles asked of Blender: budget.triangles (bear_hybrid.ts). LOD 2 keeps 5 000, as the
 *  wolf's: coarser, the haunch's triangles stretch past ×4 at the hip's limits (QA `deform`). */
export const TRIANGLES = [30000, 10000, 5000] as const;

/** Gap `unweb` leaves between the tail and the hind legs, metres: over 1.5 voxels of the shell
 *  (5.5 mm), so the remesh cannot fuse them again. */
const GAP = 0.02;

export const steps = (rig: ModelRig): readonly BlenderStep[] => {
  const h = rig.height;
  const paw = (leg: string) => ({ at: rig.at(`${leg}_3`), r: h * 0.11, weight: 2 });
  // Edge loops where the haunch bends: a coarse triangle across the hip stretched ×4.3–5.0 at
  // the joint's limits (QA `deform`, limit ×4) at twice the density; three times holds it.
  const hip = (leg: string) => ({ at: rig.at(`${leg}_0`), r: h * 0.22, weight: 3 });
  const focus = [
    { at: rig.at('head'), r: h * 0.28, weight: 3 },
    ...['fore_l', 'fore_r', 'hind_l', 'hind_r'].map(paw),
    ...['hind_l', 'hind_r'].map(hip),
  ];
  return [
    { op: 'clean' },
    ...(rig.limbs.length > 1 ? [{ op: 'unweb', limbs: rig.limbs, gap: GAP } as const] : []),
    { op: 'retopo', triangles: TRIANGLES[0], focus },
    { op: 'uv', kind: 'smart' },
    { op: 'bake', size: 2048, maps: ['albedo', 'normal', 'ao'] },
    { op: 'bind' },
    ...(rig.tail ? [{ op: 'isolate', ...rig.tail } as const] : []),
    // The plantigrade walk folds the wrist 84° back in swing. Bone heat puts a hard line across a
    // thick furred paw there, and the fold passes through the forearm: the weights of the paw
    // bone are smoothed round each wrist so the bend spreads over the joint.
    ...(['fore_l_2', 'fore_r_2'] as const).map(
      (bone): BlenderStep => ({
        op: 'weights',
        kind: 'smooth',
        bone,
        mask: { kind: 'sphere', at: rig.at(bone), r: h * 0.2, feather: h * 0.05 },
        iterations: 30,
      }),
    ),
    ...(rig.target ? [{ op: 'repose', to: rig.target } as const] : []),
    { op: 'lods', triangles: [TRIANGLES[1], TRIANGLES[2]], focus },
    { op: 'export', normalSize: 1024, ormSize: 1024 },
  ];
};
