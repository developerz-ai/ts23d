// Panel mesher: cuts a region out of a parametric surface S(s, u) and meshes it as a pressed
// steel/GRP panel — the outer skin (smooth analytic normals), an inner skin `thickness` behind it
// and a return flange around the edge, so panel gaps read as real 3–5 mm shut lines with depth.
// A region is rows of constant s, each spanning u ∈ [lo(s), hi(s)] (wheel arches, cockpit cuts
// and slanted shut lines are just lo/hi functions). UVs run in true metres along s and u.

import { type Mesh, MeshBuilder, type StripId, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import { add, cross, dot, len, mul, sub, unit } from './geo.ts';

/** A parametric surface evaluated one row (constant s) at a time, so rows can be cached. */
export interface Surface {
  row(s: number): (u: number) => Vec3;
  /** Parameter domain, for clamped finite differences. */
  readonly sRange: readonly [number, number];
  readonly uRange: readonly [number, number];
}

export type ColorFn = Vec3 | ((p: Vec3, n: Vec3) => Vec3);

export interface PatchOptions {
  readonly s0: number;
  readonly s1: number;
  /** Rows (s steps). */
  readonly ns: number;
  /** Columns (u steps). */
  readonly nu: number;
  readonly lo: number | ((s: number) => number);
  readonly hi: number | ((s: number) => number);
  readonly color: ColorFn;
  readonly strip?: StripId;
  /** Skin thickness; 0 = a single outer sheet (no inner skin, no flange). */
  readonly thickness?: number;
  /** Rows as explicit s values instead of uniform (overrides s0/s1/ns spacing). */
  readonly sAt?: (i: number) => number;
  /** Push every outer vertex along its normal (m): a panel standing proud of its neighbour. */
  readonly lift?: number;
  /** Which edges get a flange; default all four. */
  readonly rims?: {
    readonly s0?: boolean;
    readonly s1?: boolean;
    readonly lo?: boolean;
    readonly hi?: boolean;
  };
  /** Turn the flange in more steeply (m of inward travel per m of depth). Default 0. */
  readonly tuck?: number;
  /** Explicit u per column for row s (length nu + 1), overriding the uniform lo..hi spread. */
  readonly cols?: (s: number) => number[];
  /** Columns (quad index j, between vertex j and j + 1) left open: holes. */
  readonly skip?: readonly number[];
}

const fn = (v: number | ((s: number) => number)): ((s: number) => number) =>
  typeof v === 'number' ? () => v : v;

/** Unit normal of S at (s, u) from central differences in parameter space (clamped). */
export function normalAt(S: Surface, s: number, u: number): Vec3 {
  const e = 1e-4;
  const [sa, sb] = S.sRange;
  const [ua, ub] = S.uRange;
  const s0 = Math.max(sa, s - e);
  const s1 = Math.min(sb, s + e);
  const u0 = Math.max(ua, u - e);
  const u1 = Math.min(ub, u + e);
  const r = S.row(s);
  const ds = sub(S.row(s1)(u), S.row(s0)(u));
  const du = sub(r(u1), r(u0));
  return unit(cross(ds, du));
}

/** Mesh a region of S as a panel. Outward = cross(∂S/∂s, ∂S/∂u). */
export function patch(S: Surface, o: PatchOptions): Mesh {
  const lo = fn(o.lo);
  const hi = fn(o.hi);
  const ns = Math.max(1, o.ns);
  const nu = Math.max(1, o.nu);
  const sOf = o.sAt ?? ((i: number) => o.s0 + ((o.s1 - o.s0) * i) / ns);
  const lift = o.lift ?? 0;
  const P: Vec3[][] = [];
  const N: Vec3[][] = [];
  for (let i = 0; i <= ns; i++) {
    const s = sOf(i);
    const r = S.row(s);
    const a = lo(s);
    const b = hi(s);
    const prow: Vec3[] = [];
    const nrow: Vec3[] = [];
    const us = o.cols ? o.cols(s) : null;
    for (let j = 0; j <= nu; j++) {
      const u = us ? (us[j] ?? b) : a + ((b - a) * j) / nu;
      const n = normalAt(S, s, u);
      prow.push(lift ? add(r(u), mul(n, lift)) : r(u));
      nrow.push(n);
    }
    P.push(prow);
    N.push(nrow);
  }
  return skin(P, N, o);
}

const get = (g: Vec3[][], i: number, j: number): Vec3 => g[i]?.[j] ?? [0, 0, 0];

/** Mesh a grid of points + normals as a (thick) panel. */
export function skin(
  P: Vec3[][],
  N: Vec3[][],
  o: Omit<PatchOptions, 'lo' | 'hi' | 's0' | 's1' | 'ns' | 'nu' | 'cols'>,
): Mesh {
  const skip = new Set(o.skip ?? []);
  const ns = P.length - 1;
  const nu = (P[0]?.length ?? 1) - 1;
  const rect = stripRect(o.strip ?? 'plastic');
  const t = o.thickness ?? 0.004;
  const colour = (p: Vec3, n: Vec3): Vec3 =>
    typeof o.color === 'function' ? o.color(p, n) : o.color;
  // Arc lengths for UVs.
  const along: number[][] = [];
  const across: number[][] = [];
  for (let i = 0; i <= ns; i++) {
    const a: number[] = [];
    const c: number[] = [];
    for (let j = 0; j <= nu; j++) {
      a.push(i === 0 ? 0 : (along[i - 1]?.[j] ?? 0) + len(sub(get(P, i, j), get(P, i - 1, j))));
      c.push(j === 0 ? 0 : (c[j - 1] ?? 0) + len(sub(get(P, i, j), get(P, i, j - 1))));
    }
    along.push(a);
    across.push(c);
  }
  const du = (rect.u1 - rect.u0) / rect.metres;
  const vband = rect.v1 - rect.v0;
  const vOf = (m: number): number => {
    const k = m / 0.5;
    const f = k - 2 * Math.floor(k / 2);
    return rect.v0 + vband * (0.02 + 0.96 * (f <= 1 ? f : 2 - f));
  };
  const b = new MeshBuilder();
  // Collapsed rows/columns (a panel tapering to a point, a cut meeting the edge) make quads with
  // a zero-length side: keep only the half that has area, never a zero-area sliver.
  const pos: Vec3[] = [];
  const vertex = (v: Parameters<MeshBuilder['vertex']>[0]): number => {
    pos.push(v.p);
    return b.vertex(v);
  };
  const tri = (q0: number, q1: number, q2: number): void => {
    const a = pos[q0] ?? [0, 0, 0];
    if (len(cross(sub(pos[q1] ?? a, a), sub(pos[q2] ?? a, a))) > 1e-12) b.tri(q0, q1, q2);
  };
  const quad = (q0: number, q1: number, q2: number, q3: number): void => {
    tri(q0, q1, q2);
    tri(q0, q2, q3);
  };
  const outer: number[][] = [];
  for (let i = 0; i <= ns; i++) {
    const row: number[] = [];
    for (let j = 0; j <= nu; j++) {
      const p = get(P, i, j);
      const n = get(N, i, j);
      row.push(
        vertex({
          p,
          n,
          uv: [rect.u0 + (along[i]?.[j] ?? 0) * du, vOf(across[i]?.[j] ?? 0)],
          color: colour(p, n),
        }),
      );
    }
    outer.push(row);
  }
  const idx = (g: number[][], i: number, j: number): number => g[i]?.[j] ?? 0;
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nu; j++)
      if (!skip.has(j))
        quad(
          idx(outer, i, j),
          idx(outer, i + 1, j),
          idx(outer, i + 1, j + 1),
          idx(outer, i, j + 1),
        );
  if (t <= 0) return b.build();
  // Inner skin (reversed), shrunk inward by `tuck` so the flange turns under.
  const tuck = o.tuck ?? 0;
  const inner: number[][] = [];
  const innerP: Vec3[][] = [];
  for (let i = 0; i <= ns; i++) {
    const row: number[] = [];
    const prow: Vec3[] = [];
    for (let j = 0; j <= nu; j++) {
      const n = get(N, i, j);
      let p = sub(get(P, i, j), mul(n, t));
      if (tuck > 0 && (i === 0 || i === ns || j === 0 || j === nu)) {
        const ci = Math.min(ns, Math.max(0, i === 0 ? 1 : i === ns ? ns - 1 : i));
        const cj = Math.min(nu, Math.max(0, j === 0 ? 1 : j === nu ? nu - 1 : j));
        const toward = sub(get(P, ci, cj), get(P, i, j));
        const l = len(toward);
        if (l > 1e-6) p = add(p, mul(toward, Math.min(1, (tuck * t) / l)));
      }
      prow.push(p);
      row.push(
        vertex({
          p,
          n: mul(n, -1),
          uv: [rect.u0 + (along[i]?.[j] ?? 0) * du, vOf(across[i]?.[j] ?? 0)],
          color: mul(colour(get(P, i, j), n), 0.55),
        }),
      );
    }
    inner.push(row);
    innerP.push(prow);
  }
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nu; j++)
      if (!skip.has(j))
        quad(
          idx(inner, i, j),
          idx(inner, i, j + 1),
          idx(inner, i + 1, j + 1),
          idx(inner, i + 1, j),
        );
  // Hole walls: each skipped column's two sides join outer to inner.
  for (const j of skip) {
    for (let i = 0; i < ns; i++)
      for (const [jj, dir] of [
        [j, 1],
        [j + 1, -1],
      ] as const) {
        const a = get(P, i, jj);
        const c = get(P, i + 1, jj);
        const d = get(innerP, i + 1, jj);
        const e = get(innerP, i, jj);
        const across = sub(get(P, i, jj + dir), a);
        const across2 = sub(get(P, i + 1, jj + dir), c);
        if (len(across) < 1e-6 && len(across2) < 1e-6) continue;
        const nrm = unit(len(across) > len(across2) ? across : across2);
        const col = mul(colour(a, get(N, i, jj)), 0.35);
        const uv0: [number, number] = [rect.u0, rect.v0 + vband * 0.1];
        const va = vertex({ p: a, n: nrm, uv: uv0, color: col });
        const vc = vertex({ p: c, n: nrm, uv: uv0, color: col });
        const vd = vertex({ p: d, n: nrm, uv: uv0, color: col });
        const ve = vertex({ p: e, n: nrm, uv: uv0, color: col });
        const f = cross(sub(c, a), sub(d, a));
        if (len(f) < 1e-12) continue;
        if (dot(f, nrm) >= 0) quad(va, vc, vd, ve);
        else quad(va, ve, vd, vc);
      }
  }
  // Flanges: quads from the outer edge to the inner edge, normal pointing away from the panel.
  const rims = o.rims ?? {};
  const edge = (pts: Array<[number, number]>, interior: Array<[number, number]>): void => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [i0, j0] = pts[k] ?? [0, 0];
      const [i1, j1] = pts[k + 1] ?? [0, 0];
      const [ii, ij] = interior[k] ?? [0, 0];
      const a = get(P, i0, j0);
      const c = get(P, i1, j1);
      const d = get(innerP, i1, j1);
      const e = get(innerP, i0, j0);
      const away = unit(sub(a, get(P, ii, ij)));
      const nrm = unit(add(away, mul(unit(cross(sub(c, a), sub(e, a))), 0)));
      const col = mul(colour(a, get(N, i0, j0)), 0.7);
      const uv0: [number, number] = [rect.u0, rect.v0 + vband * 0.1];
      const va = vertex({ p: a, n: nrm, uv: uv0, color: col });
      const vc = vertex({ p: c, n: nrm, uv: uv0, color: col });
      const vd = vertex({ p: d, n: nrm, uv: uv0, color: col });
      const ve = vertex({ p: e, n: nrm, uv: uv0, color: col });
      // Wind so the face normal agrees with `nrm`.
      const fn3 = cross(sub(c, a), sub(d, a));
      if (dot(fn3, nrm) >= 0) quad(va, vc, vd, ve);
      else quad(va, ve, vd, vc);
    }
  };
  const range = (n: number): number[] => Array.from({ length: n + 1 }, (_, k) => k);
  if (rims.s0 !== false)
    edge(
      range(nu).map((j): [number, number] => [0, j]),
      range(nu).map((j): [number, number] => [Math.min(1, ns), j]),
    );
  if (rims.s1 !== false)
    edge(
      range(nu).map((j): [number, number] => [ns, j]),
      range(nu).map((j): [number, number] => [Math.max(0, ns - 1), j]),
    );
  if (rims.lo !== false)
    edge(
      range(ns).map((i): [number, number] => [i, 0]),
      range(ns).map((i): [number, number] => [i, Math.min(1, nu)]),
    );
  if (rims.hi !== false)
    edge(
      range(ns).map((i): [number, number] => [i, nu]),
      range(ns).map((i): [number, number] => [i, Math.max(0, nu - 1)]),
    );
  return b.build();
}

/** Root-find u in [a, b] where g(u) = target (g monotone over the bracket); bisection. */
export function solve(g: (u: number) => number, target: number, a: number, b: number): number {
  let lo = a;
  let hi = b;
  const ga = g(a) - target;
  const up = ga < 0;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    const v = g(m) - target;
    if (v < 0 === up) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
