// Ear-clipping triangulation of a simple 2D polygon (convex or concave, either winding).
// Returns index triples into the input, counter-clockwise.

import type { Vec2 } from '../core/index.ts';

const area = (p: readonly Vec2[]): number =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length] ?? a;
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

const cross = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function inside(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
}

export function triangulate(poly: readonly Vec2[]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  if (area(poly) < 0) idx.reverse();
  const out: [number, number, number][] = [];
  let guard = idx.length * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length] ?? 0;
      const ib = idx[i] ?? 0;
      const ic = idx[(i + 1) % idx.length] ?? 0;
      const a = poly[ia] ?? [0, 0];
      const b = poly[ib] ?? [0, 0];
      const c = poly[ic] ?? [0, 0];
      if (cross(a, b, c) <= 0) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(poly[j] ?? [0, 0], a, b, c)))
        continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      break;
    }
  }
  if (idx.length === 3) out.push([idx[0] ?? 0, idx[1] ?? 0, idx[2] ?? 0]);
  return out;
}
