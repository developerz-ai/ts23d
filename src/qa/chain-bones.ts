// The shape of a skeleton as a tree of bone chains, for the gates that read long bodies and limbs:
// children (helpers aside), the longest path from a root, the unbranched leaf-to-branch runs, and
// which of those runs are legs. Every leg of the kinds' six body plans and the fitted model rigs is
// at most 5 bones and falls at least 0.72 of its length (wing tips, necks, a serpent's 0.02 do not).

import { type Armature, type Bone, dmath, quatRotate, type Vec3 } from '../core/index.ts';
import type { JointWorld } from './clip-pose.ts';

/** Half-angle helper suffix: a bone `<joint>_mid` turns half as far as `<joint>` (the
 *  convention kinds/creature-helpers.ts bakes into every clip). */
export const MID_SUFFIX = '_mid';

/** A foot's tail lies in this lowest share of the skeleton's height. */
export const LOW_SHARE = 0.08;
/** More bones than this in one run is a chain (tentacle, spine), not a leg. */
export const MAX_LEG_BONES = 6;
/** A leg falls at least this share of its length from branch to tip. */
export const HANG_SHARE = 0.5;
/** A run shorter than this share of the skeleton's height is a toe: it need not hang. */
export const TOE_SHARE = 0.25;
/** A chain of at least this many bones that is not a leg is a long chain (tail, neck, arm). */
export const LONG_CHAIN_BONES = 4;

const isHelper = (b: Bone): boolean => b.name.endsWith(MID_SUFFIX);

export const boneLength = (b: Bone): number =>
  dmath.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]);

/** Where a bone's tail is under a posed joint. */
export function boneEnd(b: Bone, j: JointWorld): Vec3 {
  const o = quatRotate(j.rot, [
    b.tail[0] - b.head[0],
    b.tail[1] - b.head[1],
    b.tail[2] - b.head[2],
  ]);
  return [j.head[0] + o[0], j.head[1] + o[1], j.head[2] + o[2]];
}

/** Children of each bone in skeleton order, `_mid` helpers left out. */
export function childMap(sk: Armature): Map<string, Bone[]> {
  const out = new Map<string, Bone[]>();
  for (const b of sk.bones) {
    if (b.parent === undefined || isHelper(b)) continue;
    out.set(b.parent, [...(out.get(b.parent) ?? []), b]);
  }
  return out;
}

/** Length of the longest bone path hanging below `b` (`b` itself not counted). */
export function reach(b: Bone, kids: ReadonlyMap<string, readonly Bone[]>): number {
  return Math.max(0, ...(kids.get(b.name) ?? []).map((c) => boneLength(c) + reach(c, kids)));
}

/** The longest root-to-leaf path by length; the first found wins a tie. */
export function bodyPath(sk: Armature): Bone[] {
  const kids = childMap(sk);
  const walk = (b: Bone): { bones: Bone[]; length: number } => {
    let best: { bones: Bone[]; length: number } = { bones: [], length: 0 };
    for (const c of kids.get(b.name) ?? []) {
      const r = walk(c);
      if (best.bones.length === 0 || r.length > best.length) best = r;
    }
    return { bones: [b, ...best.bones], length: boneLength(b) + best.length };
  };
  let top: { bones: Bone[]; length: number } = { bones: [], length: -1 };
  for (const b of sk.bones) {
    if (b.parent !== undefined || isHelper(b)) continue;
    const r = walk(b);
    if (r.length > top.length) top = r;
  }
  return top.bones;
}

export interface BoneChain {
  /** Branch end first, leaf last. */
  readonly bones: readonly Bone[];
  readonly length: number;
}

/** Every unbranched run from a leaf up to (not including) the bone it branches from. */
export function leafChains(sk: Armature): BoneChain[] {
  const kids = childMap(sk);
  const byName = new Map(sk.bones.map((b) => [b.name, b]));
  return sk.bones.flatMap((leaf) => {
    if (isHelper(leaf) || (kids.get(leaf.name)?.length ?? 0) > 0) return [];
    const bones = [leaf];
    for (let p = byName.get(leaf.parent ?? ''); p; p = byName.get(p.parent ?? '')) {
      if ((kids.get(p.name)?.length ?? 0) > 1) break;
      bones.unshift(p);
    }
    return [{ bones, length: bones.reduce((t, b) => t + boneLength(b), 0) }];
  });
}

/** Highest bone point above z = 0. */
export const skeletonTop = (sk: Armature): number =>
  Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));

/** Whether a run can carry a foot: few bones, and hanging from what it branches off (or a toe). */
export function isLimb(c: BoneChain, top: number): boolean {
  if (c.bones.length > MAX_LEG_BONES) return false;
  const drop = (c.bones[0]?.head[2] ?? 0) - (c.bones.at(-1)?.tail[2] ?? 0);
  return drop >= HANG_SHARE * c.length || c.length < TOE_SHARE * top;
}

/** The long runs that are not legs: tails, necks, tentacles, spines. */
export function longChains(sk: Armature): BoneChain[] {
  const top = skeletonTop(sk);
  return leafChains(sk).filter((c) => {
    if (c.bones.length < LONG_CHAIN_BONES) return false;
    const low = (c.bones.at(-1)?.tail[2] ?? 0) < top * LOW_SHARE;
    return !(low && isLimb(c, top));
  });
}
