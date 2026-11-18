// defineBodyPlan end to end: a body with no spec is refused; the shark, octopus and hydra compile at
// every LOD with no QA finding, keep their triangle budgets, close every shell, drive every bone at
// every LOD, and an arm's skin follows only its own bones and the mantle.

import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  type Mesh,
  Ts23dError,
  triangleCount,
} from '../core/index.ts';
import { runQa } from '../qa/index.ts';
import { bodyPlan } from './body-plan.ts';
import { defineBodyPlan } from './body-plan-asset.ts';
import { HYDRA, OCTOPUS, SHARK } from './body-plan-fixtures.ts';
import { type BodyPlanLook, bodyPlanMesh, bodyPlanPieces } from './body-plan-mesh.ts';
import { bodyPlanSkin } from './body-plan-skin.ts';
import type { BodyPlanSpec } from './body-plan-types.ts';

const LODS = [0, 1, 2] as const;
const look: BodyPlanLook = { back: [0.1, 0.13, 0.16], belly: [0.75, 0.74, 0.68] };

const assetOf = (spec: BodyPlanSpec) => defineBodyPlan({ name: spec.name, spec, medium: 'ground' });
const bodyOf = (a: CompiledAsset): Mesh | null =>
  a.parts.find((p) => p.name === 'body')?.mesh ?? null;

/** Edges not shared by exactly two triangles, vertices welded by position (0.1 mm). */
function openEdges(m: Mesh): number {
  const key = (v: number): string =>
    [0, 1, 2].map((k) => Math.round((m.positions[v * 3 + k] ?? 0) * 1e4)).join();
  const count = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = key(m.indices[t + e] ?? 0);
      const b = key(m.indices[t + ((e + 1) % 3)] ?? 0);
      if (a === b) continue;
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(edge, (count.get(edge) ?? 0) + 1);
    }
  return [...count.values()].filter((n) => n !== 2).length;
}

describe('defineBodyPlan', () => {
  it('refuses an asset with neither spec nor plan', () => {
    expect(() => defineBodyPlan({ name: 'nothing' })).toThrow(Ts23dError);
    expect(() => defineBodyPlan({ name: 'nothing' })).toThrow(/neither spec nor plan/);
  });

  it('refuses a plan that lost its spec, when it needs radii', () => {
    const { spec: _spec, ...bare } = bodyPlan(SHARK);
    expect(() => bodyPlanMesh(bare, 2, look)).toThrow(/carries no spec/);
  });

  it('is a creature, budgets its bones from the plan and files no grounded rule', () => {
    const a = assetOf(OCTOPUS);
    expect(a.kind).toBe('creature');
    expect(a.budget.bones).toBe(bodyPlan(OCTOPUS).bones.length);
    expect(a.art?.grounded).toBe(false);
    const set = defineBodyPlan({
      name: 'capped',
      spec: SHARK,
      budget: { triangles: [9000, 3000, 500], bones: 40 },
    });
    expect(set.budget.bones).toBe(40);
  });

  it('runs detail with the plan', () => {
    const seen: string[] = [];
    const a = defineBodyPlan({
      name: 'detailed',
      spec: SHARK,
      detail: (_ctx, plan) => seen.push(plan.root),
    });
    compile(a, { lod: 2 });
    expect(seen).toEqual(['spine_0']);
  });
});

describe('body plan fixtures', () => {
  for (const spec of [SHARK, OCTOPUS, HYDRA])
    it(`${spec.name} passes QA at every LOD`, () => {
      const a = assetOf(spec);
      const bones = bodyPlan(spec).bones.length;
      let previous = Infinity;
      for (const lod of LODS) {
        const c = compile(a, { lod });
        expect(runQa(c).map((f) => `LOD${lod} ${f.gate}: ${f.message}`)).toEqual([]);
        expect(c.skeleton?.bones.length).toBe(bones);
        const body = bodyOf(c);
        expect(body).not.toBeNull();
        if (!body) return;
        expect(openEdges(body)).toBe(0);
        const tris = triangleCount(body);
        expect(tris).toBeLessThan(previous);
        previous = tris;
      }
    }, 60000);

  it('a fish-sized plan stays a few hundred triangles at LOD2', () => {
    const body = bodyOf(compile(assetOf(SHARK), { lod: 2 }));
    expect(body ? triangleCount(body) : Infinity).toBeLessThan(400);
  });

  it('builds the same bytes twice', () => {
    const once = bodyOf(compile(assetOf(HYDRA), { lod: 1 }));
    const twice = bodyOf(compile(assetOf(HYDRA), { lod: 1 }));
    expect(once?.positions).toEqual(twice?.positions as Float32Array);
    expect(once?.weights).toEqual(twice?.weights as Float32Array);
  });

  it('countershades: faces looking down are the pale belly', () => {
    const m = bodyPlanMesh(bodyPlan(SHARK), 0, look);
    let down = 0;
    let up = 0;
    for (let v = 0; v < m.normals.length / 3; v++) {
      const nz = m.normals[v * 3 + 2] ?? 0;
      const red = m.colors[v * 3] ?? 0;
      if (nz < -0.9) down = Math.max(down, red);
      if (nz > 0.9) up = Math.max(up, red);
    }
    expect(down).toBeCloseTo(look.belly[0], 2);
    expect(up).toBeCloseTo(look.back[0], 2);
  });
});

describe('bodyPlanSkin', () => {
  it('gives every bone of a long, tip-packed whip flesh at LOD2', () => {
    const whip: BodyPlanSpec = {
      name: 'whip',
      length: 4,
      chains: [
        {
          name: 'whip',
          path: [
            [2, 0, 0.1],
            [0, 0.4, 0.1],
            [-2, 0, 0.1],
          ],
          radius: [0.08, 0.05, 0.004],
          links: 40,
          bias: 2,
        },
      ],
    };
    const a = defineBodyPlan({ name: 'whip', spec: whip });
    expect(runQa(compile(a, { lod: 2 })).filter((f) => f.gate === 'skin')).toEqual([]);
  });

  for (const lod of LODS)
    it(`keeps each octopus arm on its own bones and the mantle at LOD${lod}`, () => {
      const plan = bodyPlan(OCTOPUS);
      const pieces = bodyPlanPieces(plan, lod, look);
      const skinned = bodyPlanSkin(plan, pieces);
      const names = plan.bones.map((b) => b.name);
      let start = 0;
      const driven = new Set<number>();
      for (const piece of pieces) {
        const count = piece.mesh.positions.length / 3;
        const own = piece.chain.id;
        for (let v = start; v < start + count; v++)
          for (let s = 0; s < 4; s++) {
            if ((skinned.weights?.[v * 4 + s] ?? 0) <= 0) continue;
            const j = skinned.joints?.[v * 4 + s] ?? 0;
            driven.add(j);
            const name = names[j] ?? '';
            if (own.startsWith('arm_'))
              expect(name.startsWith(`${own}_`) || name === 'mantle_3').toBe(true);
          }
        start += count;
      }
      expect(driven.size).toBe(plan.bones.length);
    });
});
