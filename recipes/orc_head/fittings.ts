// Orc armour fittings' placement, shared by the armour (armour.ts) and the declared creases
// (creases.ts): each pauldron's cap dome (centre, tilted axis, radius, height), points on its
// outer face (rivets, boss, spike roots), and the baldric's path across the chest.

import { add, cross, mul, norm, sub, type V } from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';

/** A pauldron's cap dome (s = +1 left, −1 right). */
export function cap(s: number): { at: V; axis: V; R: number; H: number } {
  const [dx, dy, dz] = L.deltoid;
  return { at: [dx - 0.004, dy * s, dz + 0.01], axis: norm([0, 0.42 * s, 1]), R: 0.108, H: 0.088 };
}

/** A point on the cap's outer face: polar angle `phi` (deg) from the axis, azimuth `theta`. */
export function capPoint(s: number, phi: number, theta: number, lift = 0): V {
  const { at, axis: z, R, H } = cap(s);
  const x0 = norm(sub([1, 0, 0], mul(z, z[0])));
  const y0 = cross(z, x0);
  const p = (phi * Math.PI) / 180;
  const t = (theta * Math.PI) / 180;
  const dir = add(mul(x0, Math.cos(t)), mul(y0, Math.sin(t)));
  return add(add(at, mul(dir, (R + lift) * Math.sin(p))), mul(z, (H + lift) * Math.cos(p)));
}

/** The bone spikes: [phi, theta (× side), length, radius] on each cap. */
export const SPIKES = [
  [12, 90, 0.095, 0.019],
  [50, 90, 0.065, 0.015],
] as const;

/** The baldric's path: from under the left pauldron across the chest to the right flank. */
export const BALDRIC: V[] = Array.from({ length: 12 }, (_, i) => {
  const t = i / 11;
  return [0.06 + 0.07 * Math.sin(Math.PI * t * 0.9), 0.2 - 0.33 * t, 0.27 - 0.2 * t];
});
