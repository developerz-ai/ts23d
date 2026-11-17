import { describe, expect, it } from 'bun:test';
import type { Bone, Vec3 } from '../core/index.ts';
import { applySimilarity, type Similarity, yawSimilarity } from '../primitives/index.ts';
import { creaturePlan } from './creature.ts';
import { rigBones } from './creature-limits.ts';
import { applyFit } from './model-fit.ts';
import { jointsFit } from './model-fit-joints.ts';
import { capsuleCreature, FIXTURE_WOLF, riggerBones } from './model-fixtures.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const body = capsuleCreature(bones);
const plan = rigBones(bones, null, null);
const moveBones = (rig: readonly Bone[], sim: Similarity): Bone[] =>
  rig.map((b) => ({
    ...b,
    head: applySimilarity(sim, b.head),
    tail: applySimilarity(sim, b.tail),
  }));
const midOf = (rig: readonly Bone[], a: string, b: string): Vec3 => {
  const [p, q] = [rig.find((x) => x.name === a)?.head, rig.find((x) => x.name === b)?.head];
  return [0, 1, 2].map((k) => ((p?.[k] ?? 0) + (q?.[k] ?? 0)) / 2) as [number, number, number];
};

describe('jointsFit', () => {
  it('refuses an armature with a limb missing', () => {
    expect(() => jointsFit(body, bones, riggerBones({ legs: 3 }))).toThrow(
      /T3D_MODEL_SKELETON.*3 limb chain/,
    );
  });

  it('recovers yaw and scale of a model turned 90° about Z and 1.7× too big', () => {
    const away: Similarity = { ...yawSimilarity(90), s: 1.7, t: [0.4, -0.3, 0.25] };
    const rig = moveBones(riggerBones(), away);
    const fit = jointsFit(applyFit(body, away), bones, rig);
    expect(Math.abs(fit.yaw + 90)).toBeLessThan(2);
    // The scale sets the mean hip and shoulder height over the lowest joint (0.5 − 0.01 m in the
    // fixture, 1.7× here) to the plan's.
    const want =
      (midOf(plan, 'hind_l_0', 'hind_r_0')[2] + midOf(plan, 'fore_l_0', 'fore_r_0')[2]) / 2;
    expect(fit.scale).toBeCloseTo(want / (0.49 * 1.7), 3);
    const placed = moveBones(rig, fit.similarity);
    // The head end faces +X.
    expect(midOf(placed, 'bone_7', 'bone_11')[0]).toBeGreaterThan(
      midOf(placed, 'bone_15', 'bone_19')[0],
    );
  });

  it('lands the lowest skin under the feet on the ground', () => {
    const away: Similarity = { ...yawSimilarity(200), s: 0.6, t: [0, 0, 3] };
    const fit = jointsFit(applyFit(body, away), bones, moveBones(riggerBones(), away));
    const placed = applyFit(applyFit(body, away), fit.similarity);
    let low = Infinity;
    for (let i = 2; i < placed.positions.length; i += 3)
      low = Math.min(low, placed.positions[i] ?? 0);
    // The fixture's rigger and capsule body are not one animal: the soles are found within a
    // paw's length of the foot joints, so the body's lowest point is near, not at, zero.
    expect(Math.abs(low)).toBeLessThan(0.05 * bones.height);
  });
});
