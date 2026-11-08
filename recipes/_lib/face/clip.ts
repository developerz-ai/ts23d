// Bust cuts: clip a closed-enough skin mesh by planes and cap each cut flat, the way a sculptor
// saws a bust off at the chest and the arms. Each plane keeps the side its normal points away
// from; cut edges are shared between neighbours (no cracks); every cut loop is triangulated into
// a cap facing along the plane normal, in its own colour. Planes apply in order, so a later plane
// also trims the earlier caps and its loops close.

import { type Mesh, MeshBuilder, triangulate, type Vec3 } from '@developerz.ai/ts23d';

export interface Cut {
  readonly at: Vec3;
  /** Points to the side that is removed. */
  readonly normal: Vec3;
}

interface Soup {
  p: number[];
  n: number[];
  uv: number[];
  c: number[];
  t: number[];
}

const soup = (m: Mesh): Soup => ({
  p: [...m.positions],
  n: [...m.normals],
  uv: [...m.uvs],
  c: [...m.colors],
  t: [...m.indices],
});

function clipOnce(s: Soup, cut: Cut, cap: Vec3): Soup {
  const len = Math.hypot(...cut.normal) || 1;
  const N: Vec3 = [cut.normal[0] / len, cut.normal[1] / len, cut.normal[2] / len];
  const d = (i: number): number =>
    ((s.p[i * 3] ?? 0) - cut.at[0]) * N[0] +
    ((s.p[i * 3 + 1] ?? 0) - cut.at[1]) * N[1] +
    ((s.p[i * 3 + 2] ?? 0) - cut.at[2]) * N[2];
  const V = s.p.length / 3;
  const dist = Array.from({ length: V }, (_, i) => d(i));
  const out: Soup = { p: [], n: [], uv: [], c: [], t: [] };
  const map = new Map<number, number>();
  const keep = (i: number): number => {
    const hit = map.get(i);
    if (hit !== undefined) return hit;
    const j = out.p.length / 3;
    out.p.push(s.p[i * 3] ?? 0, s.p[i * 3 + 1] ?? 0, s.p[i * 3 + 2] ?? 0);
    out.n.push(s.n[i * 3] ?? 0, s.n[i * 3 + 1] ?? 0, s.n[i * 3 + 2] ?? 0);
    out.uv.push(s.uv[i * 2] ?? 0, s.uv[i * 2 + 1] ?? 0);
    out.c.push(s.c[i * 3] ?? 0, s.c[i * 3 + 1] ?? 0, s.c[i * 3 + 2] ?? 0);
    map.set(i, j);
    return j;
  };
  const cutMap = new Map<string, number>();
  const onEdge = (a: number, b: number): number => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const hit = cutMap.get(key);
    if (hit !== undefined) return hit;
    const t = (dist[a] ?? 0) / ((dist[a] ?? 0) - (dist[b] ?? 0));
    const lerp = (arr: number[], k: number, w: number): number =>
      (arr[a * w + k] ?? 0) + ((arr[b * w + k] ?? 0) - (arr[a * w + k] ?? 0)) * t;
    const j = out.p.length / 3;
    for (let k = 0; k < 3; k++) out.p.push(lerp(s.p, k, 3));
    for (let k = 0; k < 3; k++) out.n.push(lerp(s.n, k, 3));
    for (let k = 0; k < 2; k++) out.uv.push(lerp(s.uv, k, 2));
    for (let k = 0; k < 3; k++) out.c.push(lerp(s.c, k, 3));
    cutMap.set(key, j);
    return j;
  };
  const segs: [number, number][] = [];
  for (let f = 0; f < s.t.length; f += 3) {
    const tri = [s.t[f] ?? 0, s.t[f + 1] ?? 0, s.t[f + 2] ?? 0];
    const inside = tri.map((i) => (dist[i] ?? 0) <= 0);
    const nIn = inside.filter(Boolean).length;
    if (nIn === 3) {
      out.t.push(keep(tri[0] ?? 0), keep(tri[1] ?? 0), keep(tri[2] ?? 0));
      continue;
    }
    if (nIn === 0) continue;
    // Rotate so the odd one out is first.
    const lone = nIn === 1 ? inside.indexOf(true) : inside.indexOf(false);
    const a = tri[lone] ?? 0;
    const b = tri[(lone + 1) % 3] ?? 0;
    const c = tri[(lone + 2) % 3] ?? 0;
    const ab = onEdge(a, b);
    const ac = onEdge(a, c);
    if (nIn === 1) {
      out.t.push(keep(a), ab, ac);
      segs.push([ab, ac]);
    } else {
      out.t.push(ab, keep(b), keep(c), ab, keep(c), ac);
      segs.push([ac, ab]);
    }
  }
  capLoops(out, segs, N, cap);
  return out;
}

/** Chain cut segments into loops and fill each with a flat cap facing N. */
function capLoops(out: Soup, segs: [number, number][], N: Vec3, cap: Vec3): void {
  // Chain by position, not index: a cap from an earlier cut has its own vertices on the seam.
  const key = (i: number): string =>
    `${Math.round((out.p[i * 3] ?? 0) * 1e6)},${Math.round((out.p[i * 3 + 1] ?? 0) * 1e6)},${Math.round((out.p[i * 3 + 2] ?? 0) * 1e6)}`;
  const next = new Map<string, number>();
  const at = new Map<string, number>();
  for (const [a, b] of segs) {
    next.set(key(a), b);
    at.set(key(a), a);
  }
  const u: Vec3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  // Frame (U, W) on the plane with U × W = N, so CCW triangles face N.
  const W: Vec3 = [N[1] * u[2] - N[2] * u[1], N[2] * u[0] - N[0] * u[2], N[0] * u[1] - N[1] * u[0]];
  const wl = Math.hypot(...W) || 1;
  const Wn: Vec3 = [W[0] / wl, W[1] / wl, W[2] / wl];
  const U: Vec3 = [
    Wn[1] * N[2] - Wn[2] * N[1],
    Wn[2] * N[0] - Wn[0] * N[2],
    Wn[0] * N[1] - Wn[1] * N[0],
  ];
  const seen = new Set<string>();
  for (const [a] of segs) {
    const start = key(a);
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let k: string | undefined = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(at.get(k) ?? 0);
      const b = next.get(k);
      k = b === undefined ? undefined : key(b);
    }
    if (loop.length < 3 || k !== start) continue;
    const base = out.p.length / 3;
    const poly = loop.map((i): [number, number] => {
      const p: Vec3 = [out.p[i * 3] ?? 0, out.p[i * 3 + 1] ?? 0, out.p[i * 3 + 2] ?? 0];
      out.p.push(...p);
      out.n.push(...N);
      out.uv.push(out.uv[i * 2] ?? 0, out.uv[i * 2 + 1] ?? 0);
      out.c.push(...cap);
      return [p[0] * U[0] + p[1] * U[1] + p[2] * U[2], p[0] * Wn[0] + p[1] * Wn[1] + p[2] * Wn[2]];
    });
    for (const [a, b, c] of triangulate(poly)) out.t.push(base + a, base + b, base + c);
  }
}

/** Clip by every cut in order, capping each. */
export function clipCap(m: Mesh, cuts: readonly Cut[], cap: Vec3): Mesh {
  let s = soup(m);
  for (const c of cuts) s = clipOnce(s, c, cap);
  const b = new MeshBuilder();
  for (let i = 0; i < s.p.length / 3; i++)
    b.vertex({
      p: [s.p[i * 3] ?? 0, s.p[i * 3 + 1] ?? 0, s.p[i * 3 + 2] ?? 0],
      n: [s.n[i * 3] ?? 0, s.n[i * 3 + 1] ?? 0, s.n[i * 3 + 2] ?? 1],
      uv: [s.uv[i * 2] ?? 0, s.uv[i * 2 + 1] ?? 0],
      color: [s.c[i * 3] ?? 0, s.c[i * 3 + 1] ?? 0, s.c[i * 3 + 2] ?? 0],
    });
  for (let f = 0; f < s.t.length; f += 3) b.tri(s.t[f] ?? 0, s.t[f + 1] ?? 0, s.t[f + 2] ?? 0);
  return b.build();
}
