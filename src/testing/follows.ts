// assertFollows: a linkage holds through the whole clip, sampled from the exact poses. A world point that lies on two
// parts at rest (a side-rod eye on its crank pin, a main rod's small end on the crosshead pin)
// must stay on both at every sampled time; each part's pose is its parents' poses composed with
// its own motion (motionPose, the exact pose the GLB baker samples; the baked LINEAR keys between
// samples are held to the circle by the export's own key-density test, src/export/motion.test.ts).
//   it('side rod rides its pin', () => assertFollows(loco, { part: 'rod_side_l',
//     follows: 'axle_driver_0', point: [2.74, 0.9475, 1.103] }));

import {
  type Asset,
  type CompiledAsset,
  LOOP_SECONDS,
  motionPose,
  type Part,
  quatRotate,
  rotateZ,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';

export interface FollowOptions extends LodOptions {
  /** The moving part (a rod) and the part it is pinned to (a wheelset, a crosshead). */
  readonly part: string;
  readonly follows: string;
  /** The shared point, in world space at rest (t = 0). */
  readonly point: Vec3;
  /** Largest allowed separation (m). Default 2 mm. */
  readonly tolerance?: number;
  /** Times sampled over the clip (exact motionPose, not the baked keys). Default 160. */
  readonly samples?: number;
}

/** World position at `time` of `local` (a point in part `name`'s own frame). */
export function pointAt(
  parts: ReadonlyMap<string, Part>,
  name: string,
  local: Vec3,
  time: number,
): Vec3 {
  let p = local;
  for (let part = parts.get(name); part; part = part.parent ? parts.get(part.parent) : undefined) {
    if (part.motion && part.motion.kind !== 'tread') {
      const pose = motionPose(part.motion, time);
      const r = quatRotate(pose.rotation, p);
      p = [r[0] + pose.offset[0], r[1] + pose.offset[1], r[2] + pose.offset[2]];
    }
    const y = rotateZ(p, part.yaw);
    p = [y[0] + part.at[0], y[1] + part.at[1], y[2] + part.at[2]];
  }
  return p;
}

/** Largest distance (m) between the point carried by `part` and by `follows` over the clip. */
export function followError(c: CompiledAsset, o: FollowOptions): number {
  const parts = new Map(c.parts.map((p) => [p.name, p]));
  const rest = worldTransforms(c.parts);
  const local = (name: string): Vec3 => {
    const t = rest.get(name);
    if (!t) return [Number.NaN, Number.NaN, Number.NaN];
    return rotateZ(
      [o.point[0] - t.origin[0], o.point[1] - t.origin[1], o.point[2] - t.origin[2]],
      -t.yaw,
    );
  };
  const a = local(o.part);
  const b = local(o.follows);
  const n = o.samples ?? 160;
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const time = (i / n) * LOOP_SECONDS;
    const pa = pointAt(parts, o.part, a, time);
    const pb = pointAt(parts, o.follows, b, time);
    worst = Math.max(worst, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]));
  }
  return worst;
}

/** `point` stays on both `part` and `follows` (within `tolerance`) at every LOD checked; returns
 *  the worst separation found. */
export function assertFollows(asset: Asset, o: FollowOptions): number {
  const tol = o.tolerance ?? 0.002;
  let worst = 0;
  failOn(
    `${asset.name} '${o.part}' follows '${o.follows}'`,
    compileLods(asset, o).flatMap((c) => {
      const missing = [o.part, o.follows].find((n) => !c.parts.some((p) => p.name === n));
      const err = missing ? Number.NaN : followError(c, o);
      if (!Number.isNaN(err)) worst = Math.max(worst, err);
      if (err <= tol) return [];
      return [
        {
          lod: c.lod,
          finding: {
            gate: 'motion',
            code: 'T3D_QA_MOTION',
            part: o.part,
            message: missing
              ? `no part '${missing}'`
              : `[${o.point.join(', ')}] drifts ${(err * 1000).toFixed(1)} mm between '${o.part}' and '${o.follows}' (> ${(tol * 1000).toFixed(1)} mm)`,
            fix: "model the linkage, not an approximation: a coupling rod is motion { kind: 'orbit', axis, arm, hz }, a connecting rod { kind: 'crank', axis, centre, pin, line, hz }, a crosshead / piston { kind: 'piston', … }, all with the wheel's own axis and rate",
          },
        },
      ];
    }),
  );
  return worst;
}
