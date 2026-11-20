// The target rest a model body is reposed to (the Blender `repose` step, after `bind`): the
// skeleton fitted into the generated mesh, straightened and made bilaterally symmetric WITHOUT
// mirroring any surface, so a head turned a few degrees ends up on the sagittal plane with its
// own two sides intact:
//   centre chains (spine, neck, head, tail) — every bone keeps its length and is laid into the
//     sagittal plane (its sideways lean dropped), so the chain unrolls onto y = 0 from the root
//   paired chains (legs, scapulae, wings…) — each left bone becomes the mean of itself and its
//     right twin's mirror image, the right twin the mirror of that; both ride with the bone they
//     hang from
// A bone (tail bones aside) may turn at most REPOSE_LIMIT degrees: more is not a correction but
// another pose (a ¾ concept's head), and fails with T3D_MODEL_SKELETON naming the bone.

import { type Bone, dmath, Ts23dError, type Vec3 } from '../core/index.ts';
import { v3 } from './creature-curve.ts';

/** Most a bone may turn between the fitted rest and the target rest, degrees. The profile wolf's
 *  head is turned 28° (its mirror gave two muzzles); the ¾ wolf's 40° is another pose. */
export const REPOSE_LIMIT = 35;

export interface ReposeTarget {
  /** The target rest, same names, order, parents and limits as the fitted bones. */
  readonly bones: Bone[];
  /** Degrees each bone turns, largest first. */
  readonly turns: readonly { readonly bone: string; readonly degrees: number }[];
}

const SIDE = /_([lr])(?=_\d+$|$)/;
const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];
/** A vector laid into the sagittal plane at its own length: its sideways part is dropped and the
 *  rest stretched to make up (a vector pointing straight sideways turns forward instead). */
const unroll = (d: Vec3): Vec3 => {
  const [flat, full] = [dmath.hypot(d[0], d[2]), dmath.hypot(d[0], d[1], d[2])];
  return flat > full * 0.2
    ? [(d[0] * full) / flat, 0, (d[2] * full) / flat]
    : [dmath.hypot(d[0], d[1]), 0, d[2]];
};

/** The symmetric, straightened rest of fitted bones (helpers excluded; parents first). */
export function reposeTarget(fitted: readonly Bone[]): ReposeTarget {
  const byName = new Map(fitted.map((b) => [b.name, b]));
  const out = new Map<string, Bone>();
  /** How far the nearest centre ancestor's head moved (x and z; paired chains ride with it). */
  const carried = (b: Bone): Vec3 => {
    for (let p = b.parent; p !== undefined; p = byName.get(p)?.parent) {
      const [was, now] = [byName.get(p), out.get(p)];
      if (was && now && !SIDE.test(p)) return v3.sub(now.head, was.head);
    }
    return [0, 0, 0];
  };
  for (const b of fitted) {
    const side = SIDE.exec(b.name)?.[1];
    if (side === undefined) {
      const parent = b.parent === undefined ? undefined : byName.get(b.parent);
      const moved = b.parent === undefined ? undefined : out.get(b.parent);
      const head: Vec3 =
        parent && moved
          ? v3.add(moved.head, unroll(v3.sub(b.head, parent.head)))
          : [b.head[0], 0, b.head[2]];
      out.set(b.name, { ...b, head, tail: v3.add(head, unroll(v3.sub(b.tail, b.head))) });
      continue;
    }
    const twin = byName.get(b.name.replace(SIDE, side === 'l' ? '_r' : '_l'));
    const [l, r] = side === 'l' ? [b, twin] : [twin, b];
    const mean = (pick: (x: Bone) => Vec3): Vec3 =>
      l && r ? v3.lerp(pick(l), flip(pick(r)), 0.5) : l ? pick(l) : flip(pick(r ?? b));
    const d = carried(b);
    const place = (p: Vec3): Vec3 => (side === 'l' ? p : flip(p));
    out.set(b.name, {
      ...b,
      head: place(
        v3.add(
          mean((x) => x.head),
          [d[0], 0, d[2]],
        ),
      ),
      tail: place(
        v3.add(
          mean((x) => x.tail),
          [d[0], 0, d[2]],
        ),
      ),
    });
  }
  const bones = fitted.map((b) => out.get(b.name) ?? b);
  const turns = fitted
    .map((b, i) => {
      const [u, w] = [
        v3.norm(v3.sub(b.tail, b.head)),
        v3.norm(v3.sub(bones[i]?.tail ?? b.tail, bones[i]?.head ?? b.head)),
      ];
      return {
        bone: b.name,
        degrees: (dmath.acos(Math.min(1, Math.max(-1, v3.dot(u, w)))) * 180) / Math.PI,
      };
    })
    .sort((p, q) => q.degrees - p.degrees);
  // A tail hangs or swings wherever the picture caught it: its bones may turn freely.
  const worst = turns.find((t) => !/(^|_)tail_\d+$/.test(t.bone));
  if (worst && worst.degrees > REPOSE_LIMIT)
    throw new Ts23dError('T3D_MODEL_SKELETON', {
      cause: `model repose: bone '${worst.bone}' would have to turn ${worst.degrees.toFixed(0)}° to reach the symmetric rest pose (≤ ${REPOSE_LIMIT}°)`,
      fix: 'the model is in another pose, not a few degrees off: re-roll the concept as an exact side profile in a square stand (head forward, legs under the body), or build without `repose`',
    });
  return { bones, turns };
}
