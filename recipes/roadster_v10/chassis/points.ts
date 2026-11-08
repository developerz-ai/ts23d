// Suspension hard points for one corner, in the car frame (left side; the right side mirrors
// y): wheel centre, kingpin pivot, ball joints, inner pickups, damper ends, tie-rod. Unequal-
// length double wishbones (short upper arm), so camber gain in bump — the class's standard
// layout. Every link and the upright are built from these numbers, so they always meet.

import type { Vec3 } from '@developerz.ai/ts23d';
import { R_F, R_R, TYRE_F, TYRE_R, X_FA, X_RA, Y_WF, Y_WR, Z_FA, Z_RA } from '../dims.ts';

export type CornerId = 'fl' | 'fr' | 'rl' | 'rr';

export interface Corner {
  readonly id: CornerId;
  readonly front: boolean;
  /** +1 left, −1 right. */
  readonly side: 1 | -1;
  readonly wheel: Vec3;
  readonly tyre: { readonly width: number; readonly rim: number; readonly side: number };
  readonly rimWidth: number;
  readonly radius: number;
  /** Disc: radius, inner radius, thickness, offset of its centre plane from the wheel centre (y, inboard < 0). */
  readonly disc: {
    readonly r: number;
    readonly inner: number;
    readonly thick: number;
    readonly y: number;
  };
  /** Steering pivot (front) / hub centre (rear). */
  readonly kingpin: Vec3;
  readonly upperBj: Vec3;
  readonly lowerBj: Vec3;
  readonly upperIn: readonly [Vec3, Vec3];
  readonly lowerIn: readonly [Vec3, Vec3];
  readonly damperLow: Vec3;
  readonly damperTop: Vec3;
  /** Outer tie-rod (front: steering; rear: toe link) and its inner end. */
  readonly tieOut: Vec3;
  readonly tieIn: Vec3;
  /** Caliper angle about the axle (0 = +X). */
  readonly caliperAt: number;
}

const m = (p: Vec3, s: 1 | -1): Vec3 => [p[0], p[1] * s, p[2]];

function frontLeft(): Omit<Corner, 'id' | 'side'> {
  const w: Vec3 = [X_FA, Y_WF, Z_FA];
  return {
    front: true,
    wheel: w,
    tyre: TYRE_F,
    rimWidth: 10.5 * 0.0254,
    radius: R_F,
    disc: { r: 0.1775, inner: 0.112, thick: 0.032, y: -0.058 },
    kingpin: [w[0], w[1] - 0.105, w[2]],
    upperBj: [w[0] - 0.01, w[1] - 0.175, w[2] + 0.215],
    lowerBj: [w[0] + 0.005, w[1] - 0.118, w[2] - 0.15],
    upperIn: [
      [w[0] + 0.13, 0.43, w[2] + 0.235],
      [w[0] - 0.15, 0.43, w[2] + 0.245],
    ],
    lowerIn: [
      [w[0] + 0.2, 0.3, w[2] - 0.165],
      [w[0] - 0.2, 0.3, w[2] - 0.17],
    ],
    damperLow: [w[0] + 0.015, w[1] - 0.25, w[2] - 0.135],
    damperTop: [w[0] + 0.02, 0.5, w[2] + 0.37],
    tieOut: [w[0] - 0.13, w[1] - 0.14, w[2] - 0.02],
    tieIn: [w[0] - 0.12, 0.33, w[2] - 0.03],
    caliperAt: Math.PI - 0.35,
  };
}

function rearLeft(): Omit<Corner, 'id' | 'side'> {
  const w: Vec3 = [X_RA, Y_WR, Z_RA];
  return {
    front: false,
    wheel: w,
    tyre: TYRE_R,
    rimWidth: 13 * 0.0254,
    radius: R_R,
    disc: { r: 0.175, inner: 0.11, thick: 0.03, y: -0.085 },
    kingpin: [w[0], w[1] - 0.13, w[2]],
    upperBj: [w[0] + 0.01, w[1] - 0.2, w[2] + 0.23],
    lowerBj: [w[0] - 0.005, w[1] - 0.15, w[2] - 0.16],
    upperIn: [
      [w[0] + 0.15, 0.42, w[2] + 0.25],
      [w[0] - 0.13, 0.42, w[2] + 0.24],
    ],
    lowerIn: [
      [w[0] + 0.21, 0.28, w[2] - 0.18],
      [w[0] - 0.21, 0.28, w[2] - 0.175],
    ],
    damperLow: [w[0] - 0.02, w[1] - 0.28, w[2] - 0.15],
    damperTop: [w[0] - 0.03, 0.5, w[2] + 0.42],
    tieOut: [w[0] + 0.13, w[1] - 0.17, w[2] - 0.03],
    tieIn: [w[0] + 0.14, 0.3, w[2] - 0.04],
    caliperAt: 0.35,
  };
}

const mirror = (c: Omit<Corner, 'id' | 'side'>, s: 1 | -1): Omit<Corner, 'id' | 'side'> => ({
  ...c,
  wheel: m(c.wheel, s),
  kingpin: m(c.kingpin, s),
  upperBj: m(c.upperBj, s),
  lowerBj: m(c.lowerBj, s),
  upperIn: [m(c.upperIn[0], s), m(c.upperIn[1], s)],
  lowerIn: [m(c.lowerIn[0], s), m(c.lowerIn[1], s)],
  damperLow: m(c.damperLow, s),
  damperTop: m(c.damperTop, s),
  tieOut: m(c.tieOut, s),
  tieIn: m(c.tieIn, s),
});

export function corner(id: CornerId): Corner {
  const side: 1 | -1 = id.endsWith('l') ? 1 : -1;
  const base = id.startsWith('f') ? frontLeft() : rearLeft();
  return { id, side, ...mirror(base, side) };
}

export const CORNERS: readonly CornerId[] = ['fl', 'fr', 'rl', 'rr'];
