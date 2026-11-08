// The one ear clipper. `earClip` fills a counter-clockwise loop (it may repeat points: bridge
// seams from svg holes, a closing duplicate); `triangulate` fills any simple polygon, either
// winding, and returns CCW index triples into its input. Orientation and ear tests use the exact
// `orient2d` predicate, so a simple polygon always has an ear (two-ears theorem) and is filled
// completely. Zero-area corners (collinear runs, duplicates, seam spikes) are dropped when no ear
// is left; a self-intersecting loop still gets filled (convex corners clipped) — never a silent
// partial fill. The scan resumes beside the last clip, so it runs in O(n²), not O(n³).

import { orient2d, type Vec2 } from '../core/index.ts';

const orient = (a: Vec2, b: Vec2, c: Vec2): number => orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);

/** p inside or on triangle abc (CCW), exactly. */
export const inTriangle = (p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean =>
  orient(a, b, p) >= 0 && orient(b, c, p) >= 0 && orient(c, a, p) >= 0;

const same = (a: Vec2, b: Vec2): boolean =>
  Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;

/** Ear-clip one counter-clockwise loop; index triples into `loop`, CCW. */
export function earClip(loop: readonly Vec2[]): [number, number, number][] {
  const idx = loop.map((_, i) => i);
  const out: [number, number, number][] = [];
  const at = (k: number): Vec2 => loop[idx[(k + idx.length) % idx.length] ?? 0] ?? [0, 0];
  const isEar = (k: number, n: number): boolean => {
    const [a, b, c] = [at(k - 1), at(k), at(k + 1)];
    if (orient(a, b, c) <= 0) return false;
    for (let jj = 0; jj < n; jj++) {
      if (jj === k || jj === (k + 1) % n || jj === (k + n - 1) % n) continue;
      const q = loop[idx[jj] ?? 0] ?? [0, 0];
      if (!same(q, a) && !same(q, b) && !same(q, c) && inTriangle(q, a, b, c)) return false;
    }
    return true;
  };
  let start = 0;
  while (idx.length > 3) {
    const n = idx.length;
    let clip = -1;
    for (let s = 0; s < n && clip < 0; s++) if (isEar((start + s) % n, n)) clip = (start + s) % n;
    if (clip < 0) {
      // No ear: drop a zero-area corner and retry; failing that (a self-intersecting loop),
      // clip any convex corner so the fill still completes.
      let flat = -1;
      for (let k = 0; k < n && flat < 0; k++)
        if (orient(at(k - 1), at(k), at(k + 1)) === 0) flat = k;
      if (flat >= 0) {
        idx.splice(flat, 1);
        start = Math.max(0, flat - 1);
        continue;
      }
      for (let k = 0; k < n && clip < 0; k++) if (orient(at(k - 1), at(k), at(k + 1)) > 0) clip = k;
      if (clip < 0) break;
    }
    out.push([idx[(clip + n - 1) % n] ?? 0, idx[clip] ?? 0, idx[(clip + 1) % n] ?? 0]);
    idx.splice(clip, 1);
    start = Math.max(0, clip - 1);
  }
  if (idx.length === 3 && orient(at(0), at(1), at(2)) > 0)
    out.push([idx[0] ?? 0, idx[1] ?? 0, idx[2] ?? 0]);
  return out;
}

const area = (p: readonly Vec2[]): number =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length] ?? a;
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

/** Triangulate a simple polygon (convex or concave, either winding): CCW triples into `poly`. */
export function triangulate(poly: readonly Vec2[]): [number, number, number][] {
  if (area(poly) >= 0) return earClip(poly);
  const last = poly.length - 1;
  return earClip([...poly].reverse()).map(([a, b, c]) => [last - a, last - b, last - c]);
}
