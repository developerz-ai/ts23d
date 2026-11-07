// Small geometry helpers for head edit lists: the `rotate` that points an edit's local X (or Z) along
// a direction, and point/vector helpers.

import type { Vec3 } from '../core/index.ts';

const DEG = 180 / Math.PI;

/** `rotate` (deg, X→Y→Z) taking local +X onto `d`, then rolling `roll` deg about it. */
export function alongX(d: Vec3, roll = 0): Vec3 {
  const yaw = Math.atan2(d[1], d[0]);
  const pitch = -Math.atan2(d[2], Math.hypot(d[0], d[1]));
  return [roll, pitch * DEG, yaw * DEG];
}

/** `rotate` taking local +Z (a cone's axis) onto `d`. */
export function alongZ(d: Vec3): Vec3 {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const tilt = Math.acos(Math.max(-1, Math.min(1, d[2] / len)));
  return [0, tilt * DEG, Math.atan2(d[1], d[0]) * DEG];
}

export const unit = (d: Vec3): Vec3 => {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
};

export const along = (a: Vec3, d: Vec3, t: number): Vec3 => [
  a[0] + d[0] * t,
  a[1] + d[1] * t,
  a[2] + d[2] * t,
];
