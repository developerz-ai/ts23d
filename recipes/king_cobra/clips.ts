// Cobra clips. The rest pose is the alert stance, so the published ground gaits are baked on a straight
// flat copy of the spine by `snakeClips`, then every key is re-expressed on the real skeleton: the
// target joint frames come from the flat clip, the local rotations from those frames. `idle`, `hood_up`
// and `rear` are built the same way from joint targets, so the pile never slides.

import {
  type BodyPlan,
  type BodyPlanSpec,
  bodyPlan,
  type Clip,
  type Quat,
  quatRotate,
  snakeClips,
  type Track,
  type Vec3,
} from '@developerz.ai/ts23d';
import { add, dot, norm, scale, smooth, sub, TAU } from '../_lib/body-plan-kit.ts';
import { bellyHalf, COIL_TOP, RAISED, seatHeight, TOTAL } from './shape.ts';
import {
  bake,
  type CobraRig,
  type KeyOut,
  qaxis,
  qconj,
  qmul,
  qslerp,
  restPose,
  type SpinePose,
  solveSpine,
} from './solve.ts';

const SPREAD_FOLD = 1.25;
/** Scutes stand this far proud of the tube: the joints ride up by it on the ground. */
const GROUND_LIFT = 0.0024;

const addHood = (rig: CobraRig, k: KeyOut, fold: number): KeyOut => {
  for (const r of rig.ribs) k.rot.set(r.bone, qaxis(scale(r.fold, fold * SPREAD_FOLD)));
  return k;
};

/** Tongue tucked back along the head by `tuck` (0 out .. 1 in), flicking by `flick` radians. */
const addTongue = (rig: CobraRig, k: KeyOut, tuck: number, flick: number): KeyOut => {
  rig.tongue.forEach((bone, i) => {
    k.rot.set(bone, qaxis([0, flick * (i === 0 ? 0.3 : 0.8), flick * 0.4 * i]));
  });
  const first = rig.tongue[0];
  if (first) k.offset.set(first, scale(rig.tongueBack, 0.06 * tuck));
  return k;
};

/** How much the reared stance moves: every term is zero on the rest pose at the loop's seam. */
interface StanceMotion {
  readonly sway: number;
  readonly breathe: number;
  readonly flick: number;
}

const _dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A straight copy of the spine lying on the floor, head toward +X: what `snakeClips` accepts. */
export function flatPlan(spec: BodyPlanSpec): BodyPlan {
  const spine = spec.chains[0];
  if (!spine) throw new RangeError('the cobra plan has no spine chain');
  const z = bellyHalf(1.75);
  return bodyPlan({
    name: `${spec.name}_flat`,
    length: TOTAL,
    chains: [
      {
        name: 'spine',
        path: [
          [TOTAL / 2, 0, z],
          [0, 0, z],
          [-TOTAL / 2, 0, z],
        ],
        radius: [0.01, 0.025, 0.003],
        links: spine.links,
      },
    ],
  });
}

function trackAt(c: Clip, bone: string, path: Track['path']): Track | undefined {
  return c.tracks.find((t) => 'bone' in t && t.bone === bone && t.path === path);
}

/** The flat clip's key `k` as a spine pose: forward kinematics down the chain. */
function flatPose(flat: BodyPlan, clip: Clip, spine: readonly string[], k: number): SpinePose {
  const bones = spine.map((n) => flat.bones.find((b) => b.name === n));
  const root = trackAt(clip, flat.root, 'translation')?.values;
  const head0 = bones[0]?.head ?? ([0, 0, 0] as Vec3);
  let p: Vec3 = root
    ? add(head0, [root[k * 3] ?? 0, root[k * 3 + 1] ?? 0, root[k * 3 + 2] ?? 0])
    : head0;
  const at: Vec3[] = [p];
  const dorsal: Vec3[] = [];
  let world: Quat = [0, 0, 0, 1];
  spine.forEach((name, i) => {
    const v = trackAt(clip, name, 'rotation')?.values;
    const q: Quat = v
      ? [v[k * 4] ?? 0, v[k * 4 + 1] ?? 0, v[k * 4 + 2] ?? 0, v[k * 4 + 3] ?? 1]
      : [0, 0, 0, 1];
    world = qmul(world, q);
    const b = bones[i];
    const seg = b ? sub(b.tail, b.head) : ([0, 0, 0] as Vec3);
    p = add(p, quatRotate(world, seg));
    at.push(p);
    dorsal.push(quatRotate(world, [0, 0, 1]));
  });
  // The flat copy rides at one height; each joint really sits at its own belly's height.
  const ride = (flat.bones[0]?.head[2] ?? 0) - GROUND_LIFT;
  const seated = at.map(
    (q, i): Vec3 => [q[0], q[1], q[2] - ride + seatHeight((i / spine.length) * TOTAL)],
  );
  return { at: seated, dorsal };
}

export function cobraClips(
  rig: CobraRig,
  spec: BodyPlanSpec,
  dorsalOf: (i: number) => Vec3,
): Clip[] {
  const rest = restPose(rig.plan, rig.spine, dorsalOf);
  const flat = flatPlan(spec);
  const gaits = snakeClips(flat, { chain: 'spine', shape: 'measured' });
  const of = (name: string): Clip => {
    const c = gaits.find((g) => g.name === name);
    if (!c) throw new RangeError(`snakeClips gave no '${name}'`);
    return c;
  };
  const retarget = (source: Clip, name = source.name): Clip => {
    const n = (trackAt(source, flat.root, 'rotation')?.times.length ?? 1) - 1;
    return bake(rig, name, source.seconds, source.loop, n, (k) =>
      addTongue(
        rig,
        addHood(rig, solveSpine(rig, rest, flatPose(flat, source, rig.spine, k)), 1),
        1,
        0,
      ),
    );
  };

  const stance = (name: string, seconds: number, m: StanceMotion): Clip => {
    const count = rest.at.length;
    const pin = Math.ceil((RAISED * 1.05 * (count - 1)) / TOTAL);
    // sin(w - p) + sin(p) is zero at the first and last key whatever the phase p.
    const wave = (w: number, p: number): number => Math.sin(w - p) + Math.sin(p);
    return bake(rig, name, seconds, true, Math.round(seconds * 30), (_k, time) => {
      const w = (TAU * time) / seconds;
      const at = rest.at.map((p, i) => {
        const s = (i / (count - 1)) * TOTAL;
        const reach = m.sway * (1 - smooth(RAISED * 0.45, RAISED * 1.05, s));
        return add(p, [
          0.012 * reach * wave(w * 2, s * 2),
          0.03 * reach * wave(w, s * 1.6),
          0.006 * reach * wave(w * 2, -0.7),
        ]);
      });
      const swell = Math.sin(w) ** 2;
      const burst = Math.max(0, Math.sin(w * 4)) ** 2;
      const key = solveSpine(rig, rest, { at, dorsal: rest.dorsal }, pin);
      return addTongue(
        rig,
        addHood(rig, key, m.breathe * swell),
        0.35 * swell * (1 - burst),
        m.flick * burst * Math.sin(time * 34),
      );
    });
  };

  /** From the front laid out on the ground, hood folded, up into the alert stance. The coil stays. */
  const rear = (): Clip => {
    const seconds = 1.6;
    const count = rest.at.length;
    const sOf = (i: number): number => (i / (count - 1)) * TOTAL;
    const hinge = Math.ceil(((RAISED + 0.1) / TOTAL) * (count - 1));
    const base = rest.at[hinge] as Vec3;
    const back = rest.at[hinge + 1] as Vec3;
    const ahead = norm([base[0] - back[0], base[1] - back[1], 0]);
    const low = rest.at.map((p, i): Vec3 => {
      if (i >= hinge) return p;
      const q = add(base, scale(ahead, sOf(hinge) - sOf(i)));
      // Laid out over the coil's first turn, so it never cuts through it.
      const clear = (COIL_TOP + 0.03) * (1 - smooth(0.36, 0.62, Math.hypot(q[0], q[1])));
      return [q[0], q[1], seatHeight(sOf(i)) + GROUND_LIFT + clear + 0.03 * (1 - i / hinge)];
    });
    // The laid-out pose, its back carried up the chain from the pile so no joint twists.
    const lowDorsal = [...rest.dorsal];
    for (let i = hinge - 1; i >= 0; i--) {
      const t = norm(sub(low[i + 1] as Vec3, low[i] as Vec3));
      const up = lowDorsal[i + 1] as Vec3;
      lowDorsal[i] = norm(sub(up, scale(t, dot(up, t))));
    }
    const laid = solveSpine(rig, rest, { at: low, dorsal: lowDorsal }).rot;
    const IDENTITY: Quat = [0, 0, 0, 1];
    return bake(rig, 'rear', seconds, false, 48, (_k, time) => {
      const u = time / seconds;
      // Joint angles unwind from the neck's base to the head. The chain's root is the head, so
      // world rotations are built outward from the pile, which therefore never turns.
      const rot = new Map<string, Quat>();
      let world = IDENTITY;
      let at = rest.at[hinge] as Vec3;
      for (let i = hinge; i >= 0; i--) {
        const name = rig.spine[i] ?? '';
        const share = smooth(0, 1, u * 1.7 - 0.7 * (1 - i / hinge));
        const local = qslerp(laid.get(name) ?? IDENTITY, IDENTITY, share);
        if (i === 0) {
          rot.set(name, world);
          break;
        }
        rot.set(name, local);
        world = qmul(world, qconj(local));
        const seg = sub(rest.at[i] as Vec3, rest.at[i - 1] as Vec3);
        at = sub(at, quatRotate(world, seg));
      }
      const root = sub(at, rest.at[0] as Vec3);
      const key: KeyOut = { root, rot, offset: new Map() };
      return addTongue(rig, addHood(rig, key, 1 - smooth(0.45, 0.95, u)), 1 - smooth(0.7, 1, u), 0);
    });
  };

  return [
    retarget(of('slither')),
    retarget(of('idle'), 'idle_ground'),
    stance('idle', 5, { sway: 0.55, breathe: 0.05, flick: 0.3 }),
    stance('hood_up', 4, { sway: 1, breathe: 0.1, flick: 0.55 }),
    rear(),
  ];
}
