// The texel-density check for strip-mapped skin (./skin-strip.ts): how far each triangle's
// world → strip map strays from the strip's painted scale, as area-weighted spreads. Even
// density is what keeps pores pores: a triangle squeezed across the row smears them into streaks,
// one tilted off its projection plane stretches them (D550). And a directional strip's pattern
// (a knit's rib, a fine line) must keep its direction from one triangle to the next (D562).

import { dmath, type Mesh, type StripId, stripRect } from '@developerz.ai/ts23d';

export interface TexelSpread {
  /** 95 % of the measured area strays at most this far from true scale (1 = exact; 2 = the
   *  strip read at twice or half its painted scale in some direction). */
  readonly p95: number;
  /** The worst triangle's stray. */
  readonly worst: number;
  /** 95 % of the area is stretched at most this much one way against the other (1 = even; a
   *  triangle squeezed 3× across the row only is 3): the smear, whatever the scale. */
  readonly smear: number;
  /** Area measured, m². */
  readonly area: number;
}

/** The value under which `share` of the weight lies (`rows`: [value, weight]). */
function quantile(rows: [number, number][], share: number): number {
  const sorted = [...rows].sort((x, y) => x[0] - y[0]);
  const total = sorted.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  for (const [k, w] of sorted) {
    acc += w;
    if (acc >= total * share) return k;
  }
  return sorted.at(-1)?.[0] ?? 0;
}

/** How evenly `m`'s triangles on `strips` (rows painted for `row` metres) take their texels:
 *  per triangle, the world → strip map's two principal stretches in true-scale units (U over the
 *  strip's span, V over the row). A triangle's stray is the worse of the larger stretch and
 *  1 / the smaller; its smear is their ratio. Triangles on other strips are not measured. */
export function texelSpread(m: Mesh, strips: readonly StripId[], row: number): TexelSpread {
  const rects = strips.map((s) => stripRect(s));
  const P = m.positions;
  const UV = m.uvs;
  const T = m.indices;
  const stray: [number, number][] = [];
  const smear: [number, number][] = [];
  const at = (v: number, k: number): number => P[v * 3 + k] ?? 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a = 0, b = 0, c = 0] = [T[t], T[t + 1], T[t + 2]];
    const v = ((UV[a * 2 + 1] ?? 0) + (UV[b * 2 + 1] ?? 0) + (UV[c * 2 + 1] ?? 0)) / 3;
    const r = rects.find((q) => v >= Math.min(q.v0, q.v1) && v <= Math.max(q.v0, q.v1));
    if (!r) continue;
    const [x1, y1, z1] = [at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)];
    const [x2, y2, z2] = [at(c, 0) - at(a, 0), at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)];
    const l1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
    const cx = y1 * z2 - z1 * y2;
    const cy = z1 * x2 - x1 * z2;
    const cz = x1 * y2 - y1 * x2;
    const twice = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (l1 === 0 || twice < 1e-12) continue;
    // In the triangle's own plane: AB = (l1, 0), AC = (p, q), metres.
    const p = (x1 * x2 + y1 * y2 + z1 * z2) / l1;
    const q = twice / l1;
    const su = r.metres / (r.u1 - r.u0);
    const sv = row / (r.v1 - r.v0);
    const du1 = ((UV[b * 2] ?? 0) - (UV[a * 2] ?? 0)) * su;
    const dv1 = ((UV[b * 2 + 1] ?? 0) - (UV[a * 2 + 1] ?? 0)) * sv;
    const du2 = ((UV[c * 2] ?? 0) - (UV[a * 2] ?? 0)) * su;
    const dv2 = ((UV[c * 2 + 1] ?? 0) - (UV[a * 2 + 1] ?? 0)) * sv;
    // The plane → strip Jacobian's columns, then its singular values from norm and determinant.
    const j11 = du1 / l1;
    const j21 = dv1 / l1;
    const j12 = (du2 - j11 * p) / q;
    const j22 = (dv2 - j21 * p) / q;
    const f = j11 * j11 + j12 * j12 + j21 * j21 + j22 * j22;
    const det = Math.abs(j11 * j22 - j12 * j21);
    const g = Math.sqrt(Math.max(0, f * f - 4 * det * det));
    const big = Math.sqrt((f + g) / 2);
    const small = Math.sqrt(Math.max(0, (f - g) / 2));
    const w = twice / 2;
    stray.push([small > 0 ? Math.max(big, 1 / small) : Number.POSITIVE_INFINITY, w]);
    smear.push([small > 0 ? big / small : Number.POSITIVE_INFINITY, w]);
  }
  return {
    p95: quantile(stray, 0.95),
    worst: quantile(stray, 1),
    smear: quantile(smear, 0.95),
    area: stray.reduce((s, [, w]) => s + w, 0),
  };
}

/** The share of the length of `m`'s shared edges, between two triangles on `strips`, across which
 *  the strip's V direction turns more than `degrees` (measured against the edge in each
 *  triangle's own plane, as lines: 0 … 90°). A knit mapped with a jump there breaks into patches
 *  along the edge; an isotropic strip hides it. Edges are matched by position (the mapping splits
 *  vertices at its seams). */
export function directionJumps(m: Mesh, strips: readonly StripId[], degrees: number): number {
  const rects = strips.map((s) => stripRect(s));
  const P = m.positions;
  const UV = m.uvs;
  const T = m.indices;
  const p = (v: number): [number, number, number] => [
    P[v * 3] ?? 0,
    P[v * 3 + 1] ?? 0,
    P[v * 3 + 2] ?? 0,
  ];
  const key = (v: number): string =>
    p(v)
      .map((x) => Math.round(x * 1e6))
      .join(',');
  const edges = new Map<string, number[]>();
  // Per triangle: unit normal and the 3D gradient of V on it.
  const frames: { n: number[]; g: number[] }[] = [];
  for (let t = 0; t < T.length; t += 3) {
    const vs = [T[t] ?? 0, T[t + 1] ?? 0, T[t + 2] ?? 0];
    const [a, b, c] = vs.map(p);
    if (!a || !b || !c) continue;
    const vm =
      ((UV[(vs[0] ?? 0) * 2 + 1] ?? 0) +
        (UV[(vs[1] ?? 0) * 2 + 1] ?? 0) +
        (UV[(vs[2] ?? 0) * 2 + 1] ?? 0)) /
      3;
    if (!rects.some((q) => vm >= Math.min(q.v0, q.v1) && vm <= Math.max(q.v0, q.v1))) continue;
    const e1: T3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: T3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const N = cross(e1, e2);
    const nn = N[0] * N[0] + N[1] * N[1] + N[2] * N[2];
    if (nn < 1e-20) continue;
    const dv1 = (UV[(vs[1] ?? 0) * 2 + 1] ?? 0) - (UV[(vs[0] ?? 0) * 2 + 1] ?? 0);
    const dv2 = (UV[(vs[2] ?? 0) * 2 + 1] ?? 0) - (UV[(vs[0] ?? 0) * 2 + 1] ?? 0);
    // ∇v = (Δv1 (e2 × N) + Δv2 (N × e1)) / |N|².
    const x = cross(e2, N);
    const y = cross(N, e1);
    const g = [0, 1, 2].map((k) => (dv1 * (x[k] ?? 0) + dv2 * (y[k] ?? 0)) / nn);
    const ln = Math.sqrt(nn);
    const f = frames.push({ n: N.map((k) => k / ln), g }) - 1;
    for (let i = 0; i < 3; i++) {
      const [ka, kb] = [key(vs[i] ?? 0), key(vs[(i + 1) % 3] ?? 0)];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const list = edges.get(k) ?? [];
      list.push(f, vs[i] ?? 0, vs[(i + 1) % 3] ?? 0);
      edges.set(k, list);
    }
  }
  let all = 0;
  let jumped = 0;
  for (const list of edges.values()) {
    if (list.length !== 6) continue;
    const [fa = 0, a0 = 0, a1 = 0, fb = 0] = list;
    const [pa, pb] = [p(a0), p(a1)];
    const e: T3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const len = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    // The V direction's angle from the edge, signed in each triangle's plane (as a line: mod 180°).
    const angle = (fr: { n: number[]; g: number[] }): number => {
      const c = cross(e, fr.g);
      const sin =
        (c[0] ?? 0) * (fr.n[0] ?? 0) + (c[1] ?? 0) * (fr.n[1] ?? 0) + (c[2] ?? 0) * (fr.n[2] ?? 0);
      const cos =
        (e[0] ?? 0) * (fr.g[0] ?? 0) + (e[1] ?? 0) * (fr.g[1] ?? 0) + (e[2] ?? 0) * (fr.g[2] ?? 0);
      return (dmath.atan2(sin, cos) * 180) / Math.PI;
    };
    const A = frames[fa];
    const B = frames[fb];
    if (!A || !B) continue;
    const d = Math.abs(angle(A) - angle(B)) % 180;
    all += len;
    if (Math.min(d, 180 - d) > degrees) jumped += len;
  }
  return all > 0 ? jumped / all : 0;
}

type T3 = [number, number, number];
const cross = (a: readonly number[], b: readonly number[]): T3 => [
  (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
  (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
  (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];
