// Exact tessellation for weathering (`tessellation: 'exact'`): vertices `maxEdge` apart, not
// halved until they fit. Every edge of the input is cut into ⌈L / maxEdge⌉ equal parts (they
// depend only on the edge's length and ends, so co-located hard edges of two faces get the same
// points: no cracks, no T-junctions). Each triangle is then filled from its widest corner with a
// lattice of those two sides' parts (cells split along their shorter diagonal), and the strip
// left between the lattice and the third side is zipped to that side's own points.
// Tolerance: edges along input edges and lattice rows are ≤ maxEdge and > maxEdge / 2 (unless
// the input edge was shorter); cell diagonals and zip edges are ≤ √2 × maxEdge.

import type { Grow } from './weather-subdivide.ts';

/** Indices of `idx` refined so that the vertices of `g` lie `maxEdge` apart. */
export function exactIndices(g: Grow, idx: readonly number[], maxEdge: number): number[] {
  const lines = new Map<string, number[]>();
  /** Vertices along a → b (both ends included), ⌈L / maxEdge⌉ equal parts, made once per pair. */
  const line = (a: number, b: number): number[] => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = `${lo},${hi}`;
    let pts = lines.get(key);
    if (!pts) {
      // (1e-9: an edge exactly n parts long must not become n + 1 by rounding.)
      const n = Math.max(1, Math.ceil(Math.sqrt(g.len2(lo, hi)) / maxEdge - 1e-9));
      pts = [lo];
      for (let i = 1; i < n; i++) pts.push(g.mix([lo, hi], [(n - i) / n, i / n]));
      pts.push(hi);
      lines.set(key, pts);
    }
    return a < b ? pts : [...pts].reverse();
  };
  const out: number[] = [];
  const tri = (a: number, b: number, c: number): void => {
    if (a !== b && b !== c && c !== a) out.push(a, b, c);
  };
  const P = (v: number, k: number): number => g.p[v * 3 + k] ?? 0;
  /** Twice the area of a, b, c signed along the normal of x, y, z (> 0: wound the same way). */
  const signed = (a: number, b: number, c: number, x: number, y: number, z: number): number => {
    const cr = (o: number, p: number, q: number): number[] =>
      [0, 1, 2].map((k) => {
        const [i, j] = [(k + 1) % 3, (k + 2) % 3];
        return (
          (P(p, i) - P(o, i)) * (P(q, j) - P(o, j)) - (P(p, j) - P(o, j)) * (P(q, i) - P(o, i))
        );
      });
    const [u, n] = [cr(a, b, c), cr(x, y, z)];
    return (u[0] ?? 0) * (n[0] ?? 0) + (u[1] ?? 0) * (n[1] ?? 0) + (u[2] ?? 0) * (n[2] ?? 0);
  };
  /**
   * Triangles between two polylines with the same ends, `outer` on the right of `inner`: each
   * step advances the side with the shorter new edge, never into a triangle wound backwards
   * (`f`: the face, for the winding).
   */
  const zip = (outer: readonly number[], inner: readonly number[], f: readonly number[]): void => {
    const [x = 0, y = 0, z = 0] = f;
    let a = 0;
    let b = 0;
    while (a < outer.length - 1 || b < inner.length - 1) {
      const [oa, ib] = [outer[a] ?? 0, inner[b] ?? 0];
      const [o1, i1] = [outer[a + 1] ?? oa, inner[b + 1] ?? ib];
      // Neither side reaches the shared end while the other has more than one step left: the
      // rest would fan from that end (along the side itself: triangles without area).
      const [la, lb] = [outer.length - 1 - a, inner.length - 1 - b];
      const canOuter = la > 1 || (la === 1 && lb <= 1);
      const canInner = lb > 1 || (lb === 1 && la <= 1);
      const okOuter = canOuter && (oa === ib || signed(oa, o1, ib, x, y, z) > 0);
      const okInner = canInner && (oa === ib || signed(oa, i1, ib, x, y, z) > 0);
      // A step up the lattice's staircase is only good until the outer side passes it: take it
      // now if one more outer step would wind it backwards.
      const last = okInner && okOuter && signed(o1, i1, ib, x, y, z) <= 0;
      const stepOuter =
        !last &&
        (okOuter !== okInner
          ? okOuter
          : !canInner || (canOuter && g.len2(o1, ib) <= g.len2(oa, i1)));
      if (stepOuter) tri(oa, outer[++a] ?? 0, ib);
      else tri(oa, inner[++b] ?? 0, ib);
    }
  };
  /** Fill triangle x, y, z (x its widest corner): lattice on x→y × x→z, zip to y→z. */
  const fill = (x: number, y: number, z: number): void => {
    const row0 = line(x, y);
    const col = line(x, z);
    const nb = row0.length - 1;
    const nc = col.length - 1;
    const margin = 0.5 / Math.max(nb, nc);
    const rows: number[][] = [row0];
    for (let j = 1; j <= nc; j++) {
      const row = [col[j] ?? z];
      for (let i = 1; i / nb + j / nc <= 1 - margin; i++)
        row.push(g.mix([x, y, z], [1 - i / nb - j / nc, i / nb, j / nc]));
      rows.push(row);
    }
    // The lattice's edge toward y → z: down each row to where the next one ends, then up to it.
    const front: number[] = [];
    for (let j = 0; j < nc; j++) {
      const lo = rows[j] ?? [];
      const hi = rows[j + 1] ?? [];
      for (let i = 0; i + 1 < hi.length; i++) {
        const [p, q, r, s] = [lo[i] ?? 0, lo[i + 1] ?? 0, hi[i + 1] ?? 0, hi[i] ?? 0];
        if (g.len2(p, r) <= g.len2(q, s)) out.push(p, q, r, p, r, s);
        else out.push(p, q, s, q, r, s);
      }
      for (let i = lo.length - 1; i >= hi.length - 1; i--) front.push(lo[i] ?? 0);
    }
    front.push(z);
    zip(line(y, z), front, [x, y, z]);
  };
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] ?? 0, idx[t + 1] ?? 0, idx[t + 2] ?? 0];
    // The widest corner faces the longest side (ties: the first).
    const [ab, bc, ca] = [g.len2(a, b), g.len2(b, c), g.len2(c, a)];
    if (bc >= ca && bc >= ab) fill(a, b, c);
    else if (ca >= ab) fill(b, c, a);
    else fill(c, a, b);
  }
  return out;
}
