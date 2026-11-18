// Body-plan joints: `blend` removes the crease where two chains meet and changes nothing unasked,
// detail seats on the welded skin, every child's root stays under its parent's skin (a root standing
// proud left a lit sliver beside the hydra's leg), and the length bound holds.

import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { bodyPlan } from './body-plan.ts';
import { chainCopies, chainCurve } from './body-plan-curve.ts';
import { HYDRA, OCTOPUS, SHARK } from './body-plan-fixtures.ts';
import { type BodyPlanLook, bodyPlanPieces } from './body-plan-mesh.ts';
import { chainSurface } from './body-plan-surface.ts';
import type { BodyPlan, BodyPlanSpec, ChainSpec } from './body-plan-types.ts';
import { distanceTo, fieldOf, type WeldItem, weldPieces } from './body-plan-weld.ts';

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

  /** The two swept meshes as weld input, with what they held before welding. */
  function weldInput(p: BodyPlanSpec): { plan: BodyPlan; items: WeldItem[] } {
    const plan = bodyPlan(p);
    const pieces = bodyPlanPieces(bodyPlan(spec(limb)), 1, look);
    // These meshes already went through weldPieces once: nudged, so a change it repeats still shows.
    const items = ['trunk', 'limb'].map((id, i) => {
      const m = pieces[i]?.mesh as Mesh;
      return {
        ...itemOf(plan, id),
        mesh: {
          ...m,
          positions: m.positions.map((x, k) => x + (0.001 * (1 + (k % 7))) / 7),
          normals: m.normals.map((x, k) => x + (0.001 * (1 + (k % 5))) / 5),
        },
      };
    });
    return { plan, items };
  }

  /** What a mesh holds now, kept apart so a change made in place is seen too. */
  const held = (m: Mesh) => ({ p: [...m.positions], n: [...m.normals] });

  it('leaves every position and normal alone when no chain asks for a fillet', () => {
    for (const l of [limb, { ...limb, blend: 0 }]) {
      const { plan, items } = weldInput(spec(l));
      const before = items.map((it) => held(it.mesh));
      weldPieces(plan, items).forEach((out, i) => {
        expect(held(out.mesh)).toEqual(before[i] as ReturnType<typeof held>);
      });
    }
  });

  it('does move them when one does: the comparison above can fail', () => {
    const { plan, items } = weldInput(spec({ ...limb, blend: 0.12 }));
    const before = items.map((it) => held(it.mesh));
    const moved = weldPieces(plan, items).filter(
      (o, i) => held(o.mesh).p.join() !== before[i]?.p.join(),
    );
    expect(moved.length).toBe(2);
  });

  it('says where a filleted seat was swept, and only there', () => {
    const at = chainSurface(bodyPlan(spec({ ...limb, blend: 0.12 })), 'limb', look);
    const near = at(12 / 36, 0);
    expect(near.swept).toBeDefined();
    expect(near.swept).not.toEqual(near.p);
    expect(at(0.95, 0).swept).toBeUndefined();
  });

  /** Worst distance from `kit.surface` to the welded mesh, over filleted seats on mesh vertices. */
  function seatError(l: ChainSpec): { worst: number; seats: number } {
    const plan = bodyPlan(spec(l));
    const mesh = bodyPlanPieces(plan, 0, look)[1]?.mesh as Mesh;
    const at = chainSurface(plan, 'limb', look);
    let [worst, seats] = [0, 0];
    // Mesh rings: 12 per link over 3 even links; 40 sides.
    for (let ring = 2; ring < 36; ring += 2)
      for (let j = 0; j < 40; j += 3) {
        const q = at(ring / 36, (j / 40) * Math.PI * 2);
        if (!q.swept) continue;
        let best = Number.POSITIVE_INFINITY;
        for (let v = 0; v < mesh.positions.length / 3; v++) {
          const m = point(mesh, v);
          best = Math.min(best, Math.hypot(q.p[0] - m[0], q.p[1] - m[1], q.p[2] - m[2]));
        }
        worst = Math.max(worst, best);
        seats++;
      }
    return { worst, seats };
  }

  it('seats on the welded vertices of a chain with varying relief', () => {
    const relief = (q: { angle: number; u: number }): number =>
      0.03 * Math.sin(5 * q.angle) * Math.cos(30 * q.u);
    const { worst, seats } = seatError({ ...limb, blend: 0.12, relief });
    expect(seats).toBeGreaterThan(20);
    expect(worst).toBeLessThan(1e-4);
  });

  it('seats on the welded vertices of a chain with antiFold', () => {
    const bent: ChainSpec = {
      ...limb,
      path: [
        [0, 0, 1],
        [0, 0, 1.3],
        [0.1, 0, 1.42],
        [0.3, 0, 1.5],
      ],
      radius: [0.15, 0.15, 0.15, 0.12],
    };
    const { worst, seats } = seatError({ ...bent, blend: 0.12, antiFold: true });
    expect(seats).toBeGreaterThan(20);
    expect(worst).toBeLessThan(1e-4);
  });

  it('seats detail on the welded skin, not on the swept one under it', () => {
    const blended = bodyPlan(spec({ ...limb, blend: 0.12 }));
    const mesh = bodyPlanPieces(blended, 0, look)[1]?.mesh as Mesh;
    const nearest = (p: Vec3): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        const q = point(mesh, v);
        best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
      return best;
    };
    const welded = chainSurface(blended, 'limb', look);
    const swept = chainSurface(bodyPlan(spec(limb)), 'limb', look);
    // A ring of the mesh just above the trunk: 12 rings per link, 3 links, 40 sides.
    for (const j of [0, 7, 19, 33]) {
      const [u, a] = [12 / 36, (j / 40) * Math.PI * 2];
      expect(nearest(welded(u, a).p)).toBeLessThan(1e-4);
      expect(nearest(swept(u, a).p)).toBeGreaterThan(0.002);
    }
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

describe('body-plan length', () => {
  it('refuses a length that does not fit the chains', () => {
    expect(() => bodyPlan({ ...spec(limb), length: 20 })).toThrow(/does not fit/);
    expect(() => bodyPlan({ ...spec(limb), length: 0.5 })).toThrow(/does not fit/);
  });

  it('accepts every fixture', () => {
    for (const s of [HYDRA, OCTOPUS, SHARK]) expect(bodyPlan(s).length).toBe(s.length);
  });
});
