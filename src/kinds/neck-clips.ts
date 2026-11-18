// Hydra necks (doc section 3): each neck follows the path of its own head, heads attend in a seeded
// order, one strikes at a time and the body takes the recoil. No animal has several necks, so
// everything marked (design) in the doc stays a design value here. Snakes live in snake-clips.ts.
// A neck swings sideways only as far as the measured gap to its neighbours allows, and coils and
// lunges in its own vertical plane, so necks never pass through each other (QA `chain-cross`).

import { type Clip, createRng, type Rng, Ts23dError } from '../core/index.ts';
import { lockFeet } from './body-plan-footlock.ts';
import { coilOf, leanOf, limbRadii, strikeSize, swingRoom } from './body-plan-neck.ts';
import type { BodyPlan, PlanChain } from './body-plan-types.ts';
import { bakeChainClip, chainSampler, tipOf } from './chain-bake.ts';
import { followPath, ramp, TAU } from './chain-drivers.ts';
import { type ChainField, fadeField, sumFields } from './chain-field.ts';
import { forward, tailOf } from './pose.ts';
import { chainById } from './swim-rig.ts';

export * from './snake-clips.ts';

const DEG = Math.PI / 180;
/** Mean acceleration of snake strikes, m/s² [P16]. */
export const STRIKE_ACCEL = 190;
/** Minimum-jerk peak acceleration = 5.773 d / T². */
const MIN_JERK_ACCEL = 5.773;

/** Hydra timing and swing, all (design). */
const IDLE_SECONDS = 8;
const PATH_DELAY = 0.6;
const YAW_SWING = 25 * DEG;
const PITCH_SWING = 8 * DEG;
/** The neck leans back on the wind-up and forward through the strike, radians (design). */
const LEAN_BACK = 0.16;
const LUNGE = 0.2;
const ATTENTION_WIDTH = 0.3;
const WIND_UP = 0.45;
const HOLD = 0.05;
const RECOVER = 0.7;
/** Neck mass per metre against the body's, for the strike's recoil. */
const NECK_DENSITY = 0.15;

export interface HydraOptions {
  /** Neck chain ids, in their order round the shoulder. */
  readonly necks: readonly string[];
  readonly seed: number;
  /** Chain carried on each neck's tip (a head), same order: its tip is what strikes. */
  readonly heads?: readonly string[];
  /** Lower-jaw chain of each head, same order: it parts at rest and snaps shut on the strike. */
  readonly jaws?: readonly string[];
  /** Legs (hip, knee, foot links): their feet stay planted while the body recoils. */
  readonly legs?: readonly string[];
}

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/** Fisher-Yates over 0..n-1 from the seeded stream. */
function order(rng: Rng, n: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j] ?? 0, out[i] ?? 0];
  }
  return out;
}

interface NeckPath {
  readonly yaw: (t: number) => number;
  readonly pitch: (t: number) => number;
}

/** Each neck's own loop: integer frequencies, seeded phases, one attention turn per clip. */
function neckPaths(necks: readonly PlanChain[], room: readonly number[], seed: number): NeckPath[] {
  const root = createRng(seed);
  const n = necks.length;
  const rate = order(root.fork('rates'), n);
  const turn = order(root.fork('attention'), n);
  const T = IDLE_SECONDS;
  return necks.map((_, i) => {
    const rng = root.fork(`neck_${i}`);
    const m = 1 + (rate[i] ?? 0);
    const [p1, p2, p3] = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
    const side = rng.next() < 0.5 ? -1 : 1;
    const slot = (turn[i] ?? 0) / n;
    const attention = (t: number): number => {
      const u = t / T - slot;
      const x = (u - Math.floor(u)) / ATTENTION_WIDTH;
      return x < 1 ? Math.sin(Math.PI * x) ** 2 : 0;
    };
    const A = room[i] ?? 0;
    return {
      yaw: (t) =>
        A *
        (0.45 * Math.sin((TAU * m * t) / T + p1) +
          0.25 * Math.sin((TAU * (2 * m + 1) * t) / T + p2) +
          0.3 * side * attention(t)),
      pitch: (t) => PITCH_SWING * Math.sin((TAU * (m + 1) * t) / T + p3),
    };
  });
}

const neckField = (p: NeckPath): ChainField =>
  followPath({ heading: p.yaw, pitch: p.pitch, delay: PATH_DELAY, lead: 'end' });

/** A jaw held at `angle` (radians, + shuts it) by turning its one bone about its own hinge. */
const jawField = (angle: (t: number) => number): ChainField => ({
  base: (t) => ({ pitch: angle(t) }),
});

const JAW_IDLE = 0.035;
const JAW_GAPE = 0.42;

/** Each jaw breathes a little; the striking one gapes on the wind-up and snaps shut on contact. */
function jawDrives(
  plan: BodyPlan,
  o: HydraOptions,
  k: number | null,
  strike?: { open: (t: number) => number; shut: (t: number) => number },
): { chain: PlanChain; field: ChainField }[] {
  return (o.jaws ?? []).map((id, i) => {
    const chain = chainById(plan, id);
    const phase = 1 + i * 1.7;
    const idle = (t: number): number => JAW_IDLE * Math.sin((TAU * t) / IDLE_SECONDS + phase);
    if (i !== k || !strike) return { chain, field: jawField(idle) };
    return {
      chain,
      field: jawField((t) => idle(t) - JAW_GAPE * strike.open(t) * (1 - strike.shut(t))),
    };
  });
}

const ramp2 =
  (end: number) =>
  (t: number): number =>
    ramp(t, 0, end);

/** 0 until the strike nears contact, then 1: the gape is gone and the jaw is back at idle. */
const ramp2Shut =
  (from: number, to: number) =>
  (t: number): number =>
    ramp(t, from + (to - from) * 0.55, to);

function strikeClip(
  plan: BodyPlan,
  o: HydraOptions,
  necks: readonly PlanChain[],
  paths: readonly NeckPath[],
  limbs: readonly (readonly PlanChain[])[],
  k: number,
): Clip {
  const neck = necks[k];
  if (!neck) return invalid(`no neck ${k}`, 'strike a listed neck');
  const headId = o.heads?.[k];
  const tipChain = headId ? chainById(plan, headId) : neck;
  const tip = tipChain.links.at(-1)?.bone.name ?? '';
  const base = { name: 'reach', plan, seconds: 1, loop: false };
  const pose = (field: ChainField) =>
    chainSampler({ ...base, drives: [{ chain: neck, field }] })(0);
  const drawnPose = (size: number) =>
    pose(
      sumFields(
        coilOf(neck, size),
        leanOf(neck, () => LEAN_BACK * size),
      ),
    );
  const lungePose = (size: number) => pose(leanOf(neck, () => -LUNGE * size));
  const limb = limbs[k] ?? [neck];
  const radii = limbRadii(plan, limb);
  const size = strikeSize(plan, limbs, k, (s) =>
    [drawnPose(s), lungePose(s)].map((key) => {
      const world = forward(plan.bones, { rotation: key.rotation, offset: key.offset });
      return limb
        .flatMap((c) => c.links)
        .flatMap((l, i) => {
          const w = world.get(l.bone.name);
          return w ? [{ p: tailOf(l.bone, w), r: radii[i] ?? 0 }] : [];
        });
    }),
  );
  const coil = coilOf(neck, size);
  const [a, b] = [tipOf(plan, drawnPose(size), tip), tipOf(plan, lungePose(size), tip)];
  const reach = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // Peak acceleration equals the mean [P16] measured, below its 279 m/s² peak; larger animals are
  // probably slower still, which no opened source quantifies (doc section 3).
  const stroke = Math.sqrt((MIN_JERK_ACCEL * reach) / STRIKE_ACCEL);
  const t1 = WIND_UP;
  const t2 = t1 + HOLD;
  const t3 = t2 + stroke;
  const t4 = t3 + HOLD;
  const T = t4 + RECOVER;
  const drawn = (t: number): number => ramp(t, 0, t1) - ramp(t, t2, t3);
  const idle = (t: number): number => 1 - ramp(t, 0, t1) + ramp(t, t4, T);
  const leaning = (t: number): number =>
    size * (LEAN_BACK * drawn(t) - LUNGE * (ramp(t, t2, t3) - ramp(t, t4, T)));
  const own = new Set([...o.necks, ...(o.heads ?? [])]);
  const legs = (o.legs ?? []).map((id) => chainById(plan, id));
  const clip = bakeChainClip({
    name: `strike_${k}`,
    plan,
    seconds: T,
    loop: false,
    cycles: T / stroke,
    drives: necks
      .map((chain, i) => {
        const path = paths[i];
        const field = path ? neckField(path) : {};
        return {
          chain,
          field:
            i === k
              ? sumFields(fadeField(field, idle), fadeField(coil, drawn), leanOf(neck, leaning))
              : field,
        };
      })
      .concat(jawDrives(plan, o, k, { open: ramp2(t1), shut: ramp2Shut(t2, t3) })),
    // Centre of mass stays put [D]: the body answers the neck.
    recoil: {
      chains: plan.chains,
      axes: [0, 1],
      mass: (c, l) => l.length * (own.has(c.id) ? NECK_DENSITY : 1),
    },
  });
  return legs.length > 0 ? lockFeet(clip, plan.root, legs) : clip;
}

/** `idle` (staggered attention, looping) and one `strike_<k>` per neck. */
export function hydraClips(plan: BodyPlan, o: HydraOptions): Clip[] {
  if (o.necks.length === 0) invalid('hydra has no necks', 'name its neck chains');
  if (o.heads && o.heads.length !== o.necks.length)
    invalid('hydra heads and necks differ in number', 'give one head chain per neck');
  if (o.jaws && o.jaws.length !== o.necks.length)
    invalid('hydra jaws and necks differ in number', 'give one jaw chain per neck');
  const necks = o.necks.map((id) => chainById(plan, id));
  const limbs = necks.map((neck, i) => {
    const head = o.heads?.[i];
    return head ? [neck, chainById(plan, head)] : [neck];
  });
  const paths = neckPaths(necks, swingRoom(plan, limbs, YAW_SWING), o.seed);
  const idle = bakeChainClip({
    name: 'idle',
    plan,
    seconds: IDLE_SECONDS,
    loop: true,
    cycles: necks.length * 2 + 1,
    drives: [
      ...necks.flatMap((chain, i) => {
        const p = paths[i];
        return p ? [{ chain, field: neckField(p) }] : [];
      }),
      ...jawDrives(plan, o, null),
    ],
  });
  return [idle, ...necks.map((_, k) => strikeClip(plan, o, necks, paths, limbs, k))];
}
