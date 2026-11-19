// QA `skin`, crossed limbs (D72): below a paired limb's wrist or hock (`<limb>_l_2` / `<limb>_r_2`)
// no vertex may carry weight of BOTH sides' chains. Skin there is a forearm, a shin or a paw: one
// leg's. Weight from the other leg makes that paw follow both, so feet standing close drag each
// other along in the walk (bone heat reached across the 2 cm between a dragon's fore toes).
// Higher up (brisket, groin) the two legs' skin really meets and shared weights are allowed.
// A pair that stands on its roots (raised wings; core limb-pairs.ts `raised`) is read the other
// way up: one side's above its wrist, shared where the two meet the back.
// Model-built parts only (their own texture set, ADR 016): their limbs are cut apart before
// retopo (`unweb`), so a crossed paw is a defect a recipe can fix. A code-built creature's
// close paws are still one webbed surface from the sculpt's smooth union (the wolf's hind
// paws: D73, open), which weights alone cannot part.

import {
  type CompiledAsset,
  CROSS_SHARE,
  type LimbPair,
  limbPairs,
  type Part,
  SKIN_INFLUENCES,
  toWorld,
  worldTransforms,
} from '../core/index.ts';
import type { Finding } from './types.ts';

function partCrossings(
  p: Part,
  limbs: readonly LimbPair[],
  xf: ReturnType<typeof worldTransforms>,
): Finding[] {
  const m = p.mesh;
  const t = xf.get(p.name);
  const J = m?.joints;
  const W = m?.weights;
  if (!m || !J || !W || !t) return [];
  const n = m.positions.length / 3;
  return limbs.flatMap(({ limb, l, r, below, raised }) => {
    let count = 0;
    let first = -1;
    for (let v = 0; v < n; v++) {
      const z = toWorld(t, [
        m.positions[v * 3] ?? 0,
        m.positions[v * 3 + 1] ?? 0,
        m.positions[v * 3 + 2] ?? 0,
      ])[2];
      if (raised ? z <= below : z >= below) continue;
      let wl = 0;
      let wr = 0;
      for (let s = 0; s < SKIN_INFLUENCES; s++) {
        const j = J[v * SKIN_INFLUENCES + s] ?? 0;
        const w = W[v * SKIN_INFLUENCES + s] ?? 0;
        if (l.has(j)) wl += w;
        if (r.has(j)) wr += w;
      }
      if (wl < CROSS_SHARE || wr < CROSS_SHARE) continue;
      count++;
      if (first < 0) first = v;
    }
    if (count === 0) return [];
    return [
      {
        gate: 'skin',
        code: 'T3D_SKIN_CROSSED',
        part: p.name,
        message: `T3D_SKIN_CROSSED part '${p.name}': ${count} vertices ${raised ? 'above' : 'below'} ${below.toFixed(3)} m (the ${limb} joint 2) carry weight of both ${limb}_l and ${limb}_r (first: vertex ${first}); those paws move with both legs`,
        fix: `give each ${limb} paw its own leg only below the wrist/hock: a Blender 'weights' step (kind 'scale', value 0) on the other side's ${limb} bones in a box round each paw, or keep the paws further apart before bind`,
      },
    ];
  });
}

/** Findings for every skinned model-built part of `asset` (none without a skeleton or paired
 *  limbs). */
export function crossedLimbFindings(asset: CompiledAsset): Finding[] {
  const sk = asset.skeleton;
  if (!sk) return [];
  const limbs = limbPairs(sk.bones);
  if (limbs.length === 0) return [];
  const xf = worldTransforms(asset.parts);
  return asset.parts.filter((p) => p.textures).flatMap((p) => partCrossings(p, limbs, xf));
}
