// QA `deform`, twist along chains. Linear blending shrinks a tube between two joints turned φ apart
// about its axis by cos(φ/2) in radius, so its section keeps cos²(φ/2) of its area: the candy
// wrapper. The limit poses in deform.ts never run a clip, so every rotation key of a long chain's
// bone, and any `limit.twist` it declares, is held to AREA_KEPT here. A key is relative to the
// parent joint: its twist is the part about the bone.

import type { Bone, CompiledAsset, Vec3 } from '../core/index.ts';
import { boneLength, longChains } from './chain-bones.ts';
import type { Finding } from './types.ts';

/** Least share of the section area a twisted joint keeps at a 50/50 blend. */
export const AREA_KEPT = 0.85;
/** The twist per joint that keeps exactly AREA_KEPT, degrees (about 45.6). */
export const TWIST_LIMIT = (2 * Math.acos(Math.sqrt(AREA_KEPT)) * 180) / Math.PI;

const axisOf = (b: Bone): Vec3 => {
  const l = boneLength(b) || 1;
  return [(b.tail[0] - b.head[0]) / l, (b.tail[1] - b.head[1]) / l, (b.tail[2] - b.head[2]) / l];
};

/** Twist about unit `axis` held by the rotation (x, y, z, w), degrees in 0..180. */
export function twistDegrees(axis: Vec3, x: number, y: number, z: number, w: number): number {
  const along = Math.abs(x * axis[0] + y * axis[1] + z * axis[2]);
  return (2 * Math.atan2(along, Math.abs(w)) * 180) / Math.PI;
}

const finding = (message: string, fix: string): Finding => ({
  gate: 'deform',
  code: 'T3D_DEFORM_TWIST',
  message: `T3D_DEFORM_TWIST ${message}`,
  fix,
});

const area = (deg: number): string =>
  `${(Math.cos((deg * Math.PI) / 360) ** 2 * 100).toFixed(0)} %`;

export function chainTwistFindings(asset: CompiledAsset): Finding[] {
  const sk = asset.skeleton;
  if (!sk) return [];
  const bones = new Map(
    longChains(sk).flatMap((c) =>
      c.bones.filter((b) => b.parent !== undefined).map((b) => [b.name, b] as const),
    ),
  );
  if (bones.size === 0) return [];
  const out: Finding[] = [];
  for (const b of bones.values()) {
    const t = b.limit?.twist;
    if (t !== undefined && t > TWIST_LIMIT)
      out.push(
        finding(
          `bone '${b.name}' allows ±${t}° of twist: the section keeps ${area(t)} of its area (≥ ${AREA_KEPT * 100} %, ±${TWIST_LIMIT.toFixed(1)}° per joint)`,
          'narrow limit.twist and spread the turn over more joints of the chain',
        ),
      );
  }
  for (const clip of asset.clips ?? []) {
    let worst = 0;
    let at = '';
    for (const tr of clip.tracks) {
      if (!('bone' in tr) || tr.path !== 'rotation') continue;
      const b = bones.get(tr.bone);
      if (!b) continue;
      const axis = axisOf(b);
      const v = tr.values;
      for (let k = 0; k + 3 < v.length; k += 4) {
        const d = twistDegrees(axis, v[k] ?? 0, v[k + 1] ?? 0, v[k + 2] ?? 0, v[k + 3] ?? 1);
        if (d > worst) [worst, at] = [d, tr.bone];
      }
    }
    if (worst > TWIST_LIMIT)
      out.push(
        finding(
          `clip '${clip.name}' twists '${at}' ${worst.toFixed(1)}° from its parent: the section keeps ${area(worst)} of its area (≥ ${AREA_KEPT * 100} %, ${TWIST_LIMIT.toFixed(1)}° per joint)`,
          'spread the twist along more joints of the chain, or lower it',
        ),
      );
  }
  return out;
}
