// The limbs modelRig hands the Blender steps, as capsules: each traced free leg along its centre
// line and the tail from its bones (`unweb`'s `limbs`, `amputate`'s far legs), and the tail as
// the `isolate` step's fields.

import type { Bone, Vec3 } from '../core/index.ts';
import type { LegTrace } from './model-legs.ts';
import type { Capsule } from './model-mirror.ts';
import type { FittedSkeleton } from './model-skeleton.ts';

/** The tail as the Blender `isolate` step's fields (model-rig.ts `ModelRig.tail`). */
export interface RigTail {
  readonly bones: readonly string[];
  readonly from: Vec3;
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly r: number;
}

/** Inscribed radius → the radius a limb's capsule claims (fur and oval sections reach further). */
const LIMB_GIRTH = 1.5;

/** A traced free leg as capsules along its centre line. */
export function legCapsules(t: LegTrace): Capsule[] {
  const pts = t.line.filter((_, i) => i % 3 === 0 || i === t.line.length - 1);
  return pts.slice(1).map((b, i) => {
    const a = pts[i] ?? b;
    return {
      head: [a[1], a[2], a[0]] as Vec3,
      tail: [b[1], b[2], b[0]] as Vec3,
      r: Math.max(a[3], b[3]) * LIMB_GIRTH,
    };
  });
}

export function limbsOf(sk: FittedSkeleton, prefix: string): Capsule[][] {
  const legs = Object.values(sk.legs).map(legCapsules);
  // The tail from its second bone: the first is inside the croup.
  const tail = sk.bones
    .filter((b) => /^tail_[1-9]\d*$/.test(b.name.slice(prefix.length)))
    .map((b) => ({ head: b.head, tail: b.tail, r: sk.tailRadius * LIMB_GIRTH }));
  return [...legs, ...(tail.length && sk.tailRadius > 0 ? [tail] : [])].filter((l) => l.length);
}

export function tailOf(
  fitted: readonly Bone[],
  radius: number,
  prefix: string,
): RigTail | undefined {
  const bones = fitted.filter((b) => /^tail_[1-9]\d*$/.test(b.name.slice(prefix.length)));
  const [first, last] = [bones[0], bones[bones.length - 1]];
  if (!first || !last || !(radius > 0)) return undefined;
  return {
    bones: bones.map((b) => b.name),
    from: last.tail,
    point: first.head,
    normal: [
      first.tail[0] - first.head[0],
      first.tail[1] - first.head[1],
      first.tail[2] - first.head[2],
    ],
    r: radius * LIMB_GIRTH,
  };
}
