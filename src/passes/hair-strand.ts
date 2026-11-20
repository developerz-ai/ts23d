// Strand shaping for hair and fur cards, on plain point lists (root first): `lie` pulls a step
// onto the skin where the skin holds the hair up, `gather` bends a clump member toward its
// leader's tip, and `settle` relaxes a finished line position-based style (bend smoothing →
// segment lengths from the root → out of the skin and the collision solid) so push-outs and
// clump pulls leave no kink and nothing penetrates.

import { dmath, sub, normalize as unit, type Vec3 } from '../core/index.ts';
import { clear, gradient, mad } from './hair-roots.ts';

type Field = (p: Vec3) => number;

/** Position-based settling (bend smoothing → segment lengths from the root → out of the skin and
 *  the solid), a few rounds: clamp pulls and push-outs leave no kink, and none of it penetrates. */
export function settle(
  line: readonly Vec3[],
  f: Field | undefined,
  collide: Field | undefined,
  floor: number,
  h: number,
): Vec3[] {
  const n = line.length - 1;
  const lens = line.map((p, k) => (k === 0 ? 0 : dmath.norm(sub(p, line[k - 1] ?? p))));
  const pts = line.map((p): Vec3 => [p[0], p[1], p[2]]);
  for (let it = 0; it < 4; it++) {
    for (let k = 2; k < n; k++) {
      const p = pts[k] ?? [0, 0, 0];
      const a = pts[k - 1] ?? p;
      const b = pts[k + 1] ?? p;
      pts[k] = [
        (a[0] + 2 * p[0] + b[0]) / 4,
        (a[1] + 2 * p[1] + b[1]) / 4,
        (a[2] + 2 * p[2] + b[2]) / 4,
      ];
    }
    for (let k = 2; k <= n; k++) {
      const a = pts[k - 1] ?? [0, 0, 0];
      const p = pts[k] ?? a;
      const len = lens[k] ?? 0;
      // A point that collapsed onto its parent keeps the parent segment's direction.
      const v = sub(p, a);
      const dir = dmath.hypot(v[0], v[1], v[2]) > len * 0.05 ? v : sub(a, pts[k - 2] ?? a);
      let q = mad(a, unit(dir), len);
      const d = f ? f(q) : floor;
      if (f && d < floor) q = mad(q, gradient(f, q, h), floor - d);
      pts[k] = clear(collide, q, floor, h);
    }
  }
  return pts;
}

/** How far skin of normal `n` holds hair up: 1 facing up, 0.6 sideways, 0 from 35° under. The one
 *  curve `lie` here and `hold`/`hang` (hair-hold.ts) read, so they agree on what is a shelf. */
export const support = (n: Vec3): number => Math.min(1, Math.max(0, 0.6 + n[2]));

/** Pull a step toward the skin where the skin holds it up (`support`), keeping its length. */
export function lie(
  f: Field,
  p: Vec3,
  q: Vec3,
  step: number,
  floor: number,
  hug: number,
  h: number,
): Vec3 {
  const n = gradient(f, q, h);
  const s = support(n);
  const over = f(q) - floor;
  if (over <= 0 || s <= 0) return q;
  return mad(p, unit(sub(mad(q, n, -over * hug * s), p)), step);
}

/** Bend a clump member's free length toward its leader's tip (s² falloff from the root). */
export function gather(line: readonly Vec3[], lead: readonly Vec3[], pull: number): Vec3[] {
  const n = line.length - 1;
  const a = line[n] ?? [0, 0, 0];
  const b = lead[n] ?? a;
  return line.map((p, k) => (k === 0 ? p : mad(p, sub(b, a), pull * dmath.pow(k / n, 2))));
}
