// A ring that pulses: squid mantle, jellyfish bell (doc sections 2 and 5). Not a chain: one radius
// factor over the cycle, baked to scale keys on leaf joints or to two morph weights on a part. The
// opened sources give ranges and cycle rates but NOT how a cycle splits between contraction and
// refill (doc section 2, "unverified"), so every `timing` share below is a design value.

import { type Bone, type Clip, dmath, type Track, Ts23dError, type Vec3 } from '../core/index.ts';
import { minJerk } from './chain-drivers.ts';
import { FPS } from './gait-bake.ts';

export interface PulseTiming {
  /** Shares of the cycle; what is left is the slow refill. */
  readonly inflate: number;
  readonly contract: number;
  /** Rest held at the end of the refill (a jellyfish's coast). */
  readonly coast: number;
}

export interface PulseSpec {
  readonly seconds: number;
  /** Radius change at full contraction, as a fraction: -0.3 is 30 % smaller. */
  readonly contract: number;
  /** Radius change at full inflation. */
  readonly inflate: number;
  readonly timing: PulseTiming;
}

export const PULSE_PRESETS: Readonly<Record<'squid' | 'jelly', PulseSpec>> = {
  // Jet period 0.62 s [B09]; -30 % and +9 %, the largest animals studied [TK01]. Timing: design.
  squid: {
    seconds: 0.62,
    contract: -0.3,
    inflate: 0.09,
    timing: { inflate: 0.25, contract: 0.2, coast: 0 },
  },
  // Mean peak 0.24 Hz in mature Aurelia [J26]; a passive coast follows relaxation [G13, HOP].
  // Contraction depth and all timing: design ("rowing species contract only partly" [HU18]).
  jelly: {
    seconds: 1 / 0.24,
    contract: -0.25,
    inflate: 0,
    timing: { inflate: 0, contract: 0.2, coast: 0.35 },
  },
};

export type PulseTarget =
  /** Scale keys on ring joints with no children. `axis`, the ring's axis, keeps its scale and must
   *  be a coordinate axis: joints rest unrotated, so scale acts along X, Y and Z only. */
  | { readonly bones: readonly string[]; readonly skeleton: readonly Bone[]; readonly axis: Vec3 }
  /** Weights on a part with two morph targets: [contracted, inflated]. */
  | { readonly part: string };

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

function checkPulse(p: PulseSpec): void {
  if (!(p.seconds > 0)) invalid(`pulse lasts ${p.seconds} s`, 'give a positive period');
  // The squid mantle's measured range [TK01] bounds every ring here.
  if (!(p.contract >= -0.4 && p.contract <= 0 && p.inflate >= 0 && p.inflate <= 0.18))
    invalid(
      `pulse range ${p.contract}..${p.inflate} is outside -0.40..+0.18`,
      'keep the radius change within the measured mantle range',
    );
  const { inflate, contract, coast } = p.timing;
  if (!(inflate >= 0 && contract > 0 && coast >= 0 && inflate + contract + coast < 1))
    invalid('pulse timing shares do not fit in one cycle', 'leave part of the cycle for refill');
  // The cycle starts and ends at rest: an inflation with no time to happen in would start it at
  // `inflate` and pop back to rest at the loop seam.
  if (p.inflate > 0 && inflate === 0)
    invalid(
      `pulse inflates by ${p.inflate} but timing.inflate gives it no share of the cycle`,
      'give timing.inflate a share above 0, or set inflate: 0 (a jellyfish only contracts)',
    );
}

/** Which coordinate axis the ring turns about; a tilted axis has no scale-key form. */
function ringAxis(axis: Vec3): 0 | 1 | 2 {
  const l = dmath.norm(axis);
  if (!(l > 0)) invalid('pulse ring axis is zero', 'give the axis the ring turns about');
  for (const k of [0, 1, 2] as const) if (Math.abs(axis[k]) >= l * (1 - 1e-9)) return k;
  return invalid(
    `pulse ring axis (${axis.join(', ')}) is not a coordinate axis`,
    'scale keys act along X, Y and Z only: use a coordinate axis, or drive a morph with { part }',
  );
}

/** Radius change at cycle phase u in 0..1: inflate, contract fast, refill slowly, coast. */
export function pulseAt(p: PulseSpec, u: number): number {
  const { inflate: a, contract: b, coast: c } = p.timing;
  const x = u - Math.floor(u);
  if (x < a) return p.inflate * minJerk(x / a);
  if (x < a + b) return p.inflate + (p.contract - p.inflate) * minJerk((x - a) / b);
  const refill = 1 - a - b - c;
  return p.contract * (1 - minJerk((x - a - b) / refill));
}

/** One looping clip of the pulse, `cycles` long. */
export function radialPulseClip(
  name: string,
  spec: PulseSpec,
  target: PulseTarget,
  cycles = 1,
): Clip {
  checkPulse(spec);
  if (!(Number.isInteger(cycles) && cycles > 0))
    invalid(`pulse has ${cycles} cycles`, 'a loop closes on a whole number of cycles');
  const T = spec.seconds * cycles;
  // The contraction is the fastest stroke: at least 6 keys across it.
  const perCycle = Math.ceil(6 / spec.timing.contract);
  const n = Math.max(Math.ceil(T * FPS), perCycle * cycles);
  const times = Float32Array.from({ length: n + 1 }, (_, i) => (i * T) / n);
  const value = (i: number): number =>
    i === n ? pulseAt(spec, 0) : pulseAt(spec, (i * cycles) / n);
  let tracks: Track[];
  if ('part' in target) {
    const values = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const v = value(i);
      values[i * 2] = spec.contract < 0 ? Math.max(0, v / spec.contract) : 0;
      values[i * 2 + 1] = spec.inflate > 0 ? Math.max(0, v / spec.inflate) : 0;
    }
    tracks = [{ part: target.part, path: 'weights', times, values }];
  } else {
    const axis = ringAxis(target.axis);
    const parents = new Set(target.skeleton.map((b) => b.parent));
    tracks = target.bones.map((bone) => {
      if (!target.skeleton.some((b) => b.name === bone))
        invalid(`pulse bone '${bone}' is not in the skeleton`, 'name a ring joint of the plan');
      // Scale is inherited: on a joint with children it would shear them (doc section 6).
      if (parents.has(bone))
        invalid(
          `pulse bone '${bone}' has child joints`,
          'scale leaf ring joints only, or drive a morph with { part }',
        );
      const values = new Float32Array((n + 1) * 3);
      for (let i = 0; i <= n; i++) {
        const v = value(i);
        for (let k = 0; k < 3; k++) values[i * 3 + k] = k === axis ? 1 : 1 + v;
      }
      return { bone, path: 'scale' as const, times, values };
    });
  }
  return { name, seconds: T, loop: true, tracks };
}
