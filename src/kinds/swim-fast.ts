// The non-looping swim clips. `cstart`: stage 1 bends the body into a C, stage 2 throws it the other
// way as the mean heading turns, stage 3 swims off at burst frequency [D15]. `bite`: snout up, jaw
// down, then the upper jaw runs forward while the mouth closes [M97].

import type { Clip, Vec3 } from '../core/index.ts';
import type { PlanLink } from './body-plan-types.ts';
import { bakeChainClip } from './chain-bake.ts';
import { hingeGroups, ramp } from './chain-drivers.ts';
import { type ChainField, fadeField, linkSpans, sumFields } from './chain-field.ts';
import { bodyWave, chainById, finDrives, type SwimRig } from './swim-rig.ts';

const DEG = Math.PI / 180;
/** Stage 1, mean 51.6 ms in a 12 to 13 cm fish [D15], whose fast band is 22 Hz [SR23]: as a share
 *  of a fast tail beat it carries across sizes [D]. */
const STAGE_ONE_BEATS = 0.0516 * 22;
/** Mean stage 1 turn [D15]. */
const TURN = 77.2 * DEG;
/** Share of the turn the C bend reverses to in stage 2 (design). */
const REBOUND = 0.5;
/** Swim-off stage, tail beats (design). */
const SWIM_BEATS = 2;

/** One fast start to the left (side 1) or right (-1), ending in burst swimming. */
export function cstartClip(rig: SwimRig, name: string, side: 1 | -1): Clip {
  const f = rig.burstHz;
  const t1 = (STAGE_ONE_BEATS / f) * rig.p.startSlow;
  const t2 = t1; // No published stage 2 time in the opened sources (design).
  const t3 = SWIM_BEATS / f;
  const T = t1 + t2 + t3;
  const U = rig.p.stride * f * rig.L;
  // b: end-to-end body bend. m: mean body heading. The head leads the mean by half the bend.
  const bend = (t: number): number =>
    TURN *
    (2 * ramp(t, 0, t1) -
      (2 + REBOUND * 2) * ramp(t, t1, t1 + t2) +
      REBOUND * 2 * ramp(t, t1 + t2, t1 + t2 + t3 / 2));
  const mean = (t: number): number => TURN * ramp(t, t1, t1 + t2);
  const steps = 400;
  const path: Vec3[] = [[0, 0, 0]];
  for (let i = 1; i <= steps; i++) {
    const t = ((i - 0.5) * T) / steps;
    const v = U * ramp(t, t1, t1 + t2);
    const h = side * mean(t);
    const p = path[i - 1] ?? [0, 0, 0];
    path.push([p[0] + (v * Math.cos(h) * T) / steps, p[1] + (v * Math.sin(h) * T) / steps, 0]);
  }
  const alpha = rig.p.alpha?.burst ?? 0;
  const swim = fadeField(bodyWave(rig, f, alpha), (t) => ramp(t, t1 + t2, t1 + t2 + t3 / 2));
  const curl: ChainField = { kn: (_s, t) => -side * rig.z * bend(t) };
  return bakeChainClip({
    name,
    plan: rig.plan,
    seconds: T,
    loop: false,
    cycles: T * f,
    drives: [{ chain: rig.body, field: sumFields(swim, curl) }, ...finDrives(rig, f, swim)],
    root: (t) => {
      const i = Math.min(steps, Math.max(0, Math.round((t / T) * steps)));
      return {
        pos: path[i] ?? [0, 0, 0],
        yaw: side * (mean(t) + bend(t) / 2),
      };
    },
    recoil: { chains: rig.path, axes: [0, 1] },
  });
}

/** White shark bite sequence: mean about 0.99 s at 3.5 m [TM]; duration scaled with length [D]. */
const BITE_SECONDS_PER_M = 0.99 / 3.5;
/** Upper-jaw protrusion, share of head length: lemon shark [WM98]. */
export const PROTRUSION = 0.18;
/** Head length when the recipe gives none, share of L (design). */
const HEAD_SHARE = 0.2;
/** Gape and snout lift: no opened source gives angles (design). */
const GAPE = 35 * DEG;
const SNOUT_LIFT = 10 * DEG;

/** The pitch sign that swings the link's tail downward. */
function downward(link: PlanLink): 1 | -1 {
  const [p, h, e] = [link.pitch, link.bone.head, link.bone.tail];
  const d = [e[0] - h[0], e[1] - h[1]];
  return p[0] * (d[1] ?? 0) - p[1] * (d[0] ?? 0) <= 0 ? 1 : -1;
}

/** Timing as shares of the bite, exported so tests read the same order the clip bakes. */
export const BITE_TIMING = {
  gapePeak: 0.35,
  closed: 0.75,
  protrusionStart: 0.4,
  protrusionPeak: 0.6,
  protrusionEnd: 0.95,
} as const;

/** The bite, or null without jaw chains. Upper jaw peaks after the gape has begun closing [M97]. */
export function biteClip(rig: SwimRig): Clip | null {
  const jaw = rig.jaw;
  if (!jaw) return null;
  const T = BITE_SECONDS_PER_M * rig.L;
  const b = BITE_TIMING;
  const gape = (t: number): number =>
    ramp(t, 0, b.gapePeak * T) - ramp(t, b.gapePeak * T, b.closed * T);
  const protrude = (t: number): number =>
    ramp(t, b.protrusionStart * T, b.protrusionPeak * T) -
    ramp(t, b.protrusionPeak * T, b.protrusionEnd * T);
  const lower = chainById(rig.plan, jaw.lower);
  const lowerLink = lower.links[0];
  const head = rig.body.links[0];
  const spans = linkSpans(rig.body);
  const [m0, m1] = [spans[0]?.mid ?? 0, spans[1]?.mid ?? 1];
  if (!lowerLink || !head) return null;
  const lowerSign = downward(lowerLink);
  const lift = (t: number): number => SNOUT_LIFT * downward(head) * gape(t);
  // The head link lifts on its own joint and the next joint takes it back: the trunk stays level.
  const snout: ChainField = {
    ...hingeGroups([], [{ s: (m0 + m1) / 2, width: m1 - m0, angle: (t) => -lift(t) }]),
    base: (t) => ({ pitch: lift(t) }),
  };
  const headLength = jaw.headLength ?? HEAD_SHARE * rig.L;
  const reach = PROTRUSION * headLength;
  const upper = jaw.upper ? chainById(rig.plan, jaw.upper) : null;
  return bakeChainClip({
    name: 'bite',
    plan: rig.plan,
    seconds: T,
    loop: false,
    cycles: 4,
    drives: [
      { chain: rig.body, field: snout },
      {
        chain: lower,
        field: { base: (t) => ({ pitch: lowerSign * GAPE * gape(t) }) },
      },
      ...(upper
        ? [
            {
              chain: upper,
              field: {
                base: (t: number) => ({ offset: [reach * protrude(t), 0, 0] as Vec3 }),
              },
            },
          ]
        : []),
    ],
    recoil: { chains: rig.path, axes: [0, 1, 2] },
  });
}
