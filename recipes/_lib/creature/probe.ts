// Surface probes for seating features on a sculpt (eyes in sockets, teeth on a gum line, horns on a
// skull): march a ray through a field until it crosses into the solid. Pure and deterministic.

import type { Field, Vec3 } from '@developerz.ai/ts23d';
import { v3 } from './curve.ts';

/**
 * First point along `from + t·dir` (t ≤ max) where the field goes negative, refined by bisection;
 * null when the ray never enters the solid.
 */
export function hit(field: Field, from: Vec3, dir: Vec3, max: number, step = 0.004): Vec3 | null {
  const d = v3.norm(dir);
  let prev = 0;
  for (let t = 0; t <= max; t += step) {
    if (field(v3.add(from, v3.mul(d, t))) < 0) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (field(v3.add(from, v3.mul(d, mid))) < 0) hi = mid;
        else lo = mid;
      }
      return v3.add(from, v3.mul(d, hi));
    }
    prev = t;
  }
  return null;
}
