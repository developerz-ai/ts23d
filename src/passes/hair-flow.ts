// Hair flow field on a mesh: one unit tangent per vertex saying which way the hair lies. Seeds come
// from a direction function (bone chains: tailward along the spine, distal down the legs, plus
// gravity), are projected onto each vertex's tangent plane and Jacobi-smoothed over the welded
// vertex graph, so the comb flows without kinks across seams. `flowAt` interpolates it inside a
// triangle; `flowDivergence` measures sources/sinks (a combed coat is close to divergence-free).

import { dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';

/** Preferred hair direction at a surface point (any length; length = confidence). */
export type FlowSeed = (p: Vec3, n: Vec3) => Vec3;

export interface FlowOptions {
  /** Jacobi sweeps over the vertex graph. Default 12. */
  readonly iterations?: number;
  /** 0..1: how hard each vertex holds its own seed against its neighbours. Default 0.35. */
  readonly keep?: number;
}

/** A chain hair lies along, `points[0]` → last (spine front → rear, shoulder → paw, tail root → tip). */
export interface FlowChain {
  readonly points: readonly Vec3[];
  /** Relative pull against other chains at the same distance. Default 1. */
  readonly weight?: number;
}

const at3 = (a: ArrayLike<number>, i: number): Vec3 => [
  a[i * 3] ?? 0,
  a[i * 3 + 1] ?? 0,
  a[i * 3 + 2] ?? 0,
];

/** v minus its component along unit n, normalised; a fallback tangent when v ∥ n. */
export function tangentOf(v: Vec3, n: Vec3): Vec3 {
  const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  let t: Vec3 = [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d];
  let l = dmath.hypot(t[0], t[1], t[2]);
  if (l < 1e-9) {
    // Deterministic fallback: the world axis least aligned with n, made tangent.
    const ax: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, -1] : [-1, 0, 0];
    const e = ax[0] * n[0] + ax[1] * n[1] + ax[2] * n[2];
    t = [ax[0] - n[0] * e, ax[1] - n[1] * e, ax[2] - n[2] * e];
    l = dmath.hypot(t[0], t[1], t[2]) || 1;
  }
  return [t[0] / l, t[1] / l, t[2] / l];
}

/** Welded vertex graph: vertices at the same position (to 1 µm) are one node. */
function graph(m: Mesh): { node: Int32Array; nodes: number; adj: number[][] } {
  const n = m.positions.length / 3;
  const node = new Int32Array(n);
  const key = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const p = at3(m.positions, i);
    const k = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = key.size;
      key.set(k, id);
    }
    node[i] = id;
  }
  const adj: Set<number>[] = Array.from({ length: key.size }, () => new Set<number>());
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => node[m.indices[t + k] ?? 0] ?? 0);
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) if (a !== b) adj[v[a] ?? 0]?.add(v[b] ?? 0);
  }
  return { node, nodes: key.size, adj: adj.map((s) => [...s].sort((a, b) => a - b)) };
}

/** Per-vertex unit tangent (3 floats each) combed from `seed` and smoothed over the mesh. */
export function hairFlow(m: Mesh, seed: FlowSeed, o: FlowOptions = {}): Float32Array {
  const iterations = o.iterations ?? 12;
  const keep = o.keep ?? 0.35;
  if (!(Number.isInteger(iterations) && iterations >= 0 && keep >= 0 && keep <= 1))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `hairFlow: iterations ${iterations}, keep ${keep}`,
      fix: 'iterations is a whole number ≥ 0 and keep is 0..1',
    });
  const { node, nodes, adj } = graph(m);
  const nrm = new Float64Array(nodes * 3);
  const pos = new Float64Array(nodes * 3);
  for (let i = 0; i < node.length; i++) {
    const g = node[i] ?? 0;
    for (let k = 0; k < 3; k++) {
      nrm[g * 3 + k] = (nrm[g * 3 + k] ?? 0) + (m.normals[i * 3 + k] ?? 0);
      pos[g * 3 + k] = m.positions[i * 3 + k] ?? 0;
    }
  }
  const N: Vec3[] = [];
  const S: Vec3[] = [];
  for (let g = 0; g < nodes; g++) {
    const v = at3(nrm, g);
    const l = dmath.hypot(v[0], v[1], v[2]) || 1;
    const n: Vec3 = [v[0] / l, v[1] / l, v[2] / l];
    N.push(n);
    const s = seed(at3(pos, g), n);
    if (!s.every(Number.isFinite))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `hairFlow: the seed returned [${s}] at [${at3(pos, g)}]`,
        fix: 'return a finite direction from the flow seed (guard divisions by zero)',
      });
    S.push(s);
  }
  let cur: Vec3[] = S.map((s, g) => tangentOf(s, N[g] ?? [0, 0, 1]));
  for (let it = 0; it < iterations; it++) {
    cur = cur.map((d, g) => {
      const s = S[g] ?? d;
      const sl = dmath.hypot(s[0], s[1], s[2]) || 1;
      const acc = [(s[0] / sl) * keep, (s[1] / sl) * keep, (s[2] / sl) * keep];
      const nb = adj[g] ?? [];
      const w = nb.length > 0 ? (1 - keep) / nb.length : 0;
      for (const j of nb) {
        const q = cur[j] ?? d;
        acc[0] = (acc[0] ?? 0) + q[0] * w;
        acc[1] = (acc[1] ?? 0) + q[1] * w;
        acc[2] = (acc[2] ?? 0) + q[2] * w;
      }
      if (nb.length === 0) for (let k = 0; k < 3; k++) acc[k] = (acc[k] ?? 0) + (d[k] ?? 0);
      return tangentOf([acc[0] ?? 0, acc[1] ?? 0, acc[2] ?? 0], N[g] ?? [0, 0, 1]);
    });
  }
  const out = new Float32Array(node.length * 3);
  for (let i = 0; i < node.length; i++) out.set(cur[node[i] ?? 0] ?? [1, 0, 0], i * 3);
  return out;
}

/** Flow inside triangle `t` at barycentrics (1 − b1 − b2, b1, b2), re-normalised. */
export function flowAt(m: Mesh, flow: Float32Array, t: number, b1: number, b2: number): Vec3 {
  const w = [1 - b1 - b2, b1, b2];
  const d = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const v = m.indices[t * 3 + k] ?? 0;
    for (let c = 0; c < 3; c++) d[c] = (d[c] ?? 0) + (flow[v * 3 + c] ?? 0) * (w[k] ?? 0);
  }
  const l = dmath.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0) || 1;
  return [(d[0] ?? 0) / l, (d[1] ?? 0) / l, (d[2] ?? 0) / l];
}

/** A seed from chains (nearest segment wins, softly) plus `gravity` × straight down. */
export function chainSeed(
  chains: readonly FlowChain[],
  o: { gravity?: number; blend?: number } = {},
): FlowSeed {
  const g = o.gravity ?? 0;
  // Blend width (metres): 0 = the nearest chain wins sharply; larger = smoother hand-overs.
  const e = dmath.pow(Math.max(1e-4, o.blend ?? 0), 2);
  const segs: { a: Vec3; d: Vec3; len: number; w: number }[] = [];
  for (const c of chains)
    for (let i = 0; i + 1 < c.points.length; i++) {
      const a = c.points[i] ?? [0, 0, 0];
      const b = c.points[i + 1] ?? a;
      const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len = dmath.hypot(d[0], d[1], d[2]);
      if (len > 1e-9)
        segs.push({ a, d: [d[0] / len, d[1] / len, d[2] / len], len, w: c.weight ?? 1 });
    }
  if (segs.length === 0 && g === 0)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: 'chainSeed: no chain has two distinct points and gravity is 0',
      fix: 'give at least one chain of ≥ 2 points (spine, leg, tail) or a gravity pull',
    });
  return (p) => {
    // Soft-min over segment distances: weight ∝ w / (d² + ε), so chains blend where they meet.
    const acc = [0, 0, 0];
    let total = 0;
    for (const s of segs) {
      const r: Vec3 = [p[0] - s.a[0], p[1] - s.a[1], p[2] - s.a[2]];
      const u = Math.max(0, Math.min(s.len, r[0] * s.d[0] + r[1] * s.d[1] + r[2] * s.d[2]));
      const q = [r[0] - s.d[0] * u, r[1] - s.d[1] * u, r[2] - s.d[2] * u];
      const dd = dmath.pow(q[0] ?? 0, 2) + dmath.pow(q[1] ?? 0, 2) + dmath.pow(q[2] ?? 0, 2);
      const w = s.w / dmath.pow(dd + e, 2);
      total += w;
      for (let k = 0; k < 3; k++) acc[k] = (acc[k] ?? 0) + (s.d[k] ?? 0) * w;
    }
    const k = total > 0 ? 1 / total : 0;
    return [(acc[0] ?? 0) * k, (acc[1] ?? 0) * k, (acc[2] ?? 0) * k - g];
  };
}

/** Mean |divergence| of the flow per unit length, area-weighted (per-triangle linear gradient). */
export function flowDivergence(m: Mesh, flow: Float32Array): number {
  let sum = 0;
  let area = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const i = [0, 1, 2].map((k) => m.indices[t + k] ?? 0);
    const P = i.map((v) => at3(m.positions, v));
    const F = i.map((v) => at3(flow, v));
    const [a, b, c] = [P[0] ?? [0, 0, 0], P[1] ?? [0, 0, 0], P[2] ?? [0, 0, 0]];
    const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const a2 = dmath.hypot(n[0], n[1], n[2]);
    if (a2 < 1e-14) continue;
    // ∇λ_k = (n × e_k) / 2A with e_k the edge opposite vertex k; div = Σ F_k · ∇λ_k.
    let div = 0;
    for (let k = 0; k < 3; k++) {
      const p = P[(k + 1) % 3] ?? a;
      const q = P[(k + 2) % 3] ?? a;
      const e: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const g: Vec3 = [
        n[1] * e[2] - n[2] * e[1],
        n[2] * e[0] - n[0] * e[2],
        n[0] * e[1] - n[1] * e[0],
      ];
      const f = F[k] ?? [0, 0, 0];
      div += (f[0] * g[0] + f[1] * g[1] + f[2] * g[2]) / (a2 * a2);
    }
    sum += Math.abs(div) * a2;
    area += a2;
  }
  return area > 0 ? sum / area : 0;
}
