// Body-plan skin hooks: `relief`, `tint`, `skin: false`, `parts` and the detail kit each do their job
// at the LOD asked for, and `antiFold` keeps the inside of a bend from folding, shaded as it is.

import { describe, expect, it } from 'bun:test';
import { compile, dmath, type Mesh, type Vec3 } from '../core/index.ts';
import { bodyPlan } from './body-plan.ts';
import { defineBodyPlan } from './body-plan-asset.ts';
import { chainCurve } from './body-plan-curve.ts';
import { type BodyPlanLook, bodyPlanPieces } from './body-plan-mesh.ts';
import { chainSurface } from './body-plan-surface.ts';
import type { BodyPlanSpec, ChainSpec } from './body-plan-types.ts';

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

  it('builds relief for the LOD asked for, in the skin and in the detail kit', () => {
    const relief = (q: { lod: number }): number => 0.01 * q.lod;
    const seen: number[] = [];
    const a = defineBodyPlan({
      name: 'tee',
      medium: 'water',
      spec: { name: 'one', length: 2, chains: [{ ...trunk, relief }] },
      detail: (ctx, _plan, kit) => {
        seen[ctx.lod] = kit.surface('trunk', 0.5, 0).p[2];
      },
    });
    for (const lod of [0, 1, 2] as const) compile(a, { lod });
    expect(seen[0]).toBeCloseTo(1.3, 4);
    expect(seen[1]).toBeCloseTo(1.31, 4);
    expect(seen[2]).toBeCloseTo(1.32, 4);
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

  it('shades the moved skin by its real faces', () => {
    const m = bodyPlanPieces(
      bodyPlan({ name: 'one', length: 0.5, chains: [{ ...knee, antiFold: true }] }),
      0,
      look,
    )[0]?.mesh as Mesh;
    const key = (v: number): string =>
      point(m, v)
        .map((x) => Math.round(x * 1e5))
        .join();
    const sum = new Map<string, Vec3>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
      const [p, q, r] = [point(m, a), point(m, b), point(m, c)];
      const [u, w]: Vec3[] = [
        [q[0] - p[0], q[1] - p[1], q[2] - p[2]],
        [r[0] - p[0], r[1] - p[1], r[2] - p[2]],
      ] as Vec3[];
      const f: Vec3 = [
        (u?.[1] ?? 0) * (w?.[2] ?? 0) - (u?.[2] ?? 0) * (w?.[1] ?? 0),
        (u?.[2] ?? 0) * (w?.[0] ?? 0) - (u?.[0] ?? 0) * (w?.[2] ?? 0),
        (u?.[0] ?? 0) * (w?.[1] ?? 0) - (u?.[1] ?? 0) * (w?.[0] ?? 0),
      ];
      for (const v of [a, b, c]) {
        const s0 = sum.get(key(v)) ?? [0, 0, 0];
        sum.set(key(v), [s0[0] + f[0], s0[1] + f[1], s0[2] + f[2]]);
      }
    }
    let worst = 1;
    // 17 vertices a ring; the two end rings share faces with the caps' fans, so they are left out.
    const ringVerts = 17;
    for (let v = ringVerts; v < m.positions.length / 3 - 2 - ringVerts; v++) {
      const f = sum.get(key(v)) ?? [0, 0, 1];
      const l = dmath.hypot(f[0], f[1], f[2]) || 1;
      const n = point(m, v, m.normals);
      worst = Math.min(worst, (n[0] * f[0] + n[1] * f[1] + n[2] * f[2]) / l);
    }
    expect(worst).toBeGreaterThan(0.9);
  });

  it('stops the inside of a tight bend folding back on itself', () => {
    expect(backward(knee)).toBeGreaterThan(0);
    expect(backward({ ...knee, antiFold: true })).toBe(0);
  });
});
