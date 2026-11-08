// Fill a set of closed contours by the even-odd rule: group them into regions (an outer loop
// counter-clockwise, its direct holes clockwise), bridge each hole into its outer loop
// (Eberly's "Triangulation by Ear Clipping", rightmost-vertex visibility), then ear-clip the
// single resulting loop with the shared robust ear clipper (triangulate.ts), whose ear test
// ignores points that coincide with the ear's corners (bridge seams repeat positions).

import { orient2d, type Vec2 } from '../core/index.ts';
import { earClip, inTriangle } from './triangulate.ts';

export { earClip } from './triangulate.ts';

export interface Region {
  readonly outer: readonly Vec2[];
  readonly holes: readonly (readonly Vec2[])[];
}

export const signedArea = (p: readonly Vec2[]): number => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] ?? [0, 0];
    const b = p[(i + 1) % p.length] ?? a;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

/** Even-odd point-in-polygon. */
export function contains(poly: readonly Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] ?? [0, 0];
    const b = poly[j] ?? [0, 0];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

const ccw = (p: readonly Vec2[], want: boolean): Vec2[] =>
  signedArea(p) > 0 === want ? [...p] : [...p].reverse();

/** Group contours by nesting depth: even depth = filled outer, odd = hole of its parent. */
export function regions(contours: readonly (readonly Vec2[])[]): Region[] {
  const cs = contours.filter((c) => c.length >= 3 && Math.abs(signedArea(c)) > 1e-14);
  const probe = (c: readonly Vec2[]): Vec2 => c[0] ?? [0, 0];
  const parents = cs.map((c, i) => {
    const [x, y] = probe(c);
    const around = cs
      .map((o, j) => ({ j, a: Math.abs(signedArea(o)) }))
      .filter(({ j }) => j !== i && contains(cs[j] ?? [], x, y));
    return around;
  });
  const depth = parents.map((p) => p.length);
  const out: { outer: Vec2[]; holes: Vec2[][]; i: number }[] = [];
  cs.forEach((c, i) => {
    if ((depth[i] ?? 0) % 2 === 0) out.push({ outer: ccw(c, true), holes: [], i });
  });
  cs.forEach((c, i) => {
    const d = depth[i] ?? 0;
    if (d % 2 === 0) return;
    // Direct parent: the containing contour one level up (the smallest one around it).
    const parent = [...(parents[i] ?? [])].sort((a, b) => a.a - b.a)[0];
    const r = out.find((o) => o.i === parent?.j);
    r?.holes.push(ccw(c, false));
  });
  return out.map(({ outer, holes }) => ({ outer, holes }));
}

/** One loop: holes bridged into the outer loop, rightmost hole first. */
export function bridge(r: Region): Vec2[] {
  let loop = [...r.outer];
  const holes = [...r.holes].sort((a, b) => maxX(b) - maxX(a));
  for (const h of holes) {
    let mi = 0;
    h.forEach((p, i) => {
      const q = h[mi] ?? p;
      if (p[0] > q[0] || (p[0] === q[0] && p[1] < q[1])) mi = i;
    });
    const m = h[mi] ?? [0, 0];
    const pi = visible(loop, m);
    const hole = [...h.slice(mi), ...h.slice(0, mi), m];
    const p = loop[pi] ?? [0, 0];
    loop = [...loop.slice(0, pi + 1), ...hole, [p[0], p[1]], ...loop.slice(pi + 1)];
  }
  return loop;
}

const maxX = (p: readonly Vec2[]): number => Math.max(...p.map((q) => q[0]));

/** Index of a loop vertex visible from m (m inside the loop, to the left of the hit edge). */
function visible(loop: readonly Vec2[], m: Vec2): number {
  let best = -1;
  let bx = Infinity;
  let by = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i] ?? [0, 0];
    const b = loop[(i + 1) % loop.length] ?? a;
    if ((a[1] - m[1]) * (b[1] - m[1]) > 0 || a[1] === b[1]) continue;
    const x = a[0] + ((m[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    if (x < m[0] - 1e-12 || x >= bx) continue;
    bx = x;
    by = m[1];
    best = a[0] > b[0] ? i : (i + 1) % loop.length;
  }
  if (best < 0) return 0;
  const p = loop[best] ?? m;
  // Any reflex vertex inside triangle (m, hit, p) blocks the view; take the one at the least angle.
  const hit: Vec2 = [bx, by];
  let ang = Infinity;
  let pick = best;
  for (let i = 0; i < loop.length; i++) {
    const q = loop[i] ?? m;
    if (i === best || q[0] < m[0]) continue;
    const prev = loop[(i + loop.length - 1) % loop.length] ?? q;
    const next = loop[(i + 1) % loop.length] ?? q;
    if (cross(prev, q, next) > 0) continue;
    if (!inTriangle(q, m, hit, p) && !inTriangle(q, m, p, hit)) continue;
    const a = Math.abs(Math.atan2(q[1] - m[1], q[0] - m[0]));
    if (a < ang) {
      ang = a;
      pick = i;
    }
  }
  return pick;
}

const cross = (a: Vec2, b: Vec2, c: Vec2): number => orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);

/** Fill one region: its bridged loop and the triangles over it (CCW, indices into `pts`). */
export function fillRegion(r: Region): { pts: Vec2[]; tris: [number, number, number][] } {
  const pts = bridge(r);
  return { pts, tris: earClip(pts) };
}
