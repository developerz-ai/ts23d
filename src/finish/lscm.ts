// Least-squares conformal maps (Lévy et al. 2002) for the finish atlas. Seams: triangles grow
// into charts across welded edges until a curvature ridge (dihedral > `ridge`) or the chart's
// normal cone (> `cone` from its seed normal) stops them; part borders are seams by construction
// (one part at a time). Each chart minimises Σ area·|∇v − R90 ∇u|² with two pinned vertices,
// solved by Jacobi-preconditioned conjugate gradient (own solver, zero deps) warm-started from
// the projection on the chart's mean plane, then scaled to its true area (metres). Every chart
// is gated: Sander L2 stretch < STRETCH_MAX, no flipped triangle, no self-overlap (raster test).

import type { Mesh } from '../core/index.ts';
import { cg } from './lscm-cg.ts';
import { cross, dot, overlaps, stretchL2, sub, type V3 } from './lscm-gate.ts';

export const STRETCH_MAX = 1.25;

export interface UvChart {
  readonly tris: readonly number[];
  /** Mesh vertex → slot in `uv`. */
  readonly slot: ReadonlyMap<number, number>;
  /** u, v per slot, metres. */
  readonly uv: Float64Array;
  /** Sander L2 stretch (1 = isometric). */
  readonly stretch: number;
  /** Passed the gate: stretch < STRETCH_MAX, no flip, no overlap. */
  readonly ok: boolean;
}

export interface LscmOptions {
  /** Max dihedral angle a chart grows across, degrees. Default 50. */
  readonly ridge?: number;
  /** First normal cone (any triangle vs the chart's seed), degrees; failing charts re-cut at 0.6×. Default 180 (none). */
  readonly cone?: number;
  /** Triangles per chart at most (bounds the solve). Default 3000. */
  readonly maxTris?: number;
}

const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Triangle corners, welded node per corner, unit normals and edge adjacency of one mesh. */
function topology(m: Mesh) {
  const P = m.positions;
  const nt = m.indices.length / 3;
  const pos = (v: number): V3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  const keyOf = new Map<string, number>();
  const node = new Int32Array(P.length / 3);
  for (let v = 0; v < node.length; v++) {
    const k = pos(v)
      .map((c) => Math.round(c * 1e5))
      .join(',');
    const id = keyOf.get(k) ?? keyOf.size;
    if (id === keyOf.size) keyOf.set(k, id);
    node[v] = id;
  }
  const corner = (t: number, k: number): number => m.indices[t * 3 + k] ?? 0;
  const normal: V3[] = [];
  const edges = new Map<string, number[]>();
  for (let t = 0; t < nt; t++) {
    const [a, b, c] = [pos(corner(t, 0)), pos(corner(t, 1)), pos(corner(t, 2))];
    normal.push(norm(cross(sub(b, a), sub(c, a))));
    for (let k = 0; k < 3; k++) {
      const x = node[corner(t, k)] ?? 0;
      const y = node[corner(t, (k + 1) % 3)] ?? 0;
      const e = x < y ? `${x},${y}` : `${y},${x}`;
      const list = edges.get(e);
      if (list) list.push(t);
      else edges.set(e, [t]);
    }
  }
  const adj: number[][] = Array.from({ length: nt }, () => []);
  for (const list of edges.values())
    for (const s of list) for (const t of list) if (s !== t) adj[s]?.push(t);
  return { nt, pos, node, corner, normal, adj };
}

type Topo = ReturnType<typeof topology>;

/** Greedy region growing in triangle order; deterministic. */
function segment(g: Topo, o: LscmOptions, coneDeg: number, only: readonly number[]): number[][] {
  const ridge = Math.cos(((o.ridge ?? 50) * Math.PI) / 180);
  const cone = Math.cos((coneDeg * Math.PI) / 180);
  const cap = o.maxTris ?? 3000;
  // −2 = not in this pass; −1 = free.
  const owner = new Int32Array(g.nt).fill(-2);
  for (const t of only) owner[t] = -1;
  const charts: number[][] = [];
  for (const s of only) {
    if ((owner[s] ?? 0) !== -1) continue;
    const id = charts.length;
    const seedN = g.normal[s] as V3;
    const tris = [s];
    owner[s] = id;
    for (let q = 0; q < tris.length && tris.length < cap; q++) {
      const t = tris[q] ?? 0;
      for (const u of g.adj[t] ?? []) {
        if ((owner[u] ?? 0) !== -1 || tris.length >= cap) continue;
        const nu = g.normal[u] as V3;
        if (dot(nu, g.normal[t] as V3) < ridge || dot(nu, seedN) < cone) continue;
        owner[u] = id;
        tris.push(u);
      }
    }
    charts.push(tris);
  }
  return charts;
}

/** Solve one chart; UV in metres at true area. */
function solve(g: Topo, tris: readonly number[]): UvChart {
  const slotOf = new Map<number, number>();
  const nodes: number[] = [];
  const nodeSlot = new Map<number, number>();
  const where = new Map<number, number>();
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const v = g.corner(t, k);
      const n = g.node[v] ?? 0;
      let s = nodeSlot.get(n);
      if (s === undefined) {
        s = nodes.length;
        nodeSlot.set(n, s);
        nodes.push(n);
        where.set(s, v);
      }
      slotOf.set(v, s);
    }
  const N = nodes.length;
  // Mean plane frame (T, B, mean normal): T × B = n keeps the map's orientation.
  let mean: V3 = [0, 0, 0];
  for (const t of tris) {
    const n = g.normal[t] ?? mean;
    mean = [mean[0] + n[0], mean[1] + n[1], mean[2] + n[2]];
  }
  const nrm = norm(mean);
  const T = norm(Math.abs(nrm[2]) < 0.9 ? cross([0, 0, 1], nrm) : cross([1, 0, 0], nrm));
  const B = cross(nrm, T);
  const x = new Float64Array(2 * N);
  for (let s = 0; s < N; s++) {
    const p = g.pos(where.get(s) ?? 0);
    x[2 * s] = dot(p, T);
    x[2 * s + 1] = dot(p, B);
  }
  // Per triangle: the three slots and √area·∇φ in the triangle's own frame.
  const coef = new Float64Array(tris.length * 6);
  const ids = new Int32Array(tris.length * 3);
  tris.forEach((t, i) => {
    const q = [0, 1, 2].map((k) => g.pos(g.corner(t, k)));
    const [q0, q1, q2] = q as [V3, V3, V3];
    const e1 = sub(q1, q0);
    const e2 = sub(q2, q0);
    const X = norm(e1);
    const Y = norm(cross(cross(e1, e2), X));
    const p = [
      [0, 0],
      [dot(e1, X), 0],
      [dot(e2, X), dot(e2, Y)],
    ];
    const a2 = (p[1]?.[0] ?? 0) * (p[2]?.[1] ?? 0);
    const w = a2 > 1e-14 ? Math.sqrt(a2 / 2) / a2 : 0;
    for (let k = 0; k < 3; k++) {
      ids[i * 3 + k] = slotOf.get(g.corner(t, k)) ?? 0;
      const pj = p[(k + 1) % 3] ?? [0, 0];
      const pk = p[(k + 2) % 3] ?? [0, 0];
      coef[i * 6 + k * 2] = -((pk[1] ?? 0) - (pj[1] ?? 0)) * w;
      coef[i * 6 + k * 2 + 1] = ((pk[0] ?? 0) - (pj[0] ?? 0)) * w;
    }
  });
  // Pins: the extreme slots along T keep their projected positions (sets scale + rotation).
  let lo = 0;
  let hi = 0;
  for (let s = 0; s < N; s++) {
    if ((x[2 * s] ?? 0) < (x[2 * lo] ?? 0)) lo = s;
    if ((x[2 * s] ?? 0) > (x[2 * hi] ?? 0)) hi = s;
  }
  const free = new Uint8Array(2 * N).fill(1);
  for (const s of [lo, hi]) {
    free[2 * s] = 0;
    free[2 * s + 1] = 0;
  }
  if (N > 2 && lo !== hi) cg(x, free, ids, coef, tris.length);
  return finish(g, tris, slotOf, x);
}

/** Scale to true area, measure, gate. */
function finish(
  g: Topo,
  tris: readonly number[],
  slot: Map<number, number>,
  x: Float64Array,
): UvChart {
  const tri3 = tris.map((t) => [0, 1, 2].map((k) => g.pos(g.corner(t, k))));
  const uvAt = (t: number, k: number): [number, number] => {
    const s = slot.get(g.corner(t, k)) ?? 0;
    return [x[2 * s] ?? 0, x[2 * s + 1] ?? 0];
  };
  let a2 = 0;
  let a3 = 0;
  let flips = 0;
  tris.forEach((t, i) => {
    const [p1, p2, p3] = [uvAt(t, 0), uvAt(t, 1), uvAt(t, 2)];
    const s = ((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1])) / 2;
    const [q1, q2, q3] = tri3[i] as V3[];
    const area3 = Math.hypot(...cross(sub(q2 as V3, q1 as V3), sub(q3 as V3, q1 as V3))) / 2;
    if (s <= 0 && area3 > 1e-14) flips++;
    a2 += Math.abs(s);
    a3 += area3;
  });
  const k = a2 > 0 ? Math.sqrt(a3 / a2) : 1;
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * k;
  const tri2 = tris.map((t) => [uvAt(t, 0), uvAt(t, 1), uvAt(t, 2)]);
  const stretch = stretchL2(tri3, tri2);
  const ok = Number.isFinite(stretch) && stretch < STRETCH_MAX && flips === 0 && !overlaps(tri2);
  return { tris, slot, uv: x, stretch, ok };
}

/** Charts of one mesh, each solved and gated (`ok` false = the caller falls back for it). */
export function lscmCharts(m: Mesh, o: LscmOptions = {}): UvChart[] {
  const g = topology(m);
  const out: UvChart[] = [];
  // Wide cones first (fewest seams); a chart that fails the gate is re-cut with a narrower cone,
  // and below 20° handed back failed (the atlas boxes it).
  let todo: number[] = Array.from({ length: g.nt }, (_, t) => t);
  for (let cone = o.cone ?? 180; todo.length > 0; cone *= 0.6) {
    const next: number[] = [];
    for (const tris of segment(g, o, cone, todo)) {
      const c = solve(g, tris);
      if (c.ok || cone < 20) out.push(c);
      else next.push(...tris);
    }
    todo = next;
  }
  return out;
}
