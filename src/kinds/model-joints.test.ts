import { describe, expect, it } from 'bun:test';
import type { Bone } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { rigBones } from './creature-limits.ts';
import { FIXTURE_WOLF, riggerBones } from './model-fixtures.ts';
import { mapJoints, rigTopology } from './model-joints.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const plan = rigBones(bones, null, null).filter((b) => !b.name.endsWith('_mid'));

describe('rigTopology', () => {
  it('refuses a rig with a missing limb', () => {
    expect(() => rigTopology(riggerBones({ legs: 3 }))).toThrow(
      /T3D_MODEL_SKELETON.*3 four-bone limb/,
    );
  });

  it('refuses crossed limbs', () => {
    expect(() => rigTopology(riggerBones({ swap: true }))).toThrow(/T3D_MODEL_SKELETON.*crossed/);
  });

  it('does not take a four-bone tail for the missing limb', () => {
    expect(() => rigTopology(riggerBones({ legs: 3, wolf: true }))).toThrow(
      /T3D_MODEL_SKELETON.*3 four-bone limb/,
    );
  });

  it('reads five-bone fore limbs, a skull with ear and jaw leaves and a tail chain', () => {
    const t = rigTopology(riggerBones({ wolf: true }));
    expect(t.head.name).toBe('bone_6');
    expect(t.trunk).toHaveLength(6);
    expect(t.limbs.fore_l).toHaveLength(4);
    expect(t.limbs.fore_l[0]?.head).toEqual([0.3, 0.08, 0.5]);
    expect(t.scapulae.l?.head).toEqual([0.27, 0.08, 0.62]);
    expect(t.scapulae.r?.tail).toEqual([0.3, -0.08, 0.5]);
    expect(t.limbs.hind_l[0]?.head).toEqual([-0.28, 0.08, 0.5]);
  });

  it('finds the trunk, the head and the four limbs by shape, not by name', () => {
    const t = rigTopology(riggerBones());
    expect(t.trunk.map((b) => b.name)).toEqual([
      'bone_0',
      'bone_1',
      'bone_2',
      'bone_3',
      'bone_4',
      'bone_5',
    ]);
    expect(t.head.name).toBe('bone_6');
    expect(t.limbs.fore_l[0]?.head).toEqual([0.3, 0.08, 0.5]);
    expect(t.limbs.hind_r[3]?.tail[1]).toBe(-0.08);
  });
});

describe('mapJoints', () => {
  it("keeps the plan's names, parents and order and takes the rigger's positions", () => {
    const mapped = mapJoints(plan, riggerBones(), () => true);
    expect(mapped.map((b) => [b.name, b.parent])).toEqual(plan.map((b) => [b.name, b.parent]));
    const at = (n: string): Bone | undefined => mapped.find((b) => b.name === n);
    expect(at('fore_l_0')?.head).toEqual([0.3, 0.08, 0.5]);
    expect(at('fore_l_0')?.tail).toEqual(at('fore_l_1')?.head);
    expect(at('hind_r_3')?.tail).toEqual([-0.2, -0.08, 0.01]);
    expect(at('head')?.head).toEqual([0.58, 0, 0.78]);
    expect(at('spine_0')?.head).toEqual([-0.3, 0, 0.6]);
    // Scapulae end on the mapped shoulders; the tail keeps its traced joints, hung from the croup.
    expect(at('scapula_l')?.tail).toEqual(at('fore_l_0')?.head);
    expect(at('tail_2')).toEqual(plan.find((b) => b.name === 'tail_2'));
    expect(at('tail_0')?.head).toEqual(at('spine_0')?.head);
    // The head joint is the rigger's; the direction and length are the fit's.
    const was = plan.find((b) => b.name === 'head');
    const now = at('head');
    expect((now?.tail[0] ?? 0) - (now?.head[0] ?? 0)).toBeCloseTo(
      (was?.tail[0] ?? 0) - (was?.head[0] ?? 0),
      9,
    );
  });

  it("takes the scapula from a five-bone fore limb's first bone", () => {
    const mapped = mapJoints(plan, riggerBones({ wolf: true }), () => true);
    const at = (n: string): Bone | undefined => mapped.find((b) => b.name === n);
    expect(at('scapula_r')?.head).toEqual([0.27, -0.08, 0.62]);
    expect(at('scapula_r')?.tail).toEqual(at('fore_r_0')?.head);
    expect(at('fore_r_0')?.head).toEqual([0.3, -0.08, 0.5]);
  });

  it('with `nose`, a rig whose trunk ends at the snout gets its head bone from the skull base to the nose', () => {
    const was = plan.find((b) => b.name === 'head');
    const tip = was?.tail ?? [0, 0, 0];
    const long = Math.hypot(...[0, 1, 2].map((k) => (was?.tail[k] ?? 0) - (was?.head[k] ?? 0)));
    // The rigger's head joint moved onto the traced nose tip: its trunk now ends at the snout.
    const rig = riggerBones().map((b) => (b.name === 'bone_6' ? { ...b, head: tip } : b));
    const at = (bones: readonly Bone[], n: string): Bone | undefined =>
      bones.find((b) => b.name === n);
    // Failure first: without the option the bone starts at the snout and runs a head past it.
    const blind = at(
      mapJoints(plan, rig, () => true),
      'head',
    );
    expect(blind?.head).toEqual(tip);
    // With it the head starts at a trunk joint at least half a head behind the nose and ends there.
    const head = at(
      mapJoints(plan, rig, () => true, '', undefined, true),
      'head',
    );
    const back = Math.hypot(...[0, 1, 2].map((k) => (tip[k] ?? 0) - (head?.head[k] ?? 0)));
    expect(back).toBeGreaterThanOrEqual(long * 0.5);
    expect(head?.tail).toEqual(tip);
    // And where the mesh ends before the traced tip, the bone ends at the skin.
    const cut = at(
      mapJoints(plan, rig, (p) => p[0] < tip[0] - 0.03, '', undefined, true),
      'head',
    );
    expect(cut?.tail[0] ?? 9).toBeLessThan(tip[0]);
    expect(cut?.tail[0] ?? 0).toBeGreaterThan(head?.head[0] ?? 0);
  });

  it('with `nose`, refuses a head bone that leaves the mesh before its first sample', () => {
    const tip = plan.find((b) => b.name === 'head')?.tail ?? [0, 0, 0];
    const rig = riggerBones().map((b) => (b.name === 'bone_6' ? { ...b, head: tip } : b));
    const whole = mapJoints(plan, rig, () => true, '', undefined, true);
    const from = whole.find((b) => b.name === 'head')?.head ?? [0, 0, 0];
    // The mesh ends a hair past the head's own joint: no sample along the bone is inside.
    expect(() => mapJoints(plan, rig, (p) => p[0] <= from[0] + 1e-4, '', undefined, true)).toThrow(
      /T3D_MODEL_SKELETON.*leaves the mesh at once/,
    );
  });

  it('refuses joints that land outside the mesh', () => {
    expect(() => mapJoints(plan, riggerBones(), (p) => p[2] > 0.2)).toThrow(
      /T3D_MODEL_SKELETON.*outside/,
    );
  });
});
