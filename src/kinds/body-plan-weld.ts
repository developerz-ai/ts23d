// Fillets between body-plan skins. Two swept shells that simply overlap meet in a hard line; here
// each is moved onto the smooth union of the pair (polynomial smooth-min, radius `blend`), so both
// reach the same surface where they cross and the line is gone. Only a vertex within `blend` of the
// other skin moves, along the mean of its normal and the other skin's: topology, closed shells and
// bone weights stay as swept. Normals are then rebuilt from the moved faces. Distance to a chain is
// measured to its elliptical sections, relief included.

import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import type { ChainCopy, ChainCurve } from './body-plan-curve.ts';
import type { BodyPlan, ChainSpec, PlanChain, SurfacePoint } from './body-plan-types.ts';
import { v3 } from './creature-curve.ts';

/** A chain copy with a skin. */
export interface WeldChain {
  readonly chain: PlanChain;
  readonly spec: ChainSpec;
  readonly curve: ChainCurve;
  readonly copy: ChainCopy;
}

export interface WeldItem extends WeldChain {
  readonly mesh: Mesh;
}

/** The skins one chain fillets into, each with the fillet radius. */
export type Partners = readonly (readonly [Field, number])[];

interface Station {
  readonly u: number;
  readonly p: Vec3;
  readonly bend: Vec3;
  readonly pitch: Vec3;
  readonly t: Vec3;
  readonly r: number;
}

export interface Field {
  readonly item: WeldChain;
  readonly stations: readonly Station[];
  readonly min: Vec3;
  readonly max: Vec3;
}

interface Hit {
  readonly d: number;
  readonly g: Vec3;
}

const STATIONS_PER_LINK = 4;
const MIN_STATIONS = 12;

export function fieldOf(item: WeldChain): Field {
  const { curve, copy, spec } = item;
  const n = Math.max(MIN_STATIONS, spec.links * STATIONS_PER_LINK);
  const stations = Array.from({ length: n + 1 }, (_, i): Station => {
    const u = i / n;
    const q = curve.at(u);
    return {
      u,
      p: copy.point(q.p),
      bend: copy.dir(q.bend),
      pitch: copy.dir(q.pitch),
      t: copy.dir(q.t),
      r: Math.max(1e-4, q.r),
    };
  });
  const reach = Math.max(...stations.map((s) => s.r)) * Math.max(1, spec.flatten ?? 1) * 1.6;
  const k = [0, 1, 2] as const;
  return {
    item,
    stations,
    min: k.map((i) => Math.min(...stations.map((s) => s.p[i])) - reach) as unknown as Vec3,
    max: k.map((i) => Math.max(...stations.map((s) => s.p[i])) + reach) as unknown as Vec3,
  };
}

/** Signed distance from p to the chain's skin, with the outward direction there. */
export function distanceTo(f: Field, p: Vec3): Hit {
  const flatten = f.item.spec.flatten ?? 1;
  let best: Station | undefined;
  let score = Number.POSITIVE_INFINITY;
  for (const s of f.stations) {
    const d = v3.len(v3.sub(p, s.p)) - s.r;
    if (d < score) [score, best] = [d, s];
  }
  if (!best) return { d: Number.POSITIVE_INFINITY, g: [0, 0, 1] };
  const rel = v3.sub(p, best.p);
  const h = v3.dot(rel, best.bend) / flatten;
  const w = v3.dot(rel, best.pitch);
  const along = v3.dot(rel, best.t);
  const rho = dmath.hypot(h, w, along);
  const relief = f.item.spec.relief;
  const angle = dmath.atan2(w, h);
  const lift = relief
    ? relief({
        u: best.u,
        angle: angle < 0 ? angle + Math.PI * 2 : angle,
        s: best.u * f.item.curve.length,
        radius: best.r,
        chain: f.item.copy.id,
        lod: 0,
        p,
        n: v3.norm(rel),
      })
    : 0;
  const g = v3.norm(
    v3.add(v3.add(v3.mul(best.bend, h / flatten), v3.mul(best.pitch, w)), v3.mul(best.t, along)),
  );
  return { d: (rho - best.r) * Math.min(1, flatten) - lift, g };
}

/** How far a vertex at distance d from the other skin moves: the smooth-min's gap, continuous. */
function liftAt(d: number, k: number): { move: number; mix: number } {
  if (d >= k) return { move: 0, mix: 0 };
  if (d >= 0) {
    const h = (k - d) / k;
    return { move: (h * h * k) / 4, mix: 0.5 * h * h };
  }
  // Inside the other skin the lift just holds: letting it fall away raised a ridge at the join.
  return { move: k / 4, mix: 0.5 };
}

/** A skin point on its smooth union with every partner: the strongest pull wins, so overlapping
 *  fillets do not stack into a ridge. Null when no partner reaches it. */
export function filleted(p: Vec3, n: Vec3, partners: Partners): { p: Vec3; n: Vec3 } | null {
  let best = 0;
  let dir: Vec3 | null = null;
  for (const [other, k] of partners) {
    if ([0, 1, 2].some((i) => (p[i as 0] ?? 0) < other.min[i as 0] - k)) continue;
    if ([0, 1, 2].some((i) => (p[i as 0] ?? 0) > other.max[i as 0] + k)) continue;
    const { d, g } = distanceTo(other, p);
    const { move, mix } = liftAt(d, k);
    if (move <= best) continue;
    best = move;
    dir = v3.norm(v3.lerp(n, g, mix));
  }
  return dir ? { p: v3.add(p, v3.mul(dir, best)), n: dir } : null;
}

/** Moves `mesh` onto its fillets. Distances are to the partners' swept skins. */
function weldInto(mesh: Mesh, partners: Partners): Mesh {
  const P = mesh.positions.slice();
  const N = mesh.normals;
  let moved = false;
  for (let v = 0; v < P.length / 3; v++) {
    const p: Vec3 = [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
    const n: Vec3 = [N[v * 3] ?? 0, N[v * 3 + 1] ?? 0, N[v * 3 + 2] ?? 1];
    const hit = filleted(p, n, partners);
    if (!hit) continue;
    P.set(hit.p, v * 3);
    moved = true;
  }
  return moved ? faceNormals({ ...mesh, positions: P }) : mesh;
}

/** Area-weighted normals from the faces, shared across vertices at one position (the ring seam). */
function faceNormals(m: Mesh): Mesh {
  const P = m.positions;
  const key = (v: number): string =>
    `${Math.round((P[v * 3] ?? 0) * 1e5)},${Math.round((P[v * 3 + 1] ?? 0) * 1e5)},${Math.round((P[v * 3 + 2] ?? 0) * 1e5)}`;
  const sums = new Map<string, Vec3>();
  const at = (v: number): Vec3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const face = v3.cross(v3.sub(at(b), at(a)), v3.sub(at(c), at(a)));
    for (const v of [a, b, c]) {
      const k = key(v);
      sums.set(k, v3.add(sums.get(k) ?? [0, 0, 0], face));
    }
  }
  const normals = m.normals.slice();
  for (let v = 0; v < P.length / 3; v++) {
    const s = sums.get(key(v));
    if (s && v3.len(s) > 1e-14) normals.set(v3.norm(s), v * 3);
  }
  return { ...m, normals };
}

/** Normals of a displaced ring grid from its neighbours, on the side of the rest normals. */
export function gridNormals(
  pts: readonly SurfacePoint[][],
  at: readonly Vec3[][],
  sides: number,
): Vec3[][] {
  const last = at.length - 1;
  return at.map((row, i) =>
    row.map((_, j) => {
      const k = j % sides;
      const next = at[Math.min(last, i + 1)]?.[k] ?? [0, 0, 0];
      const prev = at[Math.max(0, i - 1)]?.[k] ?? [0, 0, 0];
      const right = row[(k + 1) % sides] ?? [0, 0, 0];
      const left = row[(k + sides - 1) % sides] ?? [0, 0, 0];
      const m = v3.cross(v3.sub(next, prev), v3.sub(right, left));
      const rest = pts[i]?.[j]?.n ?? [0, 0, 1];
      if (v3.len(m) < 1e-12) return rest;
      const n = v3.norm(m);
      return v3.dot(n, rest) < 0 ? v3.mul(n, -1) : n;
    }),
  );
}

/** The pairs to fillet: each `blend` chain with its parent's copy and its `blendWith` chains. */
function pairsOf(plan: BodyPlan, items: readonly WeldChain[]): [number, number, number][] {
  const owner = new Map<string, number>();
  items.forEach((it, i) => {
    for (const l of it.chain.links) owner.set(l.bone.name, i);
  });
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  const add = (a: number, b: number, k: number): void => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    out.push([a, b, k]);
  };
  items.forEach((it, i) => {
    const k = it.spec.blend ?? 0;
    if (!(k > 0)) return;
    const up = plan.bones.find((b) => b.name === it.chain.links[0]?.bone.name)?.parent;
    const host = owner.get(up ?? '');
    if (host !== undefined) add(i, host, k);
    items.forEach((o, j) => {
      if (it.spec.blendWith?.includes(o.spec.name)) add(i, j, k);
    });
  });
  return out;
}

/** Per chain, in order, the skins it fillets into (both sides of every declared pair). */
export function weldPartners(plan: BodyPlan, chains: readonly WeldChain[]): Partners[] {
  const pairs = pairsOf(plan, chains);
  const out = chains.map((): [Field, number][] => []);
  if (pairs.length === 0) return out;
  const fields = chains.map(fieldOf);
  for (const [a, b, k] of pairs) {
    const [fa, fb] = [fields[a], fields[b]];
    if (!fa || !fb) continue;
    out[a]?.push([fb, k]);
    out[b]?.push([fa, k]);
  }
  return out;
}

/** The pieces with every declared fillet applied; untouched when no chain declares one. */
export function weldPieces(plan: BodyPlan, items: readonly WeldItem[]): readonly WeldItem[] {
  const partners = weldPartners(plan, items);
  return items.map((it, i) => {
    const mine = partners[i] ?? [];
    return mine.length > 0 ? { ...it, mesh: weldInto(it.mesh, mine) } : it;
  });
}
