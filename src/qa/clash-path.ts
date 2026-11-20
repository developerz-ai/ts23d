// Swept volume of a part on a path (orbit, crank, piston) for the clashes gate: the moving body's
// own bounding box, carried through the real motion at PATH_STEPS poses (motionPose, the same
// poses the GLB bakes). A point is swept when, pulled back into the body's frame at some pose,
// it lies inside that box: a coupling rod sweeps its circle, a connecting rod its tilting stroke.

import {
  type BakedMotion,
  cyclesOf,
  dmath,
  LOOP_SECONDS,
  type Mesh,
  motionPose,
  quatRotate,
  rateOf,
  type Vec3,
} from '../core/index.ts';
import { dot, shave, type Volume } from './clash-sweep.ts';

/** Poses per cycle: a 0.3 m crank moves ≤ 4 cm between them. */
const PATH_STEPS = 48;

/**
 * `mesh` (world space) moving by `motion` about the pivot `origin`, whose own frame is yawed by
 * `yaw` about Z. One cycle is enough: every cycle retraces it.
 */
export function pathVolume(mesh: Mesh, origin: Vec3, yaw: number, motion: BakedMotion): Volume {
  const c = dmath.cos(yaw);
  const s = dmath.sin(yaw);
  const toLocal = (p: Vec3): Vec3 => {
    const d: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    return [d[0] * c + d[1] * s, -d[0] * s + d[1] * c, d[2]];
  };
  const toWorld = (p: Vec3): Vec3 => [
    origin[0] + p[0] * c - p[1] * s,
    origin[1] + p[0] * s + p[1] * c,
    origin[2] + p[2],
  ];
  // The body's box in its own (yawed) frame, so a yawed rod is not fattened by a world AABB.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const P = mesh.positions;
  for (let i = 0; i < P.length; i += 3) {
    const l = toLocal([P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0]);
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, l[k] ?? 0);
      hi[k] = Math.max(hi[k] ?? 0, l[k] ?? 0);
    }
  }
  const corners: Vec3[] = [];
  for (const x of [lo[0] ?? 0, hi[0] ?? 0])
    for (const y of [lo[1] ?? 0, hi[1] ?? 0])
      for (const z of [lo[2] ?? 0, hi[2] ?? 0]) corners.push([x, y, z]);
  const eps = [0, 1, 2].map((k) => shave((hi[k] ?? 0) - (lo[k] ?? 0)));
  const inLo = lo.map((v, k) => v + (eps[k] ?? 0));
  const inHi = hi.map((v, k) => v - (eps[k] ?? 0));
  // One cycle of the clip: the time of a whole turn at the baked (rounded) rate.
  const cycle = LOOP_SECONDS / Math.abs(cyclesOf(rateOf(motion)));
  const poses = Array.from({ length: PATH_STEPS }, (_, i) =>
    motionPose(motion, (i / PATH_STEPS) * cycle),
  );
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const pose of poses)
    for (const p of corners) {
      const q = quatRotate(pose.rotation, p);
      const w = toWorld([q[0] + pose.offset[0], q[1] + pose.offset[1], q[2] + pose.offset[2]]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k] ?? 0, w[k] ?? 0);
        max[k] = Math.max(max[k] ?? 0, w[k] ?? 0);
      }
    }
  const band = thinBand(origin, [c, s], inLo, inHi, poses);
  return {
    min,
    max,
    ...(band ? { band } : {}),
    inside: (p) => {
      const l = toLocal(p);
      return poses.some((pose) => {
        const q = quatRotate(
          pose.rotation,
          [l[0] - pose.offset[0], l[1] - pose.offset[1], l[2] - pose.offset[2]],
          true,
        );
        return [0, 1, 2].every((k) => (q[k] ?? 0) > (inLo[k] ?? 0) && (q[k] ?? 0) < (inHi[k] ?? 0));
      });
    },
  };
}

/**
 * The band along the body's thinnest local axis, when every pose keeps that axis fixed (a rod
 * orbiting about its own thickness axis): the swept volume then never leaves the band the rod's
 * thickness carried by the poses' offsets. Undefined when a pose tilts it.
 */
function thinBand(
  origin: Vec3,
  [c, s]: readonly [number, number],
  inLo: readonly number[],
  inHi: readonly number[],
  poses: readonly ReturnType<typeof motionPose>[],
): Volume['band'] {
  const spans = [0, 1, 2].map((k) => (inHi[k] ?? 0) - (inLo[k] ?? 0));
  const k = spans.indexOf(Math.min(...spans));
  const e: Vec3 = [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
  let lo = Infinity;
  let hi = -Infinity;
  for (const pose of poses) {
    if (dot(quatRotate(pose.rotation, e), e) < 1 - 1e-9) return undefined;
    lo = Math.min(lo, pose.offset[k] ?? 0);
    hi = Math.max(hi, pose.offset[k] ?? 0);
  }
  // Local axis k in world space (the pivot frame is yawed about Z).
  const dir: Vec3 = k === 0 ? [c, s, 0] : k === 1 ? [-s, c, 0] : [0, 0, 1];
  const at = dot(origin, dir);
  return { dir, lo: at + (inLo[k] ?? 0) + lo, hi: at + (inHi[k] ?? 0) + hi };
}
