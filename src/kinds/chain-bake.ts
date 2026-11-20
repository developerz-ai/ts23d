// Bakes chain fields to a glTF clip: root motion first (the manifest's speed reads the first
// translation track), then joint slides, then hemisphere-continuous rotations. A loop lasts a whole
// number of wave cycles and its last key is its first, plus the root's travel. Recoil moves the
// root so the named chains' centre of mass keeps its rest position on the given axes (doc section 0).

import {
  type Clip,
  dmath,
  type Quat,
  quatRotate,
  type Track,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import type { BodyPlan, PlanChain, PlanLink } from './body-plan-types.ts';
import { type ChainField, poseChain } from './chain-field.ts';
import { FPS, rotationTracks } from './gait-bake.ts';
import { type BoneWorld, forward, IDENTITY, qexp, qmul, tailOf } from './pose.ts';

/** Keys per wave cycle: 16 keep slerp error at 0.29° for a 15° joint (doc section 8, check 4). */
export const KEYS_PER_CYCLE = 16;

export interface ChainDrive {
  readonly chain: PlanChain;
  readonly field: ChainField;
}

export interface RootKey {
  /** Translation of the plan's root bone from rest, metres. */
  readonly pos: Vec3;
  /** Turn about +Z, radians. */
  readonly yaw: number;
}

export interface RecoilSpec {
  readonly chains: readonly PlanChain[];
  /** Asset axes the centre of mass holds on: [1] is a swimmer's lateral. */
  readonly axes: readonly (0 | 1 | 2)[];
  /** Mass of a link; its length by default (uniform mass per length). */
  readonly mass?: (chain: PlanChain, link: PlanLink) => number;
}

export interface ChainClipSpec {
  readonly name: string;
  readonly plan: BodyPlan;
  readonly drives: readonly ChainDrive[];
  readonly seconds: number;
  readonly loop: boolean;
  /** Wave cycles in the clip, for key density (1). */
  readonly cycles?: number;
  readonly keysPerCycle?: number;
  readonly root?: (t: number) => RootKey;
  readonly recoil?: RecoilSpec;
}

export interface ChainKey {
  readonly rotation: Map<string, Quat>;
  readonly offset: Map<string, Vec3>;
  readonly root: Vec3;
}

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/** A loop of a whole number of cycles at `f` Hz, at least `target` seconds long. */
export function loopLength(f: number, target: number): { seconds: number; cycles: number } {
  if (!(Number.isFinite(f) && f > 0))
    invalid(`loop frequency ${f} is not > 0`, 'give a positive frequency in Hz');
  const cycles = Math.max(1, Math.ceil(f * target - 1e-9));
  return { seconds: cycles / f, cycles };
}

/** Mass-weighted centre of the chains' links under a posed skeleton. */
function centreOf(plan: BodyPlan, r: RecoilSpec, world: ReadonlyMap<string, BoneWorld>): Vec3 {
  const sum: [number, number, number] = [0, 0, 0];
  let total = 0;
  for (const chain of r.chains)
    chain.links.forEach((link, i) => {
      const w = world.get(link.bone.name);
      if (!w) return;
      const next = chain.links[i + 1];
      const end = (next && world.get(next.bone.name)?.head) ?? tailOf(link.bone, w);
      const m = r.mass ? r.mass(chain, link) : link.length;
      for (const k of [0, 1, 2] as const) sum[k] += (m * (w.head[k] + end[k])) / 2;
      total += m;
    });
  if (!(total > 0))
    invalid(`recoil chains of '${plan.name}' have no mass`, 'name chains with links of length > 0');
  return [sum[0] / total, sum[1] / total, sum[2] / total];
}

/** The pose function of a clip spec: joint rotations, slides and the root at time t. */
export function chainSampler(spec: ChainClipSpec): (t: number) => ChainKey {
  const { plan, recoil } = spec;
  const seen = new Set<string>();
  for (const d of spec.drives) {
    if (seen.has(d.chain.id))
      invalid(`chain '${d.chain.id}' is driven twice`, 'add the fields with sumFields');
    seen.add(d.chain.id);
  }
  const rest = recoil ? centreOf(plan, recoil, forward(plan.bones, { rotation: new Map() })) : null;
  return (t) => {
    const rotation = new Map<string, Quat>();
    const offset = new Map<string, Vec3>();
    for (const d of spec.drives) {
      const p = poseChain(d.chain, d.field, t);
      for (const [k, v] of p.rotation) rotation.set(k, v);
      for (const [k, v] of p.offset) offset.set(k, v);
    }
    // A slide of the root bone is root motion: one bone, one translation track.
    const slide = offset.get(plan.root) ?? ([0, 0, 0] as Vec3);
    offset.delete(plan.root);
    const shift: [number, number, number] = [slide[0], slide[1], slide[2]];
    if (recoil && rest) {
      const posed = forward(plan.bones, { rotation, offset, root: slide });
      const c = centreOf(plan, recoil, posed);
      for (const k of recoil.axes) shift[k] = slide[k] + rest[k] - c[k];
    }
    const at = spec.root?.(t) ?? { pos: [0, 0, 0] as Vec3, yaw: 0 };
    const turn = qexp([0, 0, at.yaw]);
    const moved = quatRotate(turn, shift);
    if (at.yaw !== 0) rotation.set(plan.root, qmul(turn, rotation.get(plan.root) ?? IDENTITY));
    return {
      rotation,
      offset,
      root: [at.pos[0] + moved[0], at.pos[1] + moved[1], at.pos[2] + moved[2]],
    };
  };
}

/** World position of the tail of `bone` under a key (the key's root included). */
export function tipOf(plan: BodyPlan, key: ChainKey, bone: string): Vec3 {
  const world = forward(plan.bones, {
    rotation: key.rotation,
    offset: key.offset,
    root: key.root,
  });
  const b = plan.bones.find((x) => x.name === bone);
  const w = world.get(bone);
  if (!b || !w) return invalid(`no bone '${bone}' in '${plan.name}'`, 'name a bone of the plan');
  return tailOf(b, w);
}

/** A looping clip must close on itself: only the root's X and Y may differ at the seam. */
function loopTravel(spec: ChainClipSpec): Vec3 {
  if (!spec.root) return [0, 0, 0];
  const a = spec.root(0);
  const b = spec.root(spec.seconds);
  const d: Vec3 = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]];
  if (Math.abs(d[2]) > 1e-9 || Math.abs(dmath.sin((b.yaw - a.yaw) / 2)) > 1e-9)
    invalid(
      `looping clip '${spec.name}' ends ${d[2]} m higher and ${b.yaw - a.yaw} rad round`,
      'close the loop: no net climb, and root yaw back at the start (whole turns only)',
    );
  return d;
}

/** The clip of a spec: sampled at max(30 fps, keysPerCycle per wave cycle). */
export function bakeChainClip(spec: ChainClipSpec): Clip {
  const T = spec.seconds;
  if (!(Number.isFinite(T) && T > 0))
    invalid(`clip '${spec.name}' lasts ${T} s`, 'give a positive length');
  const n = Math.max(
    4,
    Math.ceil(T * FPS - 1e-9),
    Math.ceil((spec.cycles ?? 1) * (spec.keysPerCycle ?? KEYS_PER_CYCLE) - 1e-9),
  );
  const sample = chainSampler(spec);
  const keys: ChainKey[] = [];
  const count = spec.loop ? n : n + 1;
  for (let i = 0; i < count; i++) keys.push(sample((i * T) / n));
  const first = keys[0];
  if (spec.loop && first) {
    const d = loopTravel(spec);
    const r = first.root;
    keys.push({ ...first, root: [r[0] + d[0], r[1] + d[1], r[2] + d[2]] });
  }
  const times = Float32Array.from({ length: n + 1 }, (_, i) => (i * T) / n);
  const tracks: Track[] = [];
  if (spec.root || spec.recoil || keys.some((k) => k.root.some((v) => v !== 0)))
    tracks.push({
      bone: spec.plan.root,
      path: 'translation',
      times,
      values: Float32Array.from(keys.flatMap((k) => [...k.root])),
    });
  for (const b of spec.plan.bones) {
    if (!keys.some((k) => k.offset.has(b.name))) continue;
    const values = Float32Array.from(keys.flatMap((k) => [...(k.offset.get(b.name) ?? [0, 0, 0])]));
    if (values.some((v) => v !== 0))
      tracks.push({ bone: b.name, path: 'translation', times, values });
  }
  tracks.push(
    ...rotationTracks(
      spec.plan.bones,
      times,
      keys.map((k) => k.rotation),
    ),
  );
  return { name: spec.name, seconds: T, loop: spec.loop, tracks };
}
