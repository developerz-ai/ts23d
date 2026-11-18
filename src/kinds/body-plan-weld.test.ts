// Body-plan skin features: `blend` removes the crease where two chains meet, every child's root
// stays under its parent's skin (a root standing proud left a lit sliver beside the hydra's leg),
// and `relief`, `tint`, `skin: false`, `parts`, the detail kit and the length bound all do their job.

import { describe, expect, it } from 'bun:test';
import { compile, type Mesh, type Vec3 } from '../core/index.ts';
import { bodyPlan } from './body-plan.ts';
import { defineBodyPlan } from './body-plan-asset.ts';
import { chainCopies, chainCurve } from './body-plan-curve.ts';
import { HYDRA, OCTOPUS, SHARK } from './body-plan-fixtures.ts';
import { type BodyPlanLook, bodyPlanPieces, chainSurface } from './body-plan-mesh.ts';
import type { BodyPlan, BodyPlanSpec, ChainSpec } from './body-plan-types.ts';
import { distanceTo, fieldOf, type WeldItem } from './body-plan-weld.ts';

const look: BodyPlanLook = { back: [0.2, 0.2, 0.2], belly: [0.6, 0.6, 0.6] };
const trunk: ChainSpec = {
  name: 'trunk',
  path: [
    [1, 0, 1],
    [0, 0, 1],
    [-1, 0, 1],
  ],
  radius: [0.3, 0.3, 0.3],
  links: 4,
  detail: { rings: [12, 4, 1], sides: [40, 12, 6] },
};
const limb: ChainSpec = {
  name: 'limb',
  parent: { chain: 'trunk', link: 1 },
  path: [
    [0, 0, 1],
    [0, 0, 1.5],
    [0, 0, 2],
  ],
  radius: [0.15, 0.15, 0.12],
  links: 3,
  detail: { rings: [12, 4, 1], sides: [40, 12, 6] },
};
const spec = (l: ChainSpec): BodyPlanSpec => ({ name: 'tee', length: 2, chains: [trunk, l] });

const point = (m: Mesh, v: number, a: Float32Array = m.positions): Vec3 => [
  a[v * 3] ?? 0,
  a[v * 3 + 1] ?? 0,
  a[v * 3 + 2] ?? 0,
];

/** How far the limb's skin just outside the trunk leans onto the trunk's surface (0: a hard T). */
function filletLean(p: BodyPlanSpec): number {
  const plan = bodyPlan(p);
  const limbMesh = bodyPlanPieces(plan, 0, look)[1]?.mesh;
  if (!limbMesh) throw new Error('two pieces expected');
  const trunkField = fieldOf(itemOf(plan, 'trunk'));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < limbMesh.positions.length / 3; i++) {
    const q = point(limbMesh, i);
    const { d, g } = distanceTo(trunkField, q);
    if (d < 0 || d > 0.02) continue;
    const m = point(limbMesh, i, limbMesh.normals);
    sum += m[0] * g[0] + m[1] * g[1] + m[2] * g[2];
    n++;
  }
  expect(n).toBeGreaterThan(0);
  return sum / n;
}

function itemOf(plan: BodyPlan, id: string): WeldItem {
  const chain = plan.chains.find((c) => c.id === id);
  const c = plan.spec?.chains.find((x) => x.name === chain?.spec);
  const copy = c && chainCopies(c).find((k) => k.id === id);
  if (!chain || !c || !copy) throw new Error(`no chain ${id}`);
  const mesh = { positions: new Float32Array() } as unknown as Mesh;
  return { chain, mesh, spec: c, curve: chainCurve(c), copy };
}

describe('body-plan blend', () => {
  it('leans the limb onto the trunk at the join, which it does not do without', () => {
    const bare = filletLean(spec(limb));
    expect(filletLean(spec({ ...limb, blend: 0.12 }))).toBeGreaterThan(bare + 0.05);
  });

  it('changes nothing when no chain asks for it', () => {
    const [a] = bodyPlanPieces(bodyPlan(spec(limb)), 1, look);
    const [b] = bodyPlanPieces(bodyPlan(spec(limb)), 1, look);
    expect([...(a?.mesh.positions ?? [])]).toEqual([...(b?.mesh.positions ?? [])]);
  });
});

describe('fixture joints', () => {
  for (const s of [HYDRA, OCTOPUS, SHARK])
    it(`${s.name}: every round child's root ring lies under its parent's skin`, () => {
      const plan = bodyPlan(s);
      for (const chain of plan.chains) {
        const c = plan.spec?.chains.find((x) => x.name === chain.spec);
        const up = chain.links[0]?.bone.parent;
        const host = plan.chains.find((h) => h.links.some((l) => l.bone.name === up));
        if (!c?.parent || !host || (c.flatten ?? 1) !== 1) continue;
        const field = fieldOf(itemOf(plan, host.id));
        const at = chainSurface(plan, chain.id, look);
        for (let k = 0; k < 16; k++) {
          const q = at(0, (k / 16) * Math.PI * 2);
          expect({ id: chain.id, out: distanceTo(field, q.p).d > 0.01 }).toEqual({
            id: chain.id,
            out: false,
          });
        }
      }
    });
});

describe('body-plan surface hooks', () => {
  it('relief moves the skin and turns its normals', () => {
    const bumped = { ...trunk, relief: () => 0.05 };
    const plan = bodyPlan({ name: 'one', length: 2, chains: [bumped] });
    const q = chainSurface(plan, 'trunk', look)(0.5, 0);
    expect(q.p[2]).toBeCloseTo(1.35, 2);
    const [piece] = bodyPlanPieces(plan, 2, look);
    const zs = [...(piece?.mesh.positions ?? [])].filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeGreaterThan(1.33);
  });

  it('tint sets the colour, skin: false leaves bones without a surface', () => {
    const red: Vec3 = [1, 0, 0];
    const plan = bodyPlan(spec({ ...limb, skin: false }));
    expect(bodyPlanPieces(plan, 2, look).map((p) => p.chain.id)).toEqual(['trunk']);
    const tinted = bodyPlan({
      name: 'one',
      length: 2,
      chains: [{ ...trunk, tint: () => red }],
    });
    expect(bodyPlanPieces(tinted, 2, look)[0]?.mesh.colors[0]).toBe(1);
  });

  it('closes a tinted chain in its tint, not in the plain back colour', () => {
    const red: Vec3 = [1, 0, 0];
    const tinted = bodyPlan({ name: 'one', length: 2, chains: [{ ...trunk, tint: () => red }] });
    const m = bodyPlanPieces(tinted, 2, look)[0]?.mesh;
    const greens = [...(m?.colors ?? [])].filter((_, i) => i % 3 === 1);
    expect(Math.max(...greens)).toBe(0);
  });

  it('splits named chains into parts, refuses an unknown one, and gives detail a kit', () => {
    let seated = 0;
    const a = compile(
      defineBodyPlan({
        name: 'tee',
        spec: spec(limb),
        medium: 'water',
        parts: { limb: ['limb'] },
        detail: (_ctx, _plan, kit) => {
          seated = kit.surface('limb', 0.5, 0).radius;
        },
      }),
    );
    expect(a.parts.map((p) => p.name).sort()).toEqual(['body', 'limb']);
    expect(seated).toBeCloseTo(0.15, 2);
    const bad = defineBodyPlan({ name: 'tee', spec: spec(limb), parts: { x: ['nope'] } });
    expect(() => compile(bad)).toThrow(/names chain 'nope'/);
  });
});

describe('body-plan antiFold', () => {
  const knee: ChainSpec = {
    name: 'knee',
    path: [
      [0, 0, 1],
      [0.2, 0, 1],
      [0.26, 0, 0.94],
      [0.26, 0, 0.74],
    ],
    radius: [0.12, 0.12, 0.12, 0.12],
    links: 3,
    detail: { rings: [10, 2, 1], sides: [16, 8, 6] },
  };
  /** Steps of the bend's inside line that run backward along the chain. */
  const backward = (c: ChainSpec): number => {
    const plan = bodyPlan({ name: 'one', length: 0.5, chains: [c] });
    const at = chainSurface(plan, 'knee', look);
    const curve = chainCurve(c);
    let n = 0;
    let prev: Vec3 | null = null;
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      // Angle π faces -bend, which is the inside of this downward turn.
      const p = at(u, Math.PI).p;
      if (prev) {
        const t = curve.at(u).t;
        if ((p[0] - prev[0]) * t[0] + (p[1] - prev[1]) * t[1] + (p[2] - prev[2]) * t[2] < 0) n++;
      }
      prev = p;
    }
    return n;
  };

  it('stops the inside of a tight bend folding back on itself', () => {
    expect(backward(knee)).toBeGreaterThan(0);
    expect(backward({ ...knee, antiFold: true })).toBe(0);
  });
});

describe('body-plan length', () => {
  it('refuses a length that does not fit the chains', () => {
    expect(() => bodyPlan({ ...spec(limb), length: 20 })).toThrow(/does not fit/);
    expect(() => bodyPlan({ ...spec(limb), length: 0.5 })).toThrow(/does not fit/);
  });

  it('accepts every fixture', () => {
    for (const s of [HYDRA, OCTOPUS, SHARK]) expect(bodyPlan(s).length).toBe(s.length);
  });
});
