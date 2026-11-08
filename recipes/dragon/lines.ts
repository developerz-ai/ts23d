// Centre lines derived from the skeleton: the smoothed neck and tail paths and their radius
// profiles. Leaf module (skeleton only), so body parts, spines and scales share them without
// import cycles.

import type { Vec3 } from '@developerz.ai/ts23d';
import { spline } from '../_lib/creature/curve.ts';
import { SK } from './skeleton.ts';

/** Linear interpolation through a radius list at fraction t. */
function profile(r: readonly number[], t: number): number {
  const x = Math.min(1, Math.max(0, t)) * (r.length - 1);
  const k = Math.floor(x);
  const a = r[Math.min(k, r.length - 1)] ?? 0.1;
  const b = r[Math.min(k + 1, r.length - 1)] ?? a;
  return a + (b - a) * (x - k);
}

/** The neck centre line, smoothed. */
export const neckPath = (): Vec3[] => spline(SK.neck, 6);
export const neckRadius = (t: number): number => profile(SK.neckR, t);

/** Tail centre line (world), from inside the body's stump to the tip. */
export const tailPath = (): Vec3[] => spline(SK.tail.slice(1), 6);
export const tailRadius = (t: number): number => profile(SK.tailR.slice(1), t);
