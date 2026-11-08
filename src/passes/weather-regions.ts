// Region finders for the shape selectors: flat panels (planar patches of one piece, keyed by
// quantised normal and plane offset, with their in-plane extent) and long spans (slender pieces:
// planks, beams, rails). Both read only geometry that survives tessellation, so LOD0 and LOD1
// find the same panels and spans.

import type { Vec3 } from '../core/index.ts';
import { pieceBounds, type Surface } from './weather-surface.ts';

export interface Panel {
  readonly normal: Vec3;
  readonly area: number;
  /** In-plane axes and the extent of the panel along them (min/max u, v) from `origin`. */
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly range: readonly [number, number, number, number];
  readonly piece: number;
}

const axesOf = (n: Vec3): [Vec3, Vec3] => {
  const up: Vec3 = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u: Vec3 = [
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0],
  ];
  const l = Math.hypot(...u) || 1;
  const uu: Vec3 = [u[0] / l, u[1] / l, u[2] / l];
  return [
    uu,
    [n[1] * uu[2] - n[2] * uu[1], n[2] * uu[0] - n[0] * uu[2], n[0] * uu[1] - n[1] * uu[0]],
  ];
};

/** Per vertex: index into the returned panels, or -1 (not on a panel of at least `minArea`). */
export function panels(s: Surface, minArea: number): { panels: Panel[]; of: Int32Array } {
  const m = s.mesh;
  const keyOf = new Map<string, number>();
  const raw: { n: Vec3; piece: number; area: number; verts: number[] }[] = [];
  for (let v = 0; v < s.vertices; v++) {
    const n: Vec3 = [m.normals[v * 3] ?? 0, m.normals[v * 3 + 1] ?? 0, m.normals[v * 3 + 2] ?? 0];
    const g = s.group[v] ?? 0;
    const d =
      n[0] * (s.gp[g * 3] ?? 0) + n[1] * (s.gp[g * 3 + 1] ?? 0) + n[2] * (s.gp[g * 3 + 2] ?? 0);
    const piece = s.piece[g] ?? 0;
    // ~15° normal buckets and 5 cm planes: a box face is one panel, a drum side a few.
    const q = (x: number): number => Math.round(x * 4);
    const key = `${piece},${q(n[0])},${q(n[1])},${q(n[2])},${Math.round(d * 20)}`;
    let id = keyOf.get(key);
    if (id === undefined) {
      id = raw.length;
      keyOf.set(key, id);
      raw.push({ n, piece, area: 0, verts: [] });
    }
    const r = raw[id];
    if (!r) continue;
    r.area += s.area[v] ?? 0;
    r.verts.push(v);
  }
  const of = new Int32Array(s.vertices).fill(-1);
  const out: Panel[] = [];
  for (const r of raw) {
    if (r.area < minArea || r.verts.length < 3) continue;
    const [u, w] = axesOf(r.n);
    const v0 = r.verts[0] ?? 0;
    const origin: Vec3 = [
      m.positions[v0 * 3] ?? 0,
      m.positions[v0 * 3 + 1] ?? 0,
      m.positions[v0 * 3 + 2] ?? 0,
    ];
    let u0 = Infinity;
    let u1 = -Infinity;
    let w0 = Infinity;
    let w1 = -Infinity;
    for (const v of r.verts) {
      const dx = (m.positions[v * 3] ?? 0) - origin[0];
      const dy = (m.positions[v * 3 + 1] ?? 0) - origin[1];
      const dz = (m.positions[v * 3 + 2] ?? 0) - origin[2];
      const pu = dx * u[0] + dy * u[1] + dz * u[2];
      const pw = dx * w[0] + dy * w[1] + dz * w[2];
      u0 = Math.min(u0, pu);
      u1 = Math.max(u1, pu);
      w0 = Math.min(w0, pw);
      w1 = Math.max(w1, pw);
      of[v] = out.length;
    }
    out.push({
      normal: r.n,
      area: r.area,
      origin,
      u,
      v: w,
      range: [u0, u1, w0, w1],
      piece: r.piece,
    });
  }
  return { panels: out, of };
}

export interface Span {
  readonly piece: number;
  /** 0 = along X, 1 = along Y. */
  readonly axis: 0 | 1;
  readonly length: number;
  readonly centre: number;
}

/** Slender horizontal pieces at least `minSpan` long: thickness and width ≤ 30% of the length. */
export function spans(s: Surface, minSpan: number): Span[] {
  const b = pieceBounds(s);
  const out: Span[] = [];
  for (let p = 0; p < s.pieces; p++) {
    const ex = (b[p * 6 + 3] ?? 0) - (b[p * 6] ?? 0);
    const ey = (b[p * 6 + 4] ?? 0) - (b[p * 6 + 1] ?? 0);
    const ez = (b[p * 6 + 5] ?? 0) - (b[p * 6 + 2] ?? 0);
    const axis: 0 | 1 = ex >= ey ? 0 : 1;
    const length = Math.max(ex, ey);
    const across = Math.min(ex, ey);
    if (length < minSpan || ez > 0.3 * length || across > 0.3 * length) continue;
    const centre = ((b[p * 6 + axis] ?? 0) + (b[p * 6 + 3 + axis] ?? 0)) / 2;
    out.push({ piece: p, axis, length, centre });
  }
  return out;
}
