// Snake clips (doc section 4): the serpenoid of [H09], fitted to the measured wave or left as
// published (the doc notes the two disagree: 0.71 L against 0.4 L along travel), sidewinding from two
// orthogonal waves [A15] with the root speed that holds the contact patches still, and a small idle.

import { type Clip, dmath, Ts23dError, type Vec3 } from '../core/index.ts';
import type { BodyPlan, PlanChain } from './body-plan-types.ts';
import { bakeChainClip, chainSampler, type RootKey, tipOf } from './chain-bake.ts';
import { orthogonalWaves, serpenoid, TAU } from './chain-drivers.ts';
import type { ChainField } from './chain-field.ts';
import { chainById, checkTrunk } from './swim-rig.ts';

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/** Lab snakes: wavelength 0.4 L, amplitude 0.1 L, 0.22 L per period [J20, H09]. */
export const SNAKE_WAVE = { lambda: 0.4, amplitude: 0.1, stride: 0.22 } as const;
/** [H09]'s curve: α = 7, one wave per arc length. */
export const HU_2009 = { alpha: 7, lambda: 1 } as const;
/** Undulation rate: no opened source gives one for a game-sized snake (design). */
const SNAKE_HZ = 1;

export interface SerpenoidShape {
  readonly alpha: number;
  /** Wavelength along the arc, chain lengths. */
  readonly lambda: number;
}

/** Mean over u of g(u) by the midpoint rule, 256 samples: enough for these smooth integrands. */
const mean = (g: (u: number) => number): number => {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += g(((i + 0.5) / 256) * TAU);
  return sum / 256;
};
const J0 = (th: number): number => mean((u) => dmath.cos(th * dmath.cos(u)));
/** ∫₀^π sin(θ sin u) du, from the mean of |sin(θ sin u)| over a full turn. */
const lateral = (th: number): number =>
  Math.PI * mean((u) => Math.abs(dmath.sin(th * dmath.sin(u))));

/** The serpenoid whose wave spans `lambda` along travel with half-swing `amplitude` (fractions of
 *  L). [H09]'s α = 7 curve spans 0.71 L, against the 0.4 L measured, so gates use this fit. */
export function fitSerpenoid(lambda: number, amplitude: number): SerpenoidShape {
  const want = amplitude / lambda;
  const ratio = (th: number): number => lateral(th) / (4 * Math.PI * J0(th));
  let [lo, hi] = [1e-3, 2.3];
  if (!(want > ratio(lo) && want < ratio(hi)))
    invalid(
      `no serpenoid has amplitude ÷ wavelength ${want}`,
      'use the measured 0.1 L amplitude on a 0.4 L wave',
    );
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) < want) lo = mid;
    else hi = mid;
  }
  const th = (lo + hi) / 2;
  const arc = lambda / J0(th);
  return { alpha: (TAU * th) / arc, lambda: arc };
}

export interface SnakeOptions {
  readonly chain: string;
  /** 'measured' fits [J20, H09]'s lab wave (default); 'hu2009' keeps their α = 7 curve. */
  readonly shape?: 'measured' | 'hu2009';
  readonly hz?: number;
}

/** Sidewinding wave shape: [A15] gives the phase relation, not these sizes (design). One whole
 *  wave on the body keeps its mean heading still, so the contact patches are not swung round. */
const SIDEWIND = { lambda: 1, bend: 3, pitch: 1 };
/** Share of the height range counted as ground contact (design). */
const CONTACT_BAND = 0.08;

/** Root velocity that holds the lowest links still, and the lift keeping them off the floor. */
function contactRoot(plan: BodyPlan, chain: PlanChain, field: ChainField, f: number) {
  const sample = chainSampler({
    name: 'contact',
    plan,
    seconds: 1 / f,
    loop: true,
    drives: [{ chain, field }],
    recoil: { chains: [chain], axes: [0, 1] },
  });
  const N = 32;
  const dt = 1 / (f * N);
  const heads = Array.from({ length: N }, (_, i) =>
    chain.links.map((l) => tipOf(plan, sample(i * dt), l.bone.name)),
  );
  const rest = Math.min(...chain.links.map((l) => l.bone.tail[2]));
  const low = Math.min(...heads.flat().map((p) => p[2]));
  let [vx, vy, count] = [0, 0, 0];
  heads.forEach((frame, i) => {
    const zs = frame.map((p) => p[2]);
    const [lo, hi] = [Math.min(...zs), Math.max(...zs)];
    const before = heads[(i + N - 1) % N] ?? frame;
    const after = heads[(i + 1) % N] ?? frame;
    frame.forEach((p, j) => {
      if (p[2] > lo + CONTACT_BAND * (hi - lo)) return;
      const [a, b] = [before[j] ?? p, after[j] ?? p];
      vx += (b[0] - a[0]) / (2 * dt);
      vy += (b[1] - a[1]) / (2 * dt);
      count++;
    });
  });
  const v: Vec3 = [-vx / count, -vy / count, Math.max(0, rest - low)];
  return (t: number): RootKey => ({ pos: [v[0] * t, v[1] * t, v[2]], yaw: 0 });
}

/** `slither` (lateral undulation), `sidewind` (two waves 90° apart) and a small `idle`. */
export function snakeClips(plan: BodyPlan, o: SnakeOptions): Clip[] {
  const chain = chainById(plan, o.chain);
  checkTrunk(chain);
  const f = o.hz ?? SNAKE_HZ;
  const fit =
    o.shape === 'hu2009' ? HU_2009 : fitSerpenoid(SNAKE_WAVE.lambda, SNAKE_WAVE.amplitude);
  const U = SNAKE_WAVE.stride * f * plan.length;
  const recoil = { chains: [chain], axes: [1] as const };
  const side = orthogonalWaves(
    { f, lambda: SIDEWIND.lambda, alpha: SIDEWIND.bend },
    { lambda: SIDEWIND.lambda, alpha: SIDEWIND.pitch },
  );
  return [
    bakeChainClip({
      name: 'slither',
      plan,
      seconds: 2 / f,
      cycles: 2,
      loop: true,
      drives: [{ chain, field: serpenoid({ f, ...fit }) }],
      root: (t) => ({ pos: [U * t, 0, 0], yaw: 0 }),
      recoil,
    }),
    bakeChainClip({
      name: 'sidewind',
      plan,
      seconds: 2 / f,
      cycles: 2,
      loop: true,
      drives: [{ chain, field: side }],
      root: contactRoot(plan, chain, side, f),
      recoil: { chains: [chain], axes: [0, 1] },
    }),
    bakeChainClip({
      name: 'idle',
      plan,
      seconds: 4 / f,
      cycles: 1,
      loop: true,
      drives: [{ chain, field: serpenoid({ f: f / 4, lambda: fit.lambda, alpha: fit.alpha / 6 }) }],
      recoil,
    }),
  ];
}
