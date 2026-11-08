// One half-edge collapse a → b, judged and applied by `simplify`: the faces it removes, the link
// condition (the points both a and b see must be exactly the apexes of those faces, so no edge
// becomes non-manifold and closed stays closed), the fold-over test (no remaining face around a
// turns by more than ~78° when a moves onto b), and the final compaction to a Mesh.

import type { Mesh } from '../core/index.ts';
import type { Topology } from './simplify-topology.ts';

/** Live neighbour points of p, ascending. */
export function neighbours(T: Topology, alive: Uint8Array, p: number): number[] {
  const out = new Set<number>();
  for (const f of T.inc[p] ?? []) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const q = T.pt[T.tri[f * 3 + k] ?? 0] ?? 0;
      if (q !== p) out.add(q);
    }
  }
  return [...out].sort((x, y) => x - y);
}

const FOLD = 0.2;

/** The faces removed by collapsing a onto b, or null when the collapse is not allowed. */
export function collapseValid(
  T: Topology,
  alive: Uint8Array,
  a: number,
  b: number,
): number[] | null {
  const dead: number[] = [];
  const apex = new Set<number>();
  const pa = T.inc[a] ?? [];
  const seen = new Set<number>();
  for (const f of pa) {
    if (!alive[f] || seen.has(f)) continue;
    seen.add(f);
    let hasB = false;
    for (let k = 0; k < 3; k++) if (T.pt[T.tri[f * 3 + k] ?? 0] === b) hasB = true;
    if (!hasB) continue;
    dead.push(f);
    for (let k = 0; k < 3; k++) {
      const q = T.pt[T.tri[f * 3 + k] ?? 0] ?? 0;
      if (q !== a && q !== b) apex.add(q);
    }
  }
  if (dead.length === 0 || dead.length > 2) return null;
  const na = neighbours(T, alive, a);
  const nb = new Set(neighbours(T, alive, b));
  let common = 0;
  for (const q of na)
    if (nb.has(q)) {
      if (!apex.has(q)) return null;
      common++;
    }
  if (common !== apex.size) return null;
  // A closed shell must keep at least a tetrahedron.
  if (na.length <= 2 || nb.size <= 2) return null;
  const P = T.pos;
  for (const f of seen) {
    if (dead.includes(f)) continue;
    const v = [0, 1, 2].map((k) => T.pt[T.tri[f * 3 + k] ?? 0] ?? 0);
    const before = normal(P, v);
    const after = normal(
      P,
      v.map((q) => (q === a ? b : q)),
    );
    const lb = Math.hypot(...before);
    const la = Math.hypot(...after);
    if (la < 1e-14 * Math.max(lb, 1e-30)) return null;
    const dot = before[0] * after[0] + before[1] * after[1] + before[2] * after[2];
    if (dot < FOLD * lb * la) return null;
  }
  return dead;
}

function normal(P: Float64Array, v: readonly number[]): [number, number, number] {
  const [a, b, c] = v.map((q) => q * 3) as [number, number, number];
  const ux = (P[b] ?? 0) - (P[a] ?? 0);
  const uy = (P[b + 1] ?? 0) - (P[a + 1] ?? 0);
  const uz = (P[b + 2] ?? 0) - (P[a + 2] ?? 0);
  const vx = (P[c] ?? 0) - (P[a] ?? 0);
  const vy = (P[c + 1] ?? 0) - (P[a + 1] ?? 0);
  const vz = (P[c + 2] ?? 0) - (P[a + 2] ?? 0);
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

/** Live faces, their wedges renumbered by first appearance. */
export function compact(m: Mesh, T: Topology, alive: Uint8Array): Mesh {
  const map = new Map<number, number>();
  const order: number[] = [];
  const idx: number[] = [];
  for (let f = 0; f < alive.length; f++) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const w = T.tri[f * 3 + k] ?? 0;
      let n = map.get(w);
      if (n === undefined) {
        n = order.length;
        map.set(w, n);
        order.push(w);
      }
      idx.push(n);
    }
  }
  const pick = (src: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(order.length * k);
    order.forEach((w, i) => {
      for (let j = 0; j < k; j++) out[i * k + j] = src[w * k + j] ?? 0;
    });
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices: Uint32Array.from(idx),
  };
}
