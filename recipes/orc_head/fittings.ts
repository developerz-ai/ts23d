// Orc armour fittings' placement, shared by the armour (armour.ts) and the declared creases
// (creases.ts): each pauldron's cap dome (centre, tilted axis, radius, height), points on its
// outer face (rivets, boss, spike roots), and the baldric's path across the chest.

import { dmath } from '@developerz.ai/ts23d';
import { add, cross, mul, norm, sub, type V } from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';

/** A pauldron's crown plate stands this far proud of its skirt: the lap's step, a plate and a
 *  gap (the skirt keeps the cap's own radius). */
export const LAP = 0.007;

/** How far the pauldrons sit in from the deltoid's centre, metres. */
export const INBOARD = 0.032;

/** A pauldron's cap dome (s = +1 left, −1 right). */
export function cap(s: number): { at: V; axis: V; R: number; H: number } {
  const [dx, dy, dz] = L.deltoid;
  // 3.2 cm inboard of the deltoid's centre and 2 cm higher: the dome rests on the shoulder (it
  // hung beside it) and clears the trapezius's slope under its inner rim.
  return {
    at: [dx - 0.004, (dy - INBOARD) * s, dz + 0.03],
    axis: norm([0, 0.42 * s, 1]),
    R: 0.108,
    H: 0.088,
  };
}

/** A point on the cap's outer face: polar angle `phi` (deg) from the axis, azimuth `theta`. */
export function capPoint(s: number, phi: number, theta: number, lift = 0): V {
  const { at, axis: z, R, H } = cap(s);
  const x0 = norm(sub([1, 0, 0], mul(z, z[0])));
  const y0 = cross(z, x0);
  const p = (phi * Math.PI) / 180;
  const t = (theta * Math.PI) / 180;
  const dir = add(mul(x0, dmath.cos(t)), mul(y0, dmath.sin(t)));
  return add(add(at, mul(dir, (R + lift) * dmath.sin(p))), mul(z, (H + lift) * dmath.cos(p)));
}

/** The top lame's inner radius: the arm stub (6.2 cm, torso.ts) plus a 6 mm arming pad. */
export const LAME_R = 0.068;

/**
 * The lames' axis (s = +1 left, −1 right): down the arm stub's own axis (torso.ts: deltoid to
 * [−0.012, 0.262, 0.15]), so the bands wrap the arm. Round an axis tilted the other way and 2 cm
 * wider than the arm they hung beside the shoulder with daylight between them and the body.
 */
export function lameAxis(s: number): { at: V; axis: V } {
  const [dx, dy] = L.deltoid;
  // (1.2 cm outside the stub's axis, no more: at 2.3 the bands stood off the flank as a tube
  // beside the body.)
  return { at: [dx - 0.012, (dy + 0.012) * s, 0], axis: norm([0.06, -0.07 * s, 1]) };
}

/** The bone spikes: [phi, theta (× side), length, radius] on each cap. */
export const SPIKES = [
  [12, 90, 0.095, 0.019],
  // (At 44°: its collar stays on the crown plate, clear of the lap at 62°.)
  [44, 90, 0.065, 0.015],
] as const;

/** A spike's length and tip radius on side `s`: the right pauldron's raked spike was snapped
 *  off short in some fight (the asymmetry a symmetric pair of pauldrons lacks). `i` indexes
 *  `SPIKES`. */
export function spikeEnd(s: number, i: number, len: number): { len: number; tip: number } {
  return s === -1 && i === 1 ? { len: len * 0.5, tip: 0.0075 } : { len, tip: 0.002 };
}

/** The baldric's path: from under the left pauldron across the chest to the right flank. */
export const BALDRIC: V[] = Array.from({ length: 12 }, (_, i) => {
  const t = i / 11;
  return [0.06 + 0.07 * dmath.sin(Math.PI * t * 0.9), 0.2 - 0.33 * t, 0.27 - 0.2 * t];
});
