// Part selection and cross-sections. `picks` is the selector rule joints and the ruler share.
// Sections: cut a world mesh with a plane and measure the cut — width and depth along the
// plane's own axes, enclosed area and centroid. Exact plane ∩ triangle segments; the area comes
// from Green's theorem over segments oriented by their triangle's normal, so no loop chaining is
// needed and holes subtract (a tube's section is its ring, not its disc). A section can be LOCAL:
// cut segments clipped to a disc round the plane point, so a small part (an eye) is compared
// with the nearby cut of a big one (its orbit), not the big part's whole outline.

import type { Mesh } from './mesh.ts';
import { cross, normalize, type Vec3 } from './vec.ts';

const vertex = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];
const triangle = (m: Mesh, t: number): [Vec3, Vec3, Vec3] => [
  vertex(m, m.indices[t * 3] ?? 0),
  vertex(m, m.indices[t * 3 + 1] ?? 0),
  vertex(m, m.indices[t * 3 + 2] ?? 0),
];

/** True when part `name` is picked by `sel`: exact, a prefix (`sel_…`) or a glob (`wheel_*`). */
export const picks = (sel: string, name: string): boolean =>
  name === sel ||
  name.startsWith(`${sel}_`) ||
  (/[*?]/.test(sel) &&
    new RegExp(
      `^${sel
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replaceAll('*', '.*')
        .replaceAll('?', '.')}$`,
    ).test(name));

export interface Plane {
  /** A point on the plane, metres. */
  readonly at: Vec3;
  /** Plane normal (any length). */
  readonly normal: Vec3;
}

export interface Section {
  /** Extent along the plane's first in-plane axis `u`. */
  readonly width: number;
  /** Extent along `v`. */
  readonly depth: number;
  /** Enclosed area, m² (closed meshes; open sheets give their swept area at best). */
  readonly area: number;
  /** World-space centre of the cut's extent (box centre in the plane). */
  readonly centroid: Vec3;
  /** The in-plane axes the widths are measured along. */
  readonly u: Vec3;
  readonly v: Vec3;
  /** Cut segments as in-plane (u, v) pairs relative to the plane point: [u0, v0, u1, v1]… */
  readonly segments: Float64Array;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** In-plane axes for a normal: `u` horizontal when it can be (Z up), `v` completes the frame. */
export function planeAxes(normal: Vec3): { n: Vec3; u: Vec3; v: Vec3 } {
  const n = normalize(normal);
  const ref: Vec3 = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = normalize(cross(ref, n));
  return { n, u, v: cross(n, u) };
}

/** Clip in-plane segment (a → b) to the disc |p| ≤ r: the kept [t0, t1] of a + t (b − a), or null. */
function clipToDisc(a: [number, number], b: [number, number], r: number): [number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const A = dx * dx + dy * dy;
  const B = 2 * (a[0] * dx + a[1] * dy);
  const C = a[0] * a[0] + a[1] * a[1] - r * r;
  if (A < 1e-24) return C <= 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const q = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - q) / (2 * A));
  const t1 = Math.min(1, (-B + q) / (2 * A));
  return t1 > t0 ? [t0, t1] : null;
}

/**
 * The section of `mesh` by `plane`, or null when the plane misses it. With `within` (metres) the
 * section is local: only the cut inside that radius of `plane.at` counts (segments are clipped to
 * the disc), and null when nothing of the cut lies that close.
 */
export function section(mesh: Mesh, plane: Plane, within = Infinity): Section | null {
  const { n, u, v } = planeAxes(plane.normal);
  const o = plane.at;
  const segs: number[] = [];
  let area = 0;
  const tris = mesh.indices.length / 3;
  for (let t = 0; t < tris; t++) {
    const pts = triangle(mesh, t);
    const d = pts.map((p) => dot([p[0] - o[0], p[1] - o[1], p[2] - o[2]], n));
    const hits: Vec3[] = [];
    for (let e = 0; e < 3; e++) {
      const a = pts[e] as Vec3;
      const b = pts[(e + 1) % 3] as Vec3;
      const da = d[e] ?? 0;
      const db = d[(e + 1) % 3] ?? 0;
      // Half-open test so a vertex exactly on the plane is counted once per edge pair.
      if (da < 0 === db < 0) continue;
      const k = da / (da - db);
      hits.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
    }
    const [p, q] = hits;
    if (!p || !q) continue;
    const [a, b, c] = pts;
    // Orient the segment so the solid is on its left in (u, v): direction = n × face normal.
    const fn = cross(
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    );
    const dir = cross(n, fn);
    const rel = (x: Vec3): [number, number] => {
      const w: Vec3 = [x[0] - o[0], x[1] - o[1], x[2] - o[2]];
      return [dot(w, u), dot(w, v)];
    };
    let [s, e] = [rel(p), rel(q)];
    const along = dot([q[0] - p[0], q[1] - p[1], q[2] - p[2]], dir);
    if (along < 0) [s, e] = [e, s];
    if (within !== Infinity) {
      const kept = clipToDisc(s, e, within);
      if (!kept) continue;
      const [t0, t1] = kept;
      const at = (t: number): [number, number] => [
        s[0] + (e[0] - s[0]) * t,
        s[1] + (e[1] - s[1]) * t,
      ];
      [s, e] = [at(t0), at(t1)];
    }
    segs.push(s[0], s[1], e[0], e[1]);
    area += (s[0] * e[1] - e[0] * s[1]) / 2;
  }
  if (segs.length === 0) return null;
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let i = 0; i < segs.length; i += 2) {
    const a = segs[i] ?? 0;
    const b = segs[i + 1] ?? 0;
    u0 = Math.min(u0, a);
    u1 = Math.max(u1, a);
    v0 = Math.min(v0, b);
    v1 = Math.max(v1, b);
  }
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return {
    width: u1 - u0,
    depth: v1 - v0,
    area: Math.abs(area),
    centroid: [0, 1, 2].map(
      (k) => (o[k] ?? 0) + (u[k] ?? 0) * cu + (v[k] ?? 0) * cv,
    ) as unknown as Vec3,
    u,
    v,
    segments: Float64Array.from(segs),
  };
}

/** Distance from (pu, pv) along unit direction (dx, dy) to the nearest cut segment, or Infinity. */
function rayHit(s: Section, pu: number, pv: number, dx: number, dy: number): number {
  let best = Infinity;
  const g = s.segments;
  for (let i = 0; i < g.length; i += 4) {
    const ax = (g[i] ?? 0) - pu;
    const ay = (g[i + 1] ?? 0) - pv;
    const ex = (g[i + 2] ?? 0) - pu - ax;
    const ey = (g[i + 3] ?? 0) - pv - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / den;
    const k = (ax * dy - ay * dx) / den;
    // A ray through a shared vertex hits both neighbours at k ≈ 0 / 1: accept a hair either side.
    if (t > 0 && k >= -1e-6 && k <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

/**
 * The opening round in-plane point (pu, pv) — where a peg's centre sits: the clear span to the
 * nearest cut along ±u and ±v, as a section (width / depth = the spans, centroid = the opening's
 * centre). A peg's socket is its hole, not the outline of what holds it. Null when the opening is
 * not closed within the cut (a ray escapes): the socket is open on that side.
 */
export function opening(s: Section, pu: number, pv: number): Section | null {
  const [up, un, vp, vn] = [
    rayHit(s, pu, pv, 1, 0),
    rayHit(s, pu, pv, -1, 0),
    rayHit(s, pu, pv, 0, 1),
    rayHit(s, pu, pv, 0, -1),
  ];
  if (![up, un, vp, vn].every(Number.isFinite)) return null;
  const cu = pu + (up - un) / 2;
  const cv = pv + (vp - vn) / 2;
  // Centroid: the plane point is centroid − (its own box centre offset); rebuild from the axes.
  const o = s.centroid;
  const box = boxCentre(s);
  return {
    ...s,
    width: up + un,
    depth: vp + vn,
    centroid: [0, 1, 2].map(
      (k) => (o[k] ?? 0) + (s.u[k] ?? 0) * (cu - box[0]) + (s.v[k] ?? 0) * (cv - box[1]),
    ) as unknown as Vec3,
  };
}

/** In-plane (u, v) of a section's box centre, relative to its plane point. */
function boxCentre(s: Section): [number, number] {
  let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
  const g = s.segments;
  for (let i = 0; i < g.length; i += 2) {
    u0 = Math.min(u0, g[i] ?? 0);
    u1 = Math.max(u1, g[i] ?? 0);
    v0 = Math.min(v0, g[i + 1] ?? 0);
    v1 = Math.max(v1, g[i + 1] ?? 0);
  }
  return [(u0 + u1) / 2, (v0 + v1) / 2];
}

/** Smallest distance from in-plane point (pu, pv) to any cut segment: a fist's inner radius. */
export function innerRadius(s: Section, pu: number, pv: number): number {
  let best = Infinity;
  const g = s.segments;
  for (let i = 0; i < g.length; i += 4) {
    const ax = g[i] ?? 0;
    const ay = g[i + 1] ?? 0;
    const bx = (g[i + 2] ?? 0) - ax;
    const by = (g[i + 3] ?? 0) - ay;
    const len = bx * bx + by * by;
    const k = len > 0 ? Math.max(0, Math.min(1, ((pu - ax) * bx + (pv - ay) * by) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + bx * k - pu, ay + by * k - pv));
  }
  return best;
}

/** Fraction of directions around (pu, pv) that hit a cut segment: 1 = fully wrapped. */
export function wrap(s: Section, pu: number, pv: number, rays = 36): number {
  let hit = 0;
  const g = s.segments;
  for (let r = 0; r < rays; r++) {
    const a = (r / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let i = 0; i < g.length; i += 4) {
      const ax = (g[i] ?? 0) - pu;
      const ay = (g[i + 1] ?? 0) - pv;
      const ex = (g[i + 2] ?? 0) - pu - ax;
      const ey = (g[i + 3] ?? 0) - pv - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * ey - ay * ex) / den;
      const k = (ax * dy - ay * dx) / den;
      if (t > 0 && k >= 0 && k <= 1) {
        hit++;
        break;
      }
    }
  }
  return hit / rays;
}
