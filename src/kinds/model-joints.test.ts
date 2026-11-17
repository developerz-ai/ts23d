import { describe, expect, it } from 'bun:test';
import type { Bone, Vec3 } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { rigBones } from './creature-limits.ts';
import { FIXTURE_WOLF } from './model-fixtures.ts';
import { mapJoints, rigTopology } from './model-joints.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const plan = rigBones(bones, null, null).filter((b) => !b.name.endsWith('_mid'));

/** A rigger-like armature: nameless bones, a trunk of six, a head, two ear chains, four legs. */
function riggerBones(o: { legs?: number; swap?: boolean; wolf?: boolean } = {}): Bone[] {
  const out: Bone[] = [];
  const add = (head: Vec3, tail: Vec3, parent?: string): string => {
    const name = `bone_${out.length}`;
    out.push({ name, head, tail, ...(parent ? { parent } : {}) });
    return name;
  };
  const xs = [-0.3, -0.15, 0.05, 0.25, 0.4, 0.5, 0.58];
  let prev: string | undefined;
  const trunk: string[] = [];
  for (let i = 0; i < 6; i++) {
    prev = add([xs[i] ?? 0, 0, 0.6 + i * 0.03], [xs[i + 1] ?? 0, 0, 0.63 + i * 0.03], prev);
    trunk.push(prev);
  }
  // `wolf`: what UniRig returns for a wolf. The skull bone points up between the ears and carries
  // three leaves (ears, jaw); a four-bone tail hangs from the root; the fore legs have five bones.
  const skull = add([0.58, 0, 0.78], o.wolf ? [0.62, 0, 0.9] : [0.8, 0, 0.72], prev);
  if (o.wolf) {
    for (const y of [0.05, -0.05]) add([0.6, y, 0.86], [0.61, y * 1.4, 0.95], skull);
    add([0.66, 0, 0.74], [0.8, 0, 0.7], skull);
    let t = trunk[0];
    for (let i = 0; i < 4; i++)
      t = add([-0.32 - i * 0.02, 0, 0.6 - i * 0.1], [-0.34 - i * 0.02, 0, 0.5 - i * 0.1], t);
  } else
    for (const y of [0.05, -0.05])
      add(
        [0.6, y * 1.2, 0.86],
        [0.6, y * 1.4, 0.9],
        add([0.58, y, 0.8], [0.6, y * 1.2, 0.86], prev),
      );
  const leg = (x: number, y: number, parent: string | undefined): void => {
    let p = parent;
    if (o.wolf && x > 0) p = add([x - 0.03, y, 0.62], [x, y, 0.5], p);
    const zs = [0.5, 0.3, 0.12, 0.04, 0.01];
    for (let i = 0; i < 4; i++)
      p = add(
        [x + (i === 3 ? 0.02 : 0), y, zs[i] ?? 0],
        [x + (i === 3 ? 0.08 : 0.02), y, zs[i + 1] ?? 0],
        p,
      );
  };
  const side = o.swap ? -1 : 1;
  const all: [number, number, string | undefined][] = [
    [0.3, 0.08 * side, trunk[3]],
    [0.3, -0.08 * side, trunk[3]],
    [-0.28, 0.08, trunk[0]],
    [-0.28, -0.08, trunk[0]],
  ];
  // `swap` crosses the fore legs: the one rooted on the left ends on the right.
  for (const [x, y, parent] of all.slice(0, o.legs ?? 4)) leg(x, y, parent);
  if (o.swap) {
    const toe = out.find((b) => b.name === 'bone_14');
    if (toe) out[out.indexOf(toe)] = { ...toe, tail: [toe.tail[0], 0.2, toe.tail[2]] };
  }
  return out;
}

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

  it('refuses joints that land outside the mesh', () => {
    expect(() => mapJoints(plan, riggerBones(), (p) => p[2] > 0.2)).toThrow(
      /T3D_MODEL_SKELETON.*outside/,
    );
  });
});
