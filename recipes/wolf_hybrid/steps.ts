// The wolf's Blender program (task `blender`, examples/blender/README.md), built from the fit: it
// runs after `transform(fit)`, so every coordinate here is in the asset frame at real size, and
// the spheres, capsules and bones come from the rig TS fitted on the committed proxy (kinds
// `modelRig`). Every number is in the cache key. Each step and what it is for:
//   clean    weld the generator's 187 k duplicate vertices, drop its 25 loose shells
//   unweb    the tail hangs fused to the hocks and the fore paws touch: cut the bridges, 2 cm apart
//   retopo   closed voxel shell → 30 k triangles, three times the density on the head, twice on
//            the paws (the silhouette and the ground contact are read there first) and twice
//            round the hips (edge loops where the haunch bends)
//   uv, bake fresh UVs; the model's colour, relief and AO baked from the 900 k source
//   bind     bone heat on the fitted skeleton (the pose the generator made)
//   isolate  the tail's skin takes only the tail's bones and the rump none of them: bone heat
//            reads nearness, and a tail on the hocks is as near the leg bones as its own
//   repose   pose the bound mesh to the straight, symmetric rest (the head turned 27° comes onto
//            the sagittal plane with its own two sides; nothing is mirrored)
//   lods     10 k and 5 k triangles from the 30 k (same UVs, maps and weights)
//   export   one GLB: three LODs, albedo 2048², normal and ORM 1024², one skin

import type { BlenderStep, ModelRig } from '@developerz.ai/ts23d';

/** LOD triangles asked of Blender: budget.triangles (wolf_hybrid.ts). LOD 2 keeps 5 000: at
 *  2 500 the haunch's coarse triangles stretch ×4.1 at the hip's limits (QA `deform`, limit ×4). */
export const TRIANGLES = [30000, 10000, 5000] as const;

/** Gap `unweb` leaves between the tail and the hocks, metres: over 1.5 voxels of the shell
 *  (5.5 mm), so the remesh cannot fuse them again. */
const GAP = 0.02;

export const steps = (rig: ModelRig): readonly BlenderStep[] => {
  const h = rig.height;
  const paw = (leg: string) => ({ at: rig.at(`${leg}_3`), r: h * 0.11, weight: 2 });
  // Edge loops where the haunch bends: a coarse triangle across the hip stretches past ×4 at the
  // joint's limits on LOD 1 and 2 (QA `deform`); twice the density round both hips holds it.
  const hip = (leg: string) => ({ at: rig.at(`${leg}_0`), r: h * 0.16, weight: 2 });
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
    ...(rig.target ? [{ op: 'repose', to: rig.target } as const] : []),
    { op: 'lods', triangles: [TRIANGLES[1], TRIANGLES[2]], focus },
    { op: 'export', normalSize: 1024, ormSize: 1024 },
  ];
};
