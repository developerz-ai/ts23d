// The skeleton IR: named bones (head → tail, asset frame, metres, Z up) with optional joint
// limits. Validates `ctx.bone` one bone at a time and whole skeletons from any source (kinds,
// imported rigs, neural `rig` output); re-frames a child's bones under `ctx.use` (ADR 013).

import * as dmath from './dmath.ts';
import { Ts23dError } from './errors.ts';
import { checkStretch } from './limit-tolerance.ts';
import type { Vec3 } from './vec.ts';
import { toWorld, type WorldTransform } from './world.ts';

/** Bones a skinned asset may carry when `budget.bones` is omitted (ADR 013). */
export const DEFAULT_BONE_BUDGET = 64;

/**
 * Range of motion at a bone's head, in degrees from the rest pose: `min..max` about `axis` (the
 * hinge, asset frame, need not be unit) and `±twist` about the bone itself. Rest lies inside it.
 */
export interface JointLimit {
  readonly axis: Vec3;
  readonly min: number;
  readonly max: number;
  readonly twist?: number;
  /** QA `deform` edge-stretch tolerance at this limit (default ×4, cap ×6; limit-tolerance.ts). */
  readonly stretch?: number;
  /** Required when `stretch` is above the default: what makes the excess real and its fix. */
  readonly why?: string;
}

/** A raised stretch tolerance declared by bone name for a limit a kind generated. */
export interface LimitTolerance {
  readonly stretch: number;
  readonly why: string;
}

export interface Bone {
  readonly name: string;
  /** Parent bone; omitted = a root bone. */
  readonly parent?: string;
  /** Pivot of the bone, asset frame (metres). */
  readonly head: Vec3;
  /** End of the bone, asset frame (metres); the bone points head → tail. */
  readonly tail: Vec3;
  readonly limit?: JointLimit;
}

export type BoneOptions = Omit<Bone, 'name'>;

export interface Armature {
  readonly bones: readonly Bone[];
}

const finite = (v: readonly number[]): boolean => v.length === 3 && v.every(Number.isFinite);

const invalid = (where: string, cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `${where}: ${cause}`, fix });
};

/** One bone's own fields: name, finite head/tail apart, limit range. Order-free. */
export function boneOf(asset: string, name: string, o: BoneOptions): Bone {
  const where = `bone '${name}' in '${asset}'`;
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    invalid(where, 'name is not snake_case', 'rename it, e.g. spine_0, thigh_l');
  if (!finite(o.head) || !finite(o.tail))
    invalid(where, 'head or tail is not a finite point', 'pass metres, e.g. head: [0, 0, 1]');
  const len = dmath.hypot(o.tail[0] - o.head[0], o.tail[1] - o.head[1], o.tail[2] - o.head[2]);
  if (len < 1e-6)
    invalid(where, 'head and tail coincide', 'give the bone a length: tail at the next joint');
  if (o.parent === name) invalid(where, 'parents to itself', 'parent it to the bone above it');
  if (o.limit) checkLimit(where, o.limit);
  return {
    name,
    ...(o.parent !== undefined ? { parent: o.parent } : {}),
    head: [o.head[0], o.head[1], o.head[2]],
    tail: [o.tail[0], o.tail[1], o.tail[2]],
    ...(o.limit ? { limit: o.limit } : {}),
  };
}

function checkLimit(where: string, l: JointLimit): void {
  if (!finite(l.axis) || dmath.norm(l.axis) < 1e-9)
    invalid(where, 'limit axis is zero or not finite', 'pass the hinge axis, e.g. [0, 1, 0]');
  const ok = (d: number): boolean => Number.isFinite(d) && Math.abs(d) <= 180;
  if (!ok(l.min) || !ok(l.max) || l.min > 0 || l.max < 0)
    invalid(
      where,
      `limit ${l.min}..${l.max}° does not contain the rest pose (0) inside ±180°`,
      'use min ≤ 0 ≤ max in degrees, e.g. a knee: { min: 0, max: 140 }',
    );
  if (l.twist !== undefined && !(ok(l.twist) && l.twist >= 0))
    invalid(where, `limit twist ${l.twist}° is not in 0..180`, 'give twist as ± degrees, e.g. 20');
  checkStretch(where, l);
}

/**
 * A whole skeleton, bones in any order: each bone valid, names unique, every parent present, no
 * cycle. Returns it unchanged so callers can validate inline.
 */
export function checkSkeleton(asset: string, skeleton: Armature): Armature {
  const byName = new Map<string, Bone>();
  for (const b of skeleton.bones) {
    boneOf(asset, b.name, b);
    if (byName.has(b.name))
      invalid(
        `bone '${b.name}' in '${asset}'`,
        'declared twice',
        'give each bone a unique name — suffix side or index: thigh_l, tail_3',
      );
    byName.set(b.name, b);
  }
  for (const b of skeleton.bones) {
    if (b.parent !== undefined && !byName.has(b.parent))
      invalid(
        `bone '${b.name}' in '${asset}'`,
        `parents to '${b.parent}', which is not in the skeleton`,
        'add the parent bone, or drop `parent` to make it a root',
      );
    const seen = new Set<string>([b.name]);
    for (let p = b.parent; p !== undefined; p = byName.get(p)?.parent) {
      if (seen.has(p))
        invalid(
          `bone '${b.name}' in '${asset}'`,
          `parent chain loops back through '${p}'`,
          'break the cycle: every chain must end at a root bone with no parent',
        );
      seen.add(p);
    }
  }
  return skeleton;
}

/** Bones over the cap fail: `budget.bones`, else 64 (ADR 013). */
export function checkBoneBudget(asset: string, bones: number, cap?: number): void {
  if (cap !== undefined && !(Number.isInteger(cap) && cap >= 1))
    invalid(`'${asset}' budget.bones`, `${cap} is not an integer ≥ 1`, 'use e.g. bones: 48');
  const limit = cap ?? DEFAULT_BONE_BUDGET;
  if (bones > limit)
    throw new Ts23dError('T3D_SKIN_INVALID', {
      cause: `'${asset}' has ${bones} bones, over its cap of ${limit}`,
      fix: `merge or drop bones (fingers, tail tip) to ${limit}, or raise budget.bones with a measured reason`,
    });
}

/** A child asset's bone seen from the parent: prefixed names, moved by the instance transform. */
export function useBone(b: Bone, prefix: string, xf: WorldTransform): Bone {
  const axis = b.limit ? toWorld({ origin: [0, 0, 0], yaw: xf.yaw }, b.limit.axis) : undefined;
  return {
    name: `${prefix}_${b.name}`,
    ...(b.parent !== undefined ? { parent: `${prefix}_${b.parent}` } : {}),
    head: toWorld(xf, b.head),
    tail: toWorld(xf, b.tail),
    ...(b.limit && axis ? { limit: { ...b.limit, axis } } : {}),
  };
}
