// A part's pose at time t of the baked `run` clip: the offset and rotation its Motion adds on top
// of the rest pose, in the part's own frame. The one source of truth: the GLB baker samples it,
// QA sweeps it, and `assertFollows` checks linkages against it. Rates are rounded to WHOLE cycles
// over the clip (cyclesOf), so a crank and the wheel it rides on stay locked at every key.

import type { Motion, Piston, Tread } from './motion.ts';
import {
  cross,
  dot,
  normalize,
  type Quat,
  quatFromAxisAngle,
  scale,
  sub,
  type Vec3,
} from './vec.ts';

export const LOOP_SECONDS = 4;

/** Whole cycles of `rate` (Hz or rev/s) over the clip, at least one. */
export const cyclesOf = (rate: number): number =>
  Math.max(1, Math.round(Math.abs(rate) * LOOP_SECONDS)) * Math.sign(rate || 1);

export interface Pose {
  /** Translation added to the pivot, in the part's own frame. */
  readonly offset: Vec3;
  /** Rotation about the pivot, in the part's own frame. */
  readonly rotation: Quat;
}

export type BakedMotion = Exclude<Motion, Tread>;

const IDENTITY: Quat = [0, 0, 0, 1];
const ZERO: Vec3 = [0, 0, 0];

/** The cycle rate of a motion (rev/s or Hz). */
export const rateOf = (m: BakedMotion): number => (m.kind === 'spin' ? m.rps : m.hz);

/** Rodrigues: `v` turned by `angle` right-handed about unit `u`. */
export function rotateAbout(v: Vec3, u: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = dot(u, v) * (1 - c);
  const x = cross(u, v);
  return [
    v[0] * c + x[0] * s + u[0] * k,
    v[1] * c + x[1] * s + u[1] * k,
    v[2] * c + x[2] * s + u[2] * k,
  ];
}

/** `v` without its component along unit `u`. */
export const across = (v: Vec3, u: Vec3): Vec3 => sub(v, scale(u, dot(u, v)));

/**
 * Small-end travel x along the line, and the rod's turn ψ about the axis, at crank angle θ past
 * rest. Rest: x = 0, ψ = 0. The root is the one the rest pose sits on, so the rod never flips.
 */
export function linkageAt(m: Omit<Piston, 'kind'>, theta: number): { x: number; psi: number } {
  const u = normalize(m.axis);
  const l = normalize(m.line);
  const arm = across(sub(m.pin, m.centre), u);
  const big = sub(m.pin, sub(arm, rotateAbout(arm, u, theta)));
  const along = dot(big, l);
  const rest = dot(m.pin, l);
  const disc = along * along - dot(big, big) + dot(m.pin, m.pin);
  const x = along - Math.sign(rest) * Math.sqrt(Math.max(0, disc));
  const r0 = across(m.pin, u);
  const r1 = across(sub(big, scale(l, x)), u);
  return { x, psi: Math.atan2(dot(u, cross(r0, r1)), dot(r0, r1)) };
}

/** Angle travelled (radians) at `time` seconds: whole cycles over the clip. */
export const phaseAt = (m: BakedMotion, time: number): number =>
  (time / LOOP_SECONDS) * cyclesOf(rateOf(m)) * Math.PI * 2;

/** The pose `m` adds at `time` seconds into the looping clip. */
export function motionPose(m: BakedMotion, time: number): Pose {
  const phase = phaseAt(m, time);
  switch (m.kind) {
    case 'spin':
      return { offset: ZERO, rotation: quatFromAxisAngle(m.axis, phase) };
    case 'slide':
    case 'sway': {
      // Two-sided: −1..1 around rest. One-way: 0..1, starting and ending at rest (seamless loop).
      const wave = m.oneWay ? (1 - Math.cos(phase)) / 2 : Math.sin(phase);
      if (m.kind === 'slide') return { offset: scale(m.offset, wave), rotation: IDENTITY };
      return {
        offset: ZERO,
        rotation: quatFromAxisAngle(m.axis, ((m.degrees * Math.PI) / 180) * wave),
      };
    }
    case 'orbit':
      return {
        offset: sub(rotateAbout(m.arm, normalize(m.axis), phase), m.arm),
        rotation: IDENTITY,
      };
    case 'crank':
    case 'piston': {
      const { x, psi } = linkageAt(m, phase);
      return {
        offset: scale(normalize(m.line), x),
        rotation: m.kind === 'crank' ? quatFromAxisAngle(m.axis, psi) : IDENTITY,
      };
    }
  }
}

/** Which glTF channels a motion animates. */
export const motionPaths = (m: BakedMotion): readonly ('translation' | 'rotation')[] =>
  m.kind === 'spin' || m.kind === 'sway'
    ? ['rotation']
    : m.kind === 'crank'
      ? ['translation', 'rotation']
      : ['translation'];
