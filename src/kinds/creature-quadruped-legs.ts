// Quadruped legs from the trunk landmarks: the joint chain per stance (shoulder forward of the
// elbow, elbow at the bottom of the chest, near-vertical forearm; hip → stifle forward → hock back
// → near-vertical metatarsus) and the muscle masses an animal is read from — deltoid, triceps,
// forearm extensors/flexors, quadriceps, hamstrings ("breeches" in a winter coat), gastrocnemius
// into the Achilles tendon — plus the bony landmarks (elbow point, accessory carpal pad, stifle,
// calcaneus). Digits per foot come from the family (creature-family.ts). Sizes are multiples of
// the allometric limb radius `r`; `fur` thickens the masses that carry long hair (back of the
// forearm, the thigh). `build.hock` sets the hind cannon's length, `build.heel` where the hock
// stands behind the hip (0: a bear's heel under its hip).

import type { Vec3 } from '../core/index.ts';
import type { Limb, Muscle } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import type { FootPlan } from './creature-family.ts';
import type { Stance } from './creature-spec.ts';

const DEG = 180 / Math.PI;

/** An ellipsoid along the bone a → b (long axis = local Z), centred at t plus an offset. */
export function along(a: Vec3, b: Vec3, t: number, off: Vec3, r: Vec3, fine = false): Muscle {
  const u = v3.sub(a, b);
  return {
    at: v3.add(v3.lerp(a, b, t), off),
    r,
    rotate: [0, Math.atan2(u[0], u[2]) * DEG, 0],
    ...(fine ? { fine } : {}),
  };
}

/** A round landmark knob, only where the bone chain is sculpted. */
const knob = (at: Vec3, r: Vec3): Muscle => ({ at, r, fine: true });

/** Joint heights per stance, × shoulder height: [carpus, hock, top of the foot]. */
function heights(stance: Stance): [number, number, number] {
  if (stance === 'plantigrade') return [0.07, 0.06, 0.055];
  if (stance === 'unguligrade') return [0.3, 0.36, 0.09];
  return [0.13, 0.28, 0.055];
}

/** Foot half-sizes [along, across] × r: compact digitigrade paws, long soles, narrow hooves. */
function footHalf(stance: Stance, r: number): [number, number] {
  if (stance === 'plantigrade') return [r * 1.18, r * 0.62];
  if (stance === 'unguligrade') return [r * 0.47, r * 0.5];
  return [r * 1.0, r * 0.82];
}

export interface LegFrame {
  /** Withers x, hip x, trunk length, shoulder height, chest depth, leg spacing y. */
  readonly xw: number;
  readonly xh: number;
  readonly T: number;
  readonly H: number;
  readonly D: number;
  readonly y: number;
  readonly r: number;
  /** Long hair over the masses, metres (0 for short coats). */
  readonly fur: number;
  /** `build.hock` (hock height ÷ H) and `build.heel` (hock behind the hip ÷ T), when given. */
  readonly hock?: number;
  readonly heel?: number;
}

export function foreLeg(stance: Stance, f: LegFrame, digits: FootPlan): Limb {
  const { xw, T, H, D, y, r, fur } = f;
  const [carpZ, , topK] = heights(stance);
  const top = topK * H;
  const S: Vec3 = [xw + 0.13 * T, y, H - 0.6 * D];
  const E: Vec3 = [xw - 0.03 * T, y * 1.08, H - D + 0.03 * H];
  const C: Vec3 = [xw + 0.01 * T, y * 0.97, carpZ * H];
  const [sx, sy] = footHalf(stance, r);
  const foot: Vec3 = [C[0] + (stance === 'plantigrade' ? 0.06 : 0.035) * T, y * 0.97, 0];
  const P: Vec3 = [foot[0] - sx * 0.3, foot[1], top];
  return {
    name: 'fore',
    joints: [S, E, C, P],
    radii: [r * 1.05, r * 0.75, r * 0.55, r * 0.55],
    foot,
    footSize: [sx, sy, top],
    ...digits,
    muscles: [
      // Deltoid over the point of the shoulder; triceps filling the back of the upper arm.
      along(S, E, 0.15, [r * 0.15, 0, 0], [r * 0.8, r * 0.7, r * 1.1]),
      along(S, E, 0.5, [-r * 0.65, 0, r * 0.1], [r * 0.85, r * 0.68, r * 1.6]),
      // Forearm: extensors in front-outside, flexors (and their winter feathering) behind.
      along(E, C, 0.35, [r * 0.08, 0, 0], [r * 0.4, r * 0.4, r * 1.9], true),
      along(
        E,
        C,
        0.3,
        [-r * 0.22 - fur * 0.15, 0, 0],
        [r * 0.36 + fur * 0.2, r * 0.38, r * 1.5],
        true,
      ),
      knob(v3.add(E, [-r * 0.55, 0, r * 0.1]), [r * 0.26, r * 0.24, r * 0.3]),
      knob(v3.add(C, [-r * 0.28, 0, r * 0.08]), [r * 0.18, r * 0.2, r * 0.22]),
    ],
  };
}

export function hindLeg(stance: Stance, f: LegFrame, digits: FootPlan): Limb {
  const { xh, T, H, D, y, r, fur } = f;
  const [, hockK, topK] = heights(stance);
  const top = topK * H;
  const Hp: Vec3 = [xh + 0.03 * T, y, H - 0.38 * D];
  const K: Vec3 = [xh + 0.17 * T, y * 1.12, 0.5 * H];
  // The hock stands 0.13 T behind the hip unless the build says where (`heel` 0: under the hip).
  const Hk: Vec3 = [
    f.heel === undefined ? xh - 0.1 * T : Hp[0] - f.heel * T,
    y,
    (f.hock ?? hockK) * H,
  ];
  const [sx, sy] = footHalf(stance, r);
  const foot: Vec3 = [Hk[0] + (stance === 'plantigrade' ? 0.06 : 0.035) * T, y * 0.97, 0];
  const P: Vec3 = [foot[0] - sx * 0.3, foot[1], top];
  // Hamstrings run from the ischium (behind the hip) to the top of the tibia.
  const ischium = v3.add(Hp, [-r * 1.4, -y * 0.1, r * 0.1]);
  const tibia = v3.lerp(K, Hk, 0.25);
  const ham = v3.len(v3.sub(ischium, tibia)) / 2;
  const shin = v3.len(v3.sub(K, Hk));
  return {
    name: 'hind',
    joints: [Hp, K, Hk, P],
    radii: [r * 1.2, r * 0.72, r * 0.5, r * 0.55],
    foot,
    footSize: [sx, sy, top],
    ...digits,
    muscles: [
      // Quadriceps in front of the femur; hamstrings (the winter "breeches") behind it.
      along(Hp, K, 0.5, [r * 0.55, 0, 0], [r * 1.45, r * 0.65, r * 2.1]),
      along(ischium, tibia, 0.5, [0, 0, 0], [r * 1.25 + fur * 0.8, r * 0.62, ham * 1.05]),
      // Gastrocnemius behind the upper tibia, tapering into the Achilles tendon to the hock.
      along(K, Hk, 0.32, [-r * 0.55, 0, 0], [r * 0.55, r * 0.5, r * 1.2], true),
      along(K, Hk, 0.72, [-r * 0.4, 0, 0], [r * 0.2, r * 0.24, shin * 0.28], true),
      knob(v3.add(K, [r * 0.32, r * 0.03, 0]), [r * 0.22, r * 0.22, r * 0.28]),
      knob(v3.add(Hk, [-r * 0.4, 0, r * 0.12]), [r * 0.18, r * 0.16, r * 0.26]),
    ],
  };
}
