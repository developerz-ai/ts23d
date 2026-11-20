// Neck geometry for hydra clips: how far each neck may swing sideways before it meets a neighbour,
// measured from the rest skeleton, and the fields that bend a neck in the vertical plane through its
// own chord, whatever way its bones happen to be framed, so a coil or lunge stays in its sector.

import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { chainCurve } from './body-plan-curve.ts';
import type { BodyPlan, PlanChain } from './body-plan-types.ts';
import { TAU } from './chain-drivers.ts';
import type { ChainField } from './chain-field.ts';

/** Rest pairs nearer than this many radii-sums are neighbours by design (as QA `chain-cross`). */
const NEIGHBOUR_RADII = 1.5;
/** Share of the free gap one neck may use: both of a pair can lean in at once. */
const GAP_SHARE = 0.4;
/** Limb radius when a plan has no spec to read: the share of the chain QA assumes unskinned. */
const BARE_RADIUS = 0.03;
/** Depth of the drawn-back S: peak turn is π × this. */
const COIL = 0.9;

/** A neck and the head it carries, as sample points with arc distance from the shoulder. */
interface Reach {
  readonly at: readonly Vec3[];
  readonly arc: readonly number[];
  readonly radius: readonly number[];
}

const SAMPLES_PER_LINK = 3;

function radiusOn(plan: BodyPlan, c: PlanChain, s: number, boneLength: number): number {
  const spec = plan.spec?.chains.find((x) => x.name === c.spec);
  if (spec) return chainCurve(spec).at(s).r;
  return Math.max(BARE_RADIUS * c.length, boneLength / 4);
}

function reachOf(plan: BodyPlan, chains: readonly PlanChain[]): Reach {
  const at: Vec3[] = [];
  const arc: number[] = [];
  const radius: number[] = [];
  let run = 0;
  for (const c of chains)
    c.links.forEach((l, i) => {
      const end = c.links[i + 1]?.s ?? 1;
      for (let k = 1; k <= SAMPLES_PER_LINK; k++) {
        const f = k / SAMPLES_PER_LINK;
        const { head: h, tail: e } = l.bone;
        at.push([h[0] + (e[0] - h[0]) * f, h[1] + (e[1] - h[1]) * f, h[2] + (e[2] - h[2]) * f]);
        arc.push(run + l.length * f);
        radius.push(radiusOn(plan, c, l.s + (end - l.s) * f, l.length));
      }
      run += l.length;
    });
  return { at, arc, radius };
}

/** Yaw room of each neck: the free gap to every neighbour, over the arc that swings into it. */
export function swingRoom(
  plan: BodyPlan,
  limbs: readonly (readonly PlanChain[])[],
  most: number,
): number[] {
  const reaches = limbs.map((l) => reachOf(plan, l));
  return reaches.map((me, i) => {
    let room = most;
    reaches.forEach((other, j) => {
      if (j === i) return;
      me.at.forEach((p, a) => {
        const arc = me.arc[a] ?? 1;
        const r = me.radius[a] ?? 0;
        other.at.forEach((q, b) => {
          const sum = r + (other.radius[b] ?? 0);
          const d = dmath.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
          if (d >= sum * NEIGHBOUR_RADII) room = Math.min(room, (GAP_SHARE * (d - sum)) / arc);
        });
      });
    });
    return Math.max(0, room);
  });
}

/** The axis a neck turns about to stay in the vertical plane through its chord: + lifts it. */
function planeAxis(c: PlanChain): Vec3 {
  const [a, b] = [c.links[0]?.bone.head, c.links.at(-1)?.bone.tail];
  if (!a || !b) return [0, 1, 0];
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const axis: Vec3 = [d[1], -d[0], 0];
  const l = dmath.hypot(axis[0], axis[1]);
  return l > 1e-9 ? [axis[0] / l, axis[1] / l, 0] : [0, 1, 0];
}

const dotOf = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Shares of a turn about `axis` on each link's bend and pitch axes, looked up by arc position. */
function planeShares(c: PlanChain, axis: Vec3) {
  const at = (s: number) => c.links.findLast((l) => l.s <= s) ?? c.links[0];
  return {
    bend: (s: number): number => {
      const l = at(s);
      return l ? dotOf(axis, l.bend) : 0;
    },
    pitch: (s: number): number => {
      const l = at(s);
      return l ? dotOf(axis, l.pitch) : 1;
    },
  };
}

/** The drawn-back S in the neck's own plane: zero net turn, so the head keeps its direction. */
export function coilOf(c: PlanChain, amount = 1): ChainField {
  const k = planeShares(c, planeAxis(c));
  const f = (s: number): number => amount * Math.PI * COIL * dmath.sin(TAU * s);
  return { kn: (s) => f(s) * k.bend(s), kb: (s) => f(s) * k.pitch(s) };
}

/** The whole neck leaning in that plane: + back and up, - forward over the target. */
export function leanOf(c: PlanChain, angle: (t: number) => number): ChainField {
  const k = planeShares(c, planeAxis(c));
  return { base: (t) => ({ bend: angle(t) * k.bend(0), pitch: angle(t) * k.pitch(0) }) };
}

/** Strike sizes tried, largest first: the first that keeps clear of the other necks is used. */
const STRIKE_SIZES = [1, 0.85, 0.7, 0.55, 0.4, 0.3] as const;
/** Clearance kept over the radii sum (QA allows 20 % contact; the others are also idling). */
const STRIKE_MARGIN = 1.05;

/** Bone end points of a limb under a pose, each with its radius. */
type PosedLimb = readonly { readonly p: Vec3; readonly r: number }[];

/**
 * The largest strike size for limb `k` whose poses all stay out of the other limbs at rest. `poses`
 * gives the limb's posed points at a size: the wind-up and the lunge are what reach furthest.
 */
export function strikeSize(
  plan: BodyPlan,
  limbs: readonly (readonly PlanChain[])[],
  k: number,
  poses: (size: number) => readonly PosedLimb[],
): number {
  const reaches = limbs.map((l) => reachOf(plan, l));
  const me = reaches[k];
  if (!me) return 1;
  const clear = (posed: PosedLimb): boolean =>
    reaches.every((other, j) => {
      if (j === k) return true;
      return posed.every((q, a) =>
        other.at.every((o, b) => {
          const sum = q.r + (other.radius[b] ?? 0);
          // Pairs already touching at rest are neighbours by design, as in QA.
          const rest = me.at[a * SAMPLES_PER_LINK + SAMPLES_PER_LINK - 1] ?? q.p;
          if (dmath.hypot(rest[0] - o[0], rest[1] - o[1], rest[2] - o[2]) < sum * NEIGHBOUR_RADII)
            return true;
          return dmath.hypot(q.p[0] - o[0], q.p[1] - o[1], q.p[2] - o[2]) >= sum * STRIKE_MARGIN;
        }),
      );
    });
  return STRIKE_SIZES.find((size) => poses(size).every(clear)) ?? STRIKE_SIZES.at(-1) ?? 1;
}

/** The radius `reachOf` gives each link end of a limb, in link order. */
export function limbRadii(plan: BodyPlan, limb: readonly PlanChain[]): number[] {
  const { radius } = reachOf(plan, limb);
  return radius.filter((_, i) => (i + 1) % SAMPLES_PER_LINK === 0);
}
