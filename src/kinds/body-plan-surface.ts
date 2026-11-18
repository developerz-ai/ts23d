// Where a recipe seats detail on a body plan: the skin at (u, angle) as the mesh of this LOD really
// has it, relief and fillets included; on a fillet the normal is read from the welded surface.
// Suckers and spikes placed here sit on the surface the player sees.

import { Ts23dError, type Vec3 } from '../core/index.ts';
import { type BodyPlanLook, type Lod, type Sweep, skinPoint, sweepOf } from './body-plan-mesh.ts';
import type { BodyPlan, SurfacePoint } from './body-plan-types.ts';
import { filleted, type Partners, type WeldChain, weldPartners } from './body-plan-weld.ts';
import { v3 } from './creature-curve.ts';

/** Stencil of the seating normal, in arc fraction and radians: wide enough to ride over scales. */
const SEAT_DU = 0.02;
const SEAT_DA = 0.12;

/** The normal of a surface read across (u, angle), on the side of `out`; `out` if it degenerates. */
function stencilNormal(
  at: (u: number, angle: number) => Vec3,
  u: number,
  a: number,
  out: Vec3,
): Vec3 {
  const [lo, hi] = [Math.max(0, u - SEAT_DU), Math.min(1, u + SEAT_DU)];
  const along = v3.sub(at(hi, a), at(lo, a));
  const round = v3.sub(at(u, a + SEAT_DA), at(u, a - SEAT_DA));
  const m = v3.cross(along, round);
  if (v3.len(m) <= 1e-12) return out;
  return v3.mul(v3.norm(m), v3.dot(m, out) < 0 ? -1 : 1);
}

/** The skin as the mesh has it at (u, angle): relief, then fillets. Away from a fillet the normal
 *  stays the section's own, so detail does not tilt with every scale of the relief. */
function seatedPoint(s: Sweep, u: number, angle: number, partners: Partners): SurfacePoint {
  const bare = (x: number, a: number): SurfacePoint => {
    const q = skinPoint(s, x, a, 0.01);
    return s.c.relief ? { ...q, p: v3.add(q.p, v3.mul(q.n, s.c.relief(q))) } : q;
  };
  const q = bare(u, angle);
  const hit = filleted(q.p, q.n, partners);
  if (!hit) return q;
  // A fillet's own direction only blends two normals: read the welded surface itself.
  const welded = (x: number, a: number): Vec3 => {
    const w = bare(x, a);
    return filleted(w.p, w.n, partners)?.p ?? w.p;
  };
  return { ...q, p: hit.p, n: stencilNormal(welded, u, angle, hit.n), swept: q.p };
}

/** Where detail is seated: per chain copy, the skin at (u, angle) as this LOD's mesh has it. */
export function chainSurfaces(
  plan: BodyPlan,
  look: BodyPlanLook,
  lod: Lod,
): (id: string) => (u: number, angle: number) => SurfacePoint {
  const sweeps = new Map(
    plan.chains.flatMap((chain) => {
      const s = sweepOf(plan, chain, look, lod);
      return s ? ([[chain.id, { s, chain }]] as const) : [];
    }),
  );
  const skinned: WeldChain[] = [...sweeps.values()]
    .filter(({ s }) => s.c.skin !== false)
    .map(({ s, chain }) => ({ chain, spec: s.c, curve: s.curve, copy: s.copy }));
  const partners = weldPartners(plan, skinned);
  const byId = new Map(skinned.map((c, i) => [c.chain.id, partners[i] ?? []]));
  return (id) => {
    const found = sweeps.get(id);
    if (!found)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `body plan '${plan.name}' has no chain '${id}'`,
        fix: `use one of: ${plan.chains.map((x) => x.id).join(', ')}`,
      });
    const mine = byId.get(id) ?? [];
    return (u, angle) => seatedPoint(found.s, u, angle, mine);
  };
}

/** One chain's seating surface (see `chainSurfaces`). */
export const chainSurface = (
  plan: BodyPlan,
  id: string,
  look: BodyPlanLook,
  lod: Lod = 0,
): ((u: number, angle: number) => SurfacePoint) => chainSurfaces(plan, look, lod)(id);
