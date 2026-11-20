// Octopus arms (doc section 2): slow seeded curl waves at `idle`, `reach_<k>` as a bend running base
// to tip on a bell-shaped speed with the arm lengthening behind it [G96, H15], `fetch` folding one
// arm round three moving joints [S06], and `crawl` from a seeded recruitment with no repeating limb
// pattern [L15]. Peak curvature and twist are unpublished (doc section 9): those sizes are (design).
// Every large bend stays in the arm's own plane through the body axis, its sector, so arms do not
// pass through each other (QA `chain-cross`); only a small share of the idle wave leaves it.

import { type Clip, createRng, dmath, Ts23dError } from '../core/index.ts';
import type { BodyPlan, PlanChain } from './body-plan-types.ts';
import { bakeChainClip } from './chain-bake.ts';
import { bendPulse, hingeGroups, ramp, TAU } from './chain-drivers.ts';
import { type ChainField, sumFields } from './chain-field.ts';
import {
  PULSE_PRESETS,
  type PulseSpec,
  type PulseTarget,
  radialPulseClip,
} from './radial-pulse.ts';
import { chainById } from './swim-rig.ts';

/** Straight bend-propagation reach, mean duration, seconds [R15]. */
export const REACH_SECONDS = 2.4;
/** Mean arm strain at the end of a reach [H15]. */
export const REACH_STRAIN = 0.57;
/** Bump limits: link turn at the peak stays under this (design), under 12 rad / arm (doc sim 7). */
const MAX_LINK_TURN = 0.45;
const MAX_PEAK = 12;
const CURL = 2.5;

const IDLE_SECONDS = 6;
/** Anterior arms bend about 3× as often as posterior ones [K20]: integer cycles per loop. */
const FRONT_CYCLES = 3;
const REAR_CYCLES = 1;
const IDLE_BEND = 1.6;
const IDLE_TWIST = 0.6;
/** Share of the idle bend allowed out of the arm's own plane (design): neighbours stay clear. */
const IDLE_SIDEWAYS = 0.18;

const FETCH_SECONDS = 2;
/** Where the three joints sit and how far each folds: [S06] gives no ratio (design). */
const FETCH_HINGES = [
  { s: 0.25, turn: 1.1 },
  { s: 0.55, turn: -1.9 },
  { s: 0.8, turn: -0.9 },
] as const;

/** Long enough for every arm's events to spread out; 8 s cost 825 KiB of keys for no new motion. */
const CRAWL_SECONDS = 5;
/** Slow clips keep every 2nd 30 fps key: 15 fps still gives 16+ keys per idle cycle. */
const SLOW_KEY_STEP = 2;
const CRAWL_STRAIN = 0.3;
const CRAWL_CURL = 1;
/** Arm lengths per second (design). */
const CRAWL_SPEED = 0.05;
const REAR_EVENTS = 3;
const FRONT_EVENTS = 1;

export interface OctopusOptions {
  readonly arms: readonly string[];
  readonly seed: number;
  /** Mantle ring to pulse; adds `mantle_pulse`. */
  readonly mantle?: PulseTarget;
  readonly pulse?: PulseSpec;
}

/** Proximal third bends less, distal most [K20]; the taper's numbers are (design). */
const proximal = (s: number): number => 0.3 + 0.7 * ramp(s, 0.15, 0.6);

/** The same field with its main bend turned into the arm's own plane (about `pitch`). */
const inOwnPlane = ({ kn, kb, base, ...rest }: ChainField): ChainField => ({
  ...rest,
  ...(kn ? { kb: kn } : {}),
  ...(kb ? { kn: kb } : {}),
  ...(base
    ? {
        base: (t: number) => {
          const { bend, pitch, ...b } = base(t);
          return {
            ...b,
            ...(bend !== undefined ? { pitch: bend } : {}),
            ...(pitch !== undefined ? { bend: pitch } : {}),
          };
        },
      }
    : {}),
});

/** Every `step`-th key of a clip whose tracks share one time base, the last key always kept. */
function thinKeys(clip: Clip, step: number): Clip {
  return {
    ...clip,
    tracks: clip.tracks.map((t) => {
      const n = t.times.length;
      const keep = Array.from({ length: n }, (_, i) => i).filter(
        (i) => i % step === 0 || i === n - 1,
      );
      const size = t.values.length / n;
      const values = new Float32Array(keep.length * size);
      keep.forEach((k, i) => {
        values.set(t.values.subarray(k * size, (k + 1) * size), i * size);
      });
      return { ...t, times: Float32Array.from(keep, (k) => t.times[k] ?? 0), values };
    }),
  };
}

const forwardness = (c: PlanChain): number => {
  const [a, b] = [c.links[0]?.bone.head, c.links.at(-1)?.bone.tail];
  return a && b ? b[0] - a[0] : 0;
};

/** The arms toward +X, as a set: the anterior half. */
function frontArms(arms: readonly PlanChain[]): Set<string> {
  const sorted = [...arms].sort(
    (p, q) => forwardness(q) - forwardness(p) || (p.id < q.id ? -1 : 1),
  );
  return new Set(sorted.slice(0, Math.ceil(arms.length / 2)).map((c) => c.id));
}

function idleField(c: PlanChain, front: boolean, seed: number): ChainField {
  const rng = createRng(seed).fork(`idle_${c.id}`);
  const m = front ? FRONT_CYCLES : REAR_CYCLES;
  const f = m / IDLE_SECONDS;
  const [p1, p2, p3] = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
  // Twist runs both ways about equally often [K20].
  const sign = rng.next() < 0.5 ? -1 : 1;
  return {
    kb: (s, t) => IDLE_BEND * proximal(s) * dmath.sin(TAU * (0.8 * s - f * t) + p1),
    kn: (s, t) => IDLE_SIDEWAYS * IDLE_BEND * proximal(s) * dmath.sin(TAU * (0.6 * s - f * t) + p2),
    tw: (s, t) => sign * IDLE_TWIST * dmath.sin(TAU * (0.5 * s - f * t) + p3),
  };
}

/** The reach field of an arm with `n` links: widths and peak held to what the links can show. */
export function reachField(n: number, seconds = REACH_SECONDS): ChainField {
  return inOwnPlane(
    bendPulse({
      peak: Math.min(MAX_PEAK, MAX_LINK_TURN * n),
      width: Math.max(0.06, 1.5 / n),
      centre: (t) => ramp(t, 0, seconds),
      curl: (s) => CURL * s,
      strain: { peak: REACH_STRAIN, at: (t) => ramp(t, 0, seconds) },
    }),
  );
}

function fetchField(n: number): ChainField {
  const T = FETCH_SECONDS;
  const fold = (t: number): number => ramp(t, 0, 0.4 * T) - ramp(t, 0.7 * T, T);
  return inOwnPlane(
    hingeGroups(
      FETCH_HINGES.map((h) => ({
        s: h.s,
        width: Math.max(0.12, 2 / n),
        angle: (t: number) => h.turn * fold(t),
      })),
    ),
  );
}

export interface Recruitment {
  readonly start: number;
  readonly width: number;
}

/** Seeded push events of each arm, as shares of the loop; rear arms are recruited more [L15]. */
export function crawlSchedule(
  arms: readonly PlanChain[],
  seed: number,
): ReadonlyMap<string, readonly Recruitment[]> {
  const front = frontArms(arms);
  const root = createRng(seed).fork('crawl');
  return new Map(
    arms.map((c) => {
      const rng = root.fork(c.id);
      const n = front.has(c.id) ? FRONT_EVENTS : REAR_EVENTS;
      const events = Array.from({ length: n }, () => ({
        start: rng.next(),
        width: rng.range(0.12, 0.26),
      }));
      return [c.id, events] as const;
    }),
  );
}

/** Recruitment level at loop phase u: the strongest event covering it, wrapped round the seam. */
export function recruitAt(events: readonly Recruitment[], u: number): number {
  let h = 0;
  for (const e of events) {
    const d = u - e.start;
    const x = (d - Math.floor(d)) / e.width;
    if (x < 1) h = Math.max(h, dmath.pow(dmath.sin(Math.PI * x), 2));
  }
  return h;
}

function crawlField(events: readonly Recruitment[]): ChainField {
  const level = (t: number): number => recruitAt(events, t / CRAWL_SECONDS);
  return {
    // Length change belongs to the proximal arm [K20]; thrust is pushing by elongation [L15].
    e: (s, t) => CRAWL_STRAIN * level(t) * (1 - s),
    kb: (s, t) => CRAWL_CURL * level(t) * dmath.sin(Math.PI * s),
  };
}

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/** `idle`, `reach_<k>` per arm, `fetch` (first arm), `crawl`, and `mantle_pulse` when asked. */
export function octopusClips(plan: BodyPlan, o: OctopusOptions): Clip[] {
  if (o.arms.length === 0) invalid('octopus has no arms', 'name its arm chains');
  const arms = o.arms.map((id) => chainById(plan, id));
  const front = frontArms(arms);
  const first = arms[0];
  const schedule = crawlSchedule(arms, o.seed);
  const reach = plan.length * CRAWL_SPEED * CRAWL_SECONDS;
  const clips: Clip[] = [
    thinKeys(
      bakeChainClip({
        name: 'idle',
        plan,
        seconds: IDLE_SECONDS,
        loop: true,
        cycles: FRONT_CYCLES,
        drives: arms.map((chain) => ({
          chain,
          field: idleField(chain, front.has(chain.id), o.seed),
        })),
      }),
      SLOW_KEY_STEP,
    ),
    ...arms.map((chain, k) =>
      bakeChainClip({
        name: `reach_${k}`,
        plan,
        seconds: REACH_SECONDS,
        loop: false,
        drives: [{ chain, field: reachField(chain.links.length) }],
      }),
    ),
    ...(first
      ? [
          bakeChainClip({
            name: 'fetch',
            plan,
            seconds: FETCH_SECONDS,
            loop: false,
            drives: [{ chain: first, field: fetchField(first.links.length) }],
          }),
        ]
      : []),
    thinKeys(
      bakeChainClip({
        name: 'crawl',
        plan,
        seconds: CRAWL_SECONDS,
        loop: true,
        cycles: 4,
        drives: arms.map((chain) => ({
          chain,
          field: sumFields(crawlField(schedule.get(chain.id) ?? [])),
        })),
        root: (t) => ({ pos: [(reach * t) / CRAWL_SECONDS, 0, 0], yaw: 0 }),
      }),
      SLOW_KEY_STEP,
    ),
  ];
  if (o.mantle)
    clips.push(radialPulseClip('mantle_pulse', o.pulse ?? PULSE_PRESETS.squid, o.mantle));
  return clips;
}
