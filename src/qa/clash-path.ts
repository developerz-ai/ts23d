// Swept volume of a part on a path (orbit, crank, piston) for the clashes gate: the moving body's
// own bounding box, carried through the real motion at PATH_STEPS poses (motionPose, the same
// poses the GLB bakes). A point is swept when, pulled back into the body's frame at some pose,
// it lies inside that box: a coupling rod sweeps its circle, a connecting rod its tilting stroke.

import {
  type BakedMotion,
  cyclesOf,
  LOOP_SECONDS,
  type Mesh,
  motionPose,
  quatRotate,
  rateOf,
  type Vec3,
} from '../core/index.ts';
import type { Volume } from './clash-sweep.ts';
import { CLASH_EPS } from './types.ts';

/** Poses per cycle: a 0.3 m crank moves ≤ 4 cm between them. */
const PATH_STEPS = 48;

/**
 * `mesh` (world space) moving by `motion` about the pivot `origin`, whose own frame is yawed by
 * `yaw` about Z. One cycle is enough: every cycle retraces it.
 */
export function pathVolume(mesh: Mesh, origin: Vec3, yaw: number, motion: BakedMotion): Volume {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
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
  const inLo = lo.map((v) => v + CLASH_EPS);
  const inHi = hi.map((v) => v - CLASH_EPS);
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
  return {
    min,
    max,
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
