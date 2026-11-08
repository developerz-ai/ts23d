// Quad-mesh tools for the face base: Catmull–Clark subdivision (with open boundaries kept as
// cubic B-spline curves — the LOD0 smoothing a sculptor's multires level gives), smooth
// area-weighted vertex normals, and the conversion to the core Mesh (each quad split along its
// shorter diagonal, UVs projected onto the trim sheet's `plain` strip like the SDF skins).

import { type Mesh, MeshBuilder, type StripId, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';

const ek = (a: number, b: number): number => (a < b ? a * 1048576 + b : b * 1048576 + a);

/** One Catmull–Clark step on a pure quad mesh. Boundary edges stay boundary (B-spline rule). */
export function subdivide(m: QuadMesh): QuadMesh {
  const { p, q } = m;
  const V = p.length / 3;
  const F = q.length / 4;
  const edges = new Map<number, { id: number; a: number; b: number; f: number[] }>();
  for (let f = 0; f < F; f++)
    for (let k = 0; k < 4; k++) {
      const a = q[f * 4 + k] ?? 0;
      const b = q[f * 4 + ((k + 1) % 4)] ?? 0;
      const key = ek(a, b);
      const e = edges.get(key);
      if (e) e.f.push(f);
      else edges.set(key, { id: edges.size, a, b, f: [f] });
    }
  const E = edges.size;
  const out = new Float64Array((V + E + F) * 3);
  const fp = (f: number, k: number): number => out[(V + E + f) * 3 + k] ?? 0;
  for (let f = 0; f < F; f++)
    for (let k = 0; k < 3; k++) {
      let s = 0;
      for (let c = 0; c < 4; c++) s += p[(q[f * 4 + c] ?? 0) * 3 + k] ?? 0;
      out[(V + E + f) * 3 + k] = s / 4;
    }
  // Per-vertex accumulators for the original-point rule.
  const fSum = new Float64Array(V * 3);
  const rSum = new Float64Array(V * 3);
  const val = new Uint32Array(V);
  const nFaces = new Uint32Array(V);
  const bnd = new Float64Array(V * 3);
  const bCount = new Uint32Array(V);
  for (let f = 0; f < F; f++)
    for (let c = 0; c < 4; c++) {
      const v = q[f * 4 + c] ?? 0;
      nFaces[v] = (nFaces[v] ?? 0) + 1;
      for (let k = 0; k < 3; k++) fSum[v * 3 + k] = (fSum[v * 3 + k] ?? 0) + fp(f, k);
    }
  for (const e of edges.values()) {
    const at = (V + e.id) * 3;
    for (let k = 0; k < 3; k++) {
      const mid = ((p[e.a * 3 + k] ?? 0) + (p[e.b * 3 + k] ?? 0)) / 2;
      out[at + k] =
        e.f.length === 2 ? (2 * mid + fp(e.f[0] ?? 0, k) + fp(e.f[1] ?? 0, k)) / 4 : mid;
      rSum[e.a * 3 + k] = (rSum[e.a * 3 + k] ?? 0) + mid;
      rSum[e.b * 3 + k] = (rSum[e.b * 3 + k] ?? 0) + mid;
    }
    val[e.a] = (val[e.a] ?? 0) + 1;
    val[e.b] = (val[e.b] ?? 0) + 1;
    if (e.f.length === 1)
      for (const [v, o] of [
        [e.a, e.b],
        [e.b, e.a],
      ] as const) {
        bCount[v] = (bCount[v] ?? 0) + 1;
        for (let k = 0; k < 3; k++) bnd[v * 3 + k] = (bnd[v * 3 + k] ?? 0) + (p[o * 3 + k] ?? 0);
      }
  }
  for (let v = 0; v < V; v++) {
    const n = val[v] ?? 0;
    for (let k = 0; k < 3; k++) {
      const P = p[v * 3 + k] ?? 0;
      if ((bCount[v] ?? 0) === 2) out[v * 3 + k] = ((bnd[v * 3 + k] ?? 0) + 6 * P) / 8;
      else if ((bCount[v] ?? 0) > 0 || n < 3) out[v * 3 + k] = P;
      else {
        const Fa = (fSum[v * 3 + k] ?? 0) / (nFaces[v] || 1);
        const R = (rSum[v * 3 + k] ?? 0) / n;
        out[v * 3 + k] = (Fa + 2 * R + (n - 3) * P) / n;
      }
    }
  }
  const nq = new Uint32Array(F * 16);
  const eid = (a: number, b: number): number => V + (edges.get(ek(a, b))?.id ?? 0);
  for (let f = 0; f < F; f++)
    for (let c = 0; c < 4; c++) {
      const v = q[f * 4 + c] ?? 0;
      const next = q[f * 4 + ((c + 1) % 4)] ?? 0;
      const prev = q[f * 4 + ((c + 3) % 4)] ?? 0;
      nq.set([v, eid(v, next), V + E + f, eid(prev, v)], (f * 4 + c) * 4);
    }
  return { p: out, q: nq };
}

/** Area-weighted smooth normals (one per vertex). */
export function quadNormals(m: QuadMesh): Float64Array {
  const { p, q } = m;
  const n = new Float64Array(p.length);
  const P = (i: number, k: number): number => p[i * 3 + k] ?? 0;
  for (let f = 0; f < q.length; f += 4) {
    const [a = 0, b = 0, c = 0, d = 0] = q.subarray(f, f + 4);
    // Cross of the diagonals = twice the quad's vector area.
    const u = [P(c, 0) - P(a, 0), P(c, 1) - P(a, 1), P(c, 2) - P(a, 2)];
    const w = [P(d, 0) - P(b, 0), P(d, 1) - P(b, 1), P(d, 2) - P(b, 2)];
    const cx = (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0);
    const cy = (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0);
    const cz = (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0);
    for (const v of [a, b, c, d]) {
      n[v * 3] = (n[v * 3] ?? 0) + cx;
      n[v * 3 + 1] = (n[v * 3 + 1] ?? 0) + cy;
      n[v * 3 + 2] = (n[v * 3 + 2] ?? 0) + cz;
    }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v] ?? 0, n[v + 1] ?? 0, n[v + 2] ?? 1) || 1;
    n[v] = (n[v] ?? 0) / l;
    n[v + 1] = (n[v + 1] ?? 0) / l;
    n[v + 2] = (n[v + 2] ?? 0) / l;
  }
  return n;
}

/** Strip UV the way the SDF skins get theirs: project on the normal's dominant plane, U in
 *  metres along the strip, V mirrored inside one band. */
export function stripUv(strip: StripId): (p: Vec3, n: Vec3) => [number, number] {
  const r = stripRect(strip);
  const half = 0.5 / 4096;
  const vm = 1;
  return (p, n) => {
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    const [s, t] = az >= ax && az >= ay ? [p[0], p[1]] : ax >= ay ? [p[1], p[2]] : [p[0], p[2]];
    const tt = t / vm;
    const m = tt - 2 * Math.floor(tt / 2);
    const f = m <= 1 ? m : 2 - m;
    return [r.u0 + (s / r.metres) * (r.u1 - r.u0), r.v0 + half + f * (r.v1 - r.v0 - 2 * half)];
  };
}

/** The quad mesh as a core Mesh: smooth normals, per-vertex colour, strip UVs from `uv`. */
export function quadToMesh(
  m: QuadMesh,
  color: (v: number, p: Vec3, n: Vec3) => Vec3,
  uv: (p: Vec3, n: Vec3) => [number, number],
): Mesh {
  const n = quadNormals(m);
  const b = new MeshBuilder();
  const V = m.p.length / 3;
  for (let v = 0; v < V; v++) {
    const p: Vec3 = [m.p[v * 3] ?? 0, m.p[v * 3 + 1] ?? 0, m.p[v * 3 + 2] ?? 0];
    const nn: Vec3 = [n[v * 3] ?? 0, n[v * 3 + 1] ?? 0, n[v * 3 + 2] ?? 1];
    b.vertex({ p, n: nn, uv: uv(p, nn), color: color(v, p, nn) });
  }
  const d2 = (a: number, c: number): number =>
    ((m.p[a * 3] ?? 0) - (m.p[c * 3] ?? 0)) ** 2 +
    ((m.p[a * 3 + 1] ?? 0) - (m.p[c * 3 + 1] ?? 0)) ** 2 +
    ((m.p[a * 3 + 2] ?? 0) - (m.p[c * 3 + 2] ?? 0)) ** 2;
  for (let f = 0; f < m.q.length; f += 4) {
    const [a = 0, bb = 0, c = 0, d = 0] = m.q.subarray(f, f + 4);
    if (d2(a, c) <= d2(bb, d)) b.tri(a, bb, c).tri(a, c, d);
    else b.tri(a, bb, d).tri(bb, c, d);
  }
  return b.build();
}
