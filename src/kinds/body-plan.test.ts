// bodyPlan: bad specs are refused with a fix; good ones give named bones along the arc, parents
// across chains, and motion axes that hold along a chain and turn with radial or mirrored copies.

import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec3 } from '../core/index.ts';
import { bodyPlan } from './body-plan.ts';
import { HYDRA, OCTOPUS, SHARK } from './body-plan-fixtures.ts';
import type { BodyPlanSpec, ChainSpec, PlanChain } from './body-plan-types.ts';
import { rotate, v3 } from './creature-curve.ts';

const trunk: ChainSpec = {
  name: 'spine',
  path: [
    [1, 0, 1],
    [0, 0, 1],
    [-1, 0, 1],
  ],
  radius: [0.1, 0.2, 0.05],
  links: 4,
};
const fin: ChainSpec = {
  name: 'fin',
  parent: { chain: 'spine', link: 1 },
  path: [
    [0.4, 0.1, 1],
    [0.3, 0.6, 0.9],
  ],
  radius: [0.1, 0.01],
  links: 2,
};
const plan = (chains: readonly ChainSpec[]): BodyPlanSpec => ({ name: 'p', length: 2, chains });
const chainOf = (id: string, spec: BodyPlanSpec): PlanChain | undefined =>
  bodyPlan(spec).chains.find((c) => c.id === id);
const near = (a: Vec3 | undefined, b: Vec3, eps = 1e-9): void => {
  [0, 1, 2].forEach((k) => {
    expect(Math.abs((a?.[k as 0 | 1 | 2] ?? Infinity) - b[k as 0 | 1 | 2])).toBeLessThan(eps);
  });
};

describe('bodyPlan refuses', () => {
  const refused: readonly (readonly [string, BodyPlanSpec, RegExp])[] = [
    ['a name not in snake_case', { ...plan([trunk]), name: 'Bad Name' }, /snake_case/],
    [
      'a repeated child sharing the root chain name',
      plan([trunk, { ...fin, name: 'spine', repeat: { kind: 'mirror' } }]),
      /two chains are named 'spine'/,
    ],
    [
      'a bias that collapses link joints onto the tip',
      plan([{ ...trunk, links: 40, bias: 20 }]),
      /collapse/,
    ],
    ['no chains', plan([]), /no chains/],
    ['a chain name not in snake_case', plan([{ ...trunk, name: 'Spine' }]), /snake_case/],
    ['one station', plan([{ ...trunk, path: [[0, 0, 0]], radius: [0.1] }]), /station/],
    ['radii that do not match', plan([{ ...trunk, radius: [0.1] }]), /3 stations but 1 radii/],
    ['zero links', plan([{ ...trunk, links: 0 }]), /0 links/],
    ['a parent on the root', plan([{ ...trunk, parent: { chain: 'x', link: 0 } }]), /root chain/],
    ['a repeated root', plan([{ ...trunk, repeat: { kind: 'mirror' } }]), /repeated/],
    ['an unparented child', plan([trunk, { ...trunk, name: 'loose' }]), /no parent/],
    [
      'an unknown parent',
      plan([trunk, { ...fin, parent: { chain: 'nope', link: 0 } }]),
      /unknown chain 'nope'/,
    ],
    [
      'a parent listed later',
      plan([trunk, { ...fin, parent: { chain: 'late', link: 0 } }, { ...fin, name: 'late' }]),
      /unknown chain 'late'/,
    ],
    [
      'a link past the end',
      plan([trunk, { ...fin, parent: { chain: 'spine', link: 4 } }]),
      /link 4/,
    ],
    [
      'a radial count under 2',
      plan([
        trunk,
        { ...fin, repeat: { kind: 'radial', count: 1, axis: [0, 0, 1], about: [0, 0, 0] } },
      ]),
      /radial count/,
    ],
    [
      'an unrepeated child of a repeated chain',
      plan([
        trunk,
        { ...fin, repeat: { kind: 'mirror' } },
        { ...fin, name: 'barb', parent: { chain: 'fin', link: 0 } },
      ]),
      /not repeated the same way/,
    ],
    [
      'names that collide as bones',
      plan([trunk, { ...fin, repeat: { kind: 'mirror' } }, { ...fin, name: 'fin_l' }]),
      /two chains make bone 'fin_l_0'/,
    ],
  ];
  for (const [what, spec, message] of refused)
    it(what, () => {
      expect(() => bodyPlan(spec)).toThrow(Ts23dError);
      expect(() => bodyPlan(spec)).toThrow(message);
    });

  it('says how to fix it', () => {
    try {
      bodyPlan(plan([{ ...trunk, links: 0 }]));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Ts23dError);
      expect((e as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
      expect((e as Ts23dError).fix.length).toBeGreaterThan(0);
    }
  });
});

describe('bodyPlan bones', () => {
  it('names bones per chain, parents first, the root on the first link', () => {
    const p = bodyPlan(plan([trunk, fin]));
    expect(p.bones.map((b) => b.name)).toEqual([
      'spine_0',
      'spine_1',
      'spine_2',
      'spine_3',
      'fin_0',
      'fin_1',
    ]);
    expect(p.root).toBe('spine_0');
    expect(p.bones[0]?.parent).toBeUndefined();
    expect(p.bones[4]?.parent).toBe('spine_1');
    expect(p.bones[5]?.parent).toBe('fin_0');
    expect(chainOf('spine', plan([trunk]))?.length).toBeCloseTo(2, 3);
  });

  it('spaces links evenly by arc, and bias packs them toward the tip', () => {
    const even = chainOf('spine', plan([trunk]))?.links.map((l) => l.s) ?? [];
    expect(even[0]).toBe(0);
    expect(even[2]).toBeCloseTo(0.5, 9);
    const packed = chainOf('spine', plan([{ ...trunk, bias: 2 }]))?.links ?? [];
    expect(packed[0]?.length ?? 0).toBeGreaterThan((packed[3]?.length ?? 0) * 3);
    expect(packed[3]?.s ?? 1).toBeLessThan(1);
  });

  it('a trunk along -X bends about up and pitches about +Y, twisting along itself', () => {
    const l = chainOf('spine', plan([trunk]))?.links[1];
    near(l?.bend, [0, 0, 1], 1e-6);
    near(l?.pitch, [0, 1, 0], 1e-6);
    near(l?.twist, [-1, 0, 0], 1e-6);
  });

  it('keeps every axis unit, square and unflipped along a curling arm', () => {
    const arm = bodyPlan(OCTOPUS).chains.find((c) => c.id === 'arm_0');
    const links = arm?.links ?? [];
    expect(links.length).toBe(7);
    links.forEach((l, i) => {
      expect(v3.len(l.bend)).toBeCloseTo(1, 9);
      expect(v3.len(l.pitch)).toBeCloseTo(1, 9);
      expect(v3.dot(l.bend, l.twist)).toBeCloseTo(0, 9);
      expect(v3.dot(l.pitch, l.twist)).toBeCloseTo(0, 9);
      const prev = links[i - 1];
      if (prev) expect(v3.dot(prev.bend, l.bend)).toBeGreaterThan(0.5);
    });
  });

  it('turns a radial arm and its bend axis together', () => {
    const p = bodyPlan(OCTOPUS);
    const repeat = OCTOPUS.chains[1]?.repeat;
    if (repeat?.kind !== 'radial')
      throw new Ts23dError('T3D_RECIPE_INVALID', { cause: 'fixture', fix: 'make the arm radial' });
    expect(p.chains.filter((c) => c.spec === 'arm').length).toBe(8);
    const a = p.chains.find((c) => c.id === 'arm_0')?.links[2];
    const b = p.chains.find((c) => c.id === 'arm_3')?.links[2];
    const turn = (v: Vec3): Vec3 => rotate(v, repeat.axis, (3 * 2 * Math.PI) / 8);
    near(b?.bend, turn(a?.bend ?? [0, 0, 0]));
    near(b?.twist, turn(a?.twist ?? [0, 0, 0]));
    near(b?.bone.head, turn(a?.bone.head ?? [0, 0, 0]));
    expect(b?.bone.name).toBe('arm_3_2');
    expect(p.chains.find((c) => c.id === 'arm_3')?.links[0]?.bone.parent).toBe('mantle_3');
  });

  it('mirrors a chain across y = 0 with mirror-image rotation axes', () => {
    const spec = plan([trunk, { ...fin, repeat: { kind: 'mirror' } }]);
    const l = chainOf('fin_l', spec)?.links[0];
    const r = chainOf('fin_r', spec)?.links[0];
    expect(r?.bone.name).toBe('fin_r_0');
    near(r?.bone.head, [l?.bone.head[0] ?? 9, -(l?.bone.head[1] ?? 9), l?.bone.head[2] ?? 9]);
    near(r?.twist, [l?.twist[0] ?? 9, -(l?.twist[1] ?? 9), l?.twist[2] ?? 9]);
    near(r?.bend, [-(l?.bend[0] ?? 9), l?.bend[1] ?? 9, -(l?.bend[2] ?? 9)]);
    expect(r?.bone.parent).toBe('spine_1');
  });

  it('hangs copy k of a repeated child from copy k of its parent, or a named copy', () => {
    const mirrored = { ...fin, repeat: { kind: 'mirror' } as const };
    const barb: ChainSpec = {
      ...fin,
      name: 'barb',
      repeat: { kind: 'mirror' },
      parent: { chain: 'fin', link: 1 },
    };
    const spec = plan([trunk, mirrored, barb]);
    expect(chainOf('barb_r', spec)?.links[0]?.bone.parent).toBe('fin_r_1');
    const one: ChainSpec = { ...fin, name: 'tag', parent: { chain: 'fin_r', link: 0 } };
    expect(chainOf('tag', plan([trunk, mirrored, one]))?.links[0]?.bone.parent).toBe('fin_r_0');
  });

  it('is deterministic and keeps the spec for the mesh', () => {
    for (const spec of [SHARK, OCTOPUS, HYDRA]) {
      const a = bodyPlan(spec);
      expect(JSON.stringify(bodyPlan(spec))).toBe(JSON.stringify(a));
      expect(a.spec).toBe(spec);
    }
  });
});
