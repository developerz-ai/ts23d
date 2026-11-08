// Membrane sheets (bat/dragon wings, webbed feet, fins, sails): a closed thin shell lofted between
// two boundary curves that share their start, with a scalloped free edge between their ends, a
// billow (sag) across the span and optional fold ripples. Explicit triangles, not a sculpt: a
// 2 cm sheet would need sub-centimetre SDF cells. Both faces plus the rim, so it is a closed solid.

import {
  DEFAULT_SHEET,
  type Mesh,
  MeshBuilder,
  type StripId,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';
import { pointAt, v3 } from './curve.ts';

export interface MembraneOptions {
  /** Boundary curves (polylines), both from the shared root to their free ends. */
  readonly a: readonly Vec3[];
  readonly b: readonly Vec3[];
  /** Cells across (a → b) and along (root → free edge). */
  readonly across: number;
  readonly along: number;
  /** How far the free edge is pulled toward the root at its middle (metres). */
  readonly scallop: number;
  /** Billow of the sheet along `sagDir` at its centre (metres). */
  readonly sag: number;
  readonly sagDir: Vec3;
  /** Half thickness, metres. */
  readonly thick: number;
  /** Start this far along the curves (hides the root inside a joint). */
  readonly start?: number;
  /** Fold ripples across the span: count and depth. */
  readonly ripples?: number;
  readonly rippleDepth?: number;
  /** Colour at (u across, v along). */
  readonly color: (u: number, v: number) => Vec3;
  readonly strip?: StripId;
}

/** The sheet's mid-surface point at (u, v). */
function surface(o: MembraneOptions, u: number, v: number): Vec3 {
  const pa = pointAt(o.a, v);
  const pb = pointAt(o.b, v);
  let p = v3.lerp(pa, pb, u);
  // Free edge: the chord between the two ends, pulled toward the root — a scallop.
  const bow = Math.sin(Math.PI * u);
  const root = v3.lerp(pointAt(o.a, 0), pointAt(o.b, 0), u);
  const pull = o.scallop * bow * v ** 3;
  p = v3.add(p, v3.mul(v3.norm(v3.sub(root, p)), pull));
  const ripple = o.ripples ? (o.rippleDepth ?? 0.01) * Math.sin(u * Math.PI * o.ripples) * v : 0;
  const sag = o.sag * bow * Math.sin(Math.PI * Math.min(1, v * 1.1)) + ripple;
  return v3.add(p, v3.mul(v3.norm(o.sagDir), sag));
}

export function membrane(o: MembraneOptions): Mesh {
  const nu = o.across;
  const nv = o.along;
  const v0 = o.start ?? 0.03;
  const P: Vec3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const row: Vec3[] = [];
    for (let i = 0; i <= nu; i++) row.push(surface(o, i / nu, v0 + ((1 - v0) * j) / nv));
    P.push(row);
  }
  const at = (i: number, j: number): Vec3 =>
    P[Math.max(0, Math.min(nv, j))]?.[Math.max(0, Math.min(nu, i))] ?? [0, 0, 0];
  const normal = (i: number, j: number): Vec3 => {
    const du = v3.sub(at(i + 1, j), at(i - 1, j));
    const dv = v3.sub(at(i, j + 1), at(i, j - 1));
    return v3.norm(v3.cross(du, dv));
  };
  const rect = stripRect(o.strip ?? 'leather');
  const vm = DEFAULT_SHEET.strips[o.strip ?? 'leather']?.scaleMetres ?? 1;
  const spanU = v3.len(v3.sub(at(nu, nv), at(0, nv)));
  const spanV = v3.len(v3.sub(at(0, nv), at(0, 0)));
  const uv = (i: number, j: number): [number, number] => {
    const s = ((i / nu) * spanU) / rect.metres;
    const t = ((j / nv) * spanV) / vm;
    const m = t - 2 * Math.floor(t / 2);
    const f = m <= 1 ? m : 2 - m;
    return [rect.u0 + s * (rect.u1 - rect.u0), rect.v0 + 0.001 + f * (rect.v1 - rect.v0 - 0.002)];
  };
  const b = new MeshBuilder();
  const top: number[][] = [];
  const bot: number[][] = [];
  for (let j = 0; j <= nv; j++) {
    const tr: number[] = [];
    const br: number[] = [];
    for (let i = 0; i <= nu; i++) {
      const p = at(i, j);
      const n = normal(i, j);
      const c = o.color(i / nu, v0 + ((1 - v0) * j) / nv);
      tr.push(b.vertex({ p: v3.add(p, v3.mul(n, o.thick)), n, uv: uv(i, j), color: c }));
      br.push(
        b.vertex({ p: v3.sub(p, v3.mul(n, o.thick)), n: v3.mul(n, -1), uv: uv(i, j), color: c }),
      );
    }
    top.push(tr);
    bot.push(br);
  }
  const T = (i: number, j: number): number => top[j]?.[i] ?? 0;
  const B = (i: number, j: number): number => bot[j]?.[i] ?? 0;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      b.quad(T(i, j), T(i + 1, j), T(i + 1, j + 1), T(i, j + 1));
      b.quad(B(i, j), B(i, j + 1), B(i + 1, j + 1), B(i + 1, j));
    }
  // Rim: walk the boundary (counter-clockwise seen from the top) and close the two faces.
  const ring: [number, number][] = [];
  for (let i = 0; i < nu; i++) ring.push([i, 0]);
  for (let j = 0; j < nv; j++) ring.push([nu, j]);
  for (let i = nu; i > 0; i--) ring.push([i, nv]);
  for (let j = nv; j > 0; j--) ring.push([0, j]);
  for (let k = 0; k < ring.length; k++) {
    const [i0, j0] = ring[k] ?? [0, 0];
    const [i1, j1] = ring[(k + 1) % ring.length] ?? [0, 0];
    const pt = (i: number, j: number, s: 1 | -1): Vec3 =>
      v3.add(at(i, j), v3.mul(normal(i, j), o.thick * s));
    const q = [pt(i0, j0, 1), pt(i1, j1, 1), pt(i1, j1, -1), pt(i0, j0, -1)] as const;
    // Outward = away from the sheet's interior: edge × face normal.
    const edge = v3.sub(q[1], q[0]);
    const n = v3.norm(v3.cross(edge, normal(i0, j0)));
    const c = o.color(i0 / nu, v0 + ((1 - v0) * j0) / nv);
    const ids = q.map((p) => b.vertex({ p, n, uv: uv(i0, j0), color: c }));
    b.quad(ids[0] ?? 0, ids[3] ?? 0, ids[2] ?? 0, ids[1] ?? 0);
  }
  return b.build();
}
