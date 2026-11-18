// Body-plan weights: each chain copy's skin may follow only its own bones and the one bone it hangs
// from, so arms that nearly touch at the base never pull each other (`skinWeights` with `only`).
// The flesh of a bone is a tapered capsule with the chain's radii (the wider of the section's two
// half-axes), and the falloff follows the chain's own link length. At most 4 influences.

import type { Mesh, Vec3 } from '../core/index.ts';
import { merge, Ts23dError } from '../core/index.ts';
import { skinWeights, type WeightBone } from '../passes/index.ts';
import { chainCurve, linkStops } from './body-plan-curve.ts';
import { type BodyPiece, chainSpecOf } from './body-plan-mesh.ts';
import type { BodyPlan, ChainSpec, PlanChain } from './body-plan-types.ts';

/** Falloff as a share of the mean link length: neighbours blend, bones two away barely do. */
const BLEND_PER_LINK = 0.35;

function chainFlesh(c: ChainSpec, chain: PlanChain): WeightBone[] {
  const curve = chainCurve(c);
  const stops = linkStops(c.links, c.bias);
  const wide = Math.max(1, c.flatten ?? 1);
  return chain.links.map((l, i): WeightBone => {
    const head: Vec3 = l.bone.head;
    const tail: Vec3 = l.bone.tail;
    return {
      a: head,
      b: tail,
      r1: curve.at(stops[i] ?? 0).r * wide,
      r2: curve.at(stops[i + 1] ?? 1).r * wide,
    };
  });
}

/** Every bone's flesh capsule, in `plan.bones` order. */
export function bodyPlanFlesh(plan: BodyPlan): WeightBone[] {
  const index = new Map(plan.bones.map((b, i) => [b.name, i]));
  const flesh: WeightBone[] = plan.bones.map((b) => ({ a: b.head, b: b.tail }));
  for (const chain of plan.chains) {
    const c = chainSpecOf(plan, chain);
    if (!c) continue;
    chainFlesh(c, chain).forEach((f, i) => {
      const at = index.get(chain.links[i]?.bone.name ?? '');
      if (at !== undefined) flesh[at] = f;
    });
  }
  return flesh;
}

/** Bone indices of the named chain copies, with the bone each hangs from. */
export function chainBoneIndices(plan: BodyPlan, ids: readonly string[]): number[] {
  const index = new Map(plan.bones.map((b, i) => [b.name, i]));
  const out = new Set<number>();
  for (const id of ids) {
    const chain = plan.chains.find((c) => c.id === id);
    if (!chain)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `body plan '${plan.name}' has no chain '${id}'`,
        fix: `use one of: ${plan.chains.map((c) => c.id).join(', ')}`,
      });
    for (const l of chain.links) out.add(index.get(l.bone.name) ?? 0);
    const up = index.get(chain.links[0]?.bone.parent ?? '');
    if (up !== undefined) out.add(up);
  }
  return [...out];
}

/** Skinned, merged body: one mesh, joints indexing `plan.bones`. */
export function bodyPlanSkin(plan: BodyPlan, pieces: readonly BodyPiece[]): Mesh {
  const index = new Map(plan.bones.map((b, i) => [b.name, i]));
  const flesh = bodyPlanFlesh(plan);
  const out = pieces.map((p) => {
    const own = p.chain.links.flatMap((l) => index.get(l.bone.name) ?? []);
    const up = index.get(p.chain.links[0]?.bone.parent ?? '');
    const spec = chainSpecOf(plan, p.chain);
    const extra = plan.chains
      .filter((c) => spec?.weightWith?.includes(c.spec))
      .flatMap((c) => c.links.flatMap((l) => index.get(l.bone.name) ?? []));
    const only = [...own, ...(up === undefined ? [] : [up]), ...extra];
    const mean = p.chain.length / Math.max(1, p.chain.links.length);
    return skinWeights(p.mesh, flesh, { blend: mean * BLEND_PER_LINK, only });
  });
  if (out.length === 0)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `body plan '${plan.name}' has no surface to skin`,
      fix: 'build the pieces with bodyPlanPieces(plan, lod, look) first',
    });
  return merge(out);
}
