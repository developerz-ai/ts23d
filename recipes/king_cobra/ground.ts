// Cobra poses on the ground: `idle_ground` (resting flat in a loose coil, the neck in loose S-bends)
// and `rear` (from the pile with the front third laid out on the ground, the raised length growing
// from the head while everything behind it stays planted). Paths are built by integrating curvature
// along the body, so arc length is exact; joints are then walked on at the skeleton's bone lengths.

import type { Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { add, norm, scale, smooth, sub, TAU } from '../_lib/body-plan-kit.ts';
import { seatHeight, settleHeights, TOTAL } from './shape.ts';
import type { SpinePose } from './solve.ts';

/** Scutes stand this far proud of the tube: the joints ride up by it on the ground. */
export const GROUND_LIFT = 0.0024;
const UP: Vec3 = [0, 0, 1];
const STEP = 0.002;

/** Arc position of every joint: the rest skeleton's bone lengths summed from the head. */
export const jointArcs = (rest: SpinePose): number[] => {
  const s = [0];
  for (let i = 1; i < rest.at.length; i++)
    s.push(
      (s[i - 1] ?? 0) +
        dmath.norm(sub(rest.at[i] as Vec3, rest.at[i - 1] as Vec3) as [number, number, number]),
    );
  return s;
};

/** A planar path from `start` heading `heading` (radians), curvature `k(u)` at arc u, sampled every STEP. */
function integrate(
  start: readonly [number, number],
  heading: number,
  length: number,
  k: (u: number) => number,
) {
  const pts: [number, number][] = [[start[0], start[1]]];
  let [x, y, h] = [start[0], start[1], heading];
  for (let u = 0; u < length; u += STEP) {
    h += k(u + STEP / 2) * STEP;
    x += dmath.cos(h) * STEP;
    y += dmath.sin(h) * STEP;
    pts.push([x, y]);
  }
  return pts;
}

/** Point at arc `u` of a path sampled every STEP. */
const at = (pts: readonly (readonly [number, number])[], u: number): [number, number] => {
  const f = Math.max(0, Math.min(pts.length - 1.000001, u / STEP));
  const i = Math.floor(f);
  const [a, b] = [pts[i] ?? [0, 0], pts[i + 1] ?? pts[i] ?? [0, 0]];
  return [a[0] + (b[0] - a[0]) * (f - i), a[1] + (b[1] - a[1]) * (f - i)];
};

/**
 * Resting flat, design values (no measured resting posture was found): the rear two thirds in a
 * loose Archimedean coil round the rest pile's centre, tail inside, turns 0.1 m apart (about 4 cm of
 * ground between them); the front third leaves it in loose S-bends of 0.75 m wavelength and 4.5 cm
 * half-swing. `breathe` (0..1) and the head's `shift` (0..1) are the clip's slow motion.
 */
export const IDLE_GROUND = {
  inner: 0.22,
  spacing: 0.1,
  front: 1.2,
  lambda: 0.75,
  swing: 0.045,
  /** Every joint stays this close to the rest pile's centre. */
  footprint: 0.85,
} as const;

export function restingPose(arcs: readonly number[], breathe: number, shift: number): SpinePose {
  const g = IDLE_GROUND;
  const kw = (g.swing * (1 + 0.06 * breathe)) / dmath.pow(g.lambda / TAU, 2);
  // u runs from the tail (0) to the snout (TOTAL).
  const curvature = (u: number): number => {
    const s = TOTAL - u;
    const coil = 1 / Math.sqrt(g.inner * g.inner + (g.spacing * u) / Math.PI);
    const wave = smooth(g.front, g.front - 0.3, s) * smooth(0.05, 0.25, s);
    // The head shift turns the snout about 9 degrees over the neck's 0.26 m.
    const turn = ((0.15 * shift) / 0.26) * smooth(0.12, 0.2, s) * smooth(0.42, 0.34, s);
    const open = 1 - 0.55 * smooth(g.front + 0.2, g.front - 0.2, s);
    return coil * open + kw * wave * dmath.sin((TAU * (g.front - s)) / g.lambda) + turn;
  };
  const path = integrate([g.inner, 0], Math.PI / 2, TOTAL + 0.05, curvature);
  // The spiral's centre sits a little off its start: centre the coil on the rest pile.
  const tailTurn = path.slice(0, Math.round(1.4 / STEP));
  const c = tailTurn.reduce(
    (m, p) => [m[0] + p[0] / tailTurn.length, m[1] + p[1] / tailTurn.length],
    [0, 0],
  );
  const xy = arcs.map((s): [number, number] => {
    const p = at(path, TOTAL - s);
    return [p[0] - c[0], p[1] - c[1]];
  });
  const lift = (s: number): number => 0.02 * shift * smooth(0.14, 0, s);
  return {
    at: xy.map((p, i): Vec3 => {
      const s = arcs[i] ?? 0;
      return [p[0], p[1], seatHeight(s) + GROUND_LIFT + lift(s)];
    }),
    dorsal: arcs.slice(1).map(() => UP),
  };
}

export interface LaidFront {
  readonly at: readonly Vec3[];
  /** Heading (radians, toward the head) of the laid body at arc s. */
  readonly heading: (s: number) => number;
}

const headingOf = (v: Vec3): number => dmath.atan2(v[1], v[0]);
const wrap = (a: number): number => a - TAU * Math.round(a / TAU);

/**
 * The front laid out from the joint `hinge` (on the pile) toward the head: it first follows the
 * stance's own curl over the pile (`curl` links), so the rise starts where the stance's does, then
 * runs off the pile in a loose S on the ground (design: 1.1 m wavelength).
 */
export function laidFront(
  rest: SpinePose,
  arcs: readonly number[],
  hinge: number,
  curl = 4,
): LaidFront {
  const base = rest.at[hinge] as Vec3;
  const H = arcs[hinge] ?? 0;
  const seg = (m: number): Vec3 => sub(rest.at[m] as Vec3, rest.at[m + 1] as Vec3);
  const first = headingOf(seg(hinge - 1));
  const turn = wrap(headingOf(seg(hinge - curl)) - first);
  const span = (arcs[hinge - 1] ?? 0) - (arcs[hinge - curl] ?? 0);
  const curlEnd = H - (arcs[hinge - curl] ?? 0);
  const path = integrate([base[0], base[1]], first, H + 0.05, (u) => {
    const lo = (H - (arcs[hinge - 1] ?? 0)) / 2;
    if (u < lo) return 0;
    if (u < lo + span) return turn / span;
    return -1.6 * smooth(curlEnd, curlEnd + 0.25, u) * dmath.sin((TAU * (u - curlEnd)) / 1.1);
  });
  const front = arcs.slice(0, hinge).map((s) => at(path, H - s));
  // Heights: on the ground, or draped over the pile turns beneath (the pile itself stays put).
  const pile = Array.from({ length: 300 }, (_, i) => H + 0.2 + (i / 299) * (TOTAL - H - 0.2));
  const pileXY = pile.map((s) => {
    const i = arcs.findIndex((a) => a >= s);
    const [a, b] = [rest.at[Math.max(0, i - 1)] as Vec3, rest.at[Math.max(0, i)] as Vec3];
    const k =
      i <= 0 ? 0 : (s - (arcs[i - 1] ?? 0)) / Math.max(1e-9, (arcs[i] ?? 0) - (arcs[i - 1] ?? 0));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] as [number, number];
  });
  const z = settleHeights(
    [...front, [base[0], base[1]], ...pileXY],
    [...arcs.slice(0, hinge), H, ...pile],
  );
  return {
    at: [
      ...front.map(
        (p, i): Vec3 => [p[0], p[1], Math.max(z[i] ?? 0, seatHeight(arcs[i] ?? 0)) + GROUND_LIFT],
      ),
      ...rest.at.slice(hinge),
    ],
    heading: (s) => {
      const [p, q] = [at(path, H - s - 0.005), at(path, H - s + 0.005)];
      return dmath.atan2(q[1] - p[1], q[0] - p[0]);
    },
  };
}

const ramp = (x: number): number => Math.max(0, Math.min(1, x));

/** Unit direction between a and b at share k: its climb is mixed linearly (so heights between two
 *  poses stay between them), its heading is that of the mixed horizontal parts. */
function blendDir(a: Vec3, b: Vec3, k: number): Vec3 {
  const z = a[2] + (b[2] - a[2]) * k;
  const hx = a[0] + (b[0] - a[0]) * k;
  const hy = a[1] + (b[1] - a[1]) * k;
  const l = dmath.hypot(hx, hy);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return l < 1e-6 ? [0, 0, Math.sign(z) || 1] : [(r * hx) / l, (r * hy) / l, z];
}

/** Pitch of the rising front at `from` metres ahead of its base, for `L` metres raised (design):
 *  it stays on its line for the first `L − 0.82` m, turns up by θ over a third of the rest, runs
 *  straight, and the last 15 cm bend the head back down to level. θ grows with L, so a short
 *  raised length only lifts the head a little and no joint ever folds sharply. */
function pitchAt(from: number, L: number): number {
  const flat = Math.max(0, L - 0.82);
  const up = Math.min(0.25, 0.35 * (L - flat));
  const head = Math.min(0.15, 0.2 * L);
  const theta = (Math.PI / 2) * smooth(0, 0.7, L);
  return theta * ramp((from - flat) / up) - theta * ramp((from - (L - head)) / head);
}

/**
 * The rearing body with `raised` metres of the front off the ground: joints behind that length lie
 * where `front` lays them, the raised part rises from them along the laid track, pitched up by
 * `pitchAt`, then `settle` (0..1) carries it into the stance, ending exactly on it.
 */
export function rearing(
  rest: SpinePose,
  front: LaidFront,
  arcs: readonly number[],
  hinge: number,
  raised: number,
  settle: number,
): SpinePose {
  const laid = front.at;
  const H = arcs[hinge] ?? 0;
  const L = Math.max(1e-4, Math.min(H, raised));
  // The laid body's point and heading at arc L.
  let j = 0;
  while (j < hinge - 1 && (arcs[j + 1] ?? 0) < L) j++;
  const t = ramp((L - (arcs[j] ?? 0)) / Math.max(1e-9, (arcs[j + 1] ?? 0) - (arcs[j] ?? 0)));
  const base = add(laid[j] as Vec3, scale(sub(laid[j + 1] as Vec3, laid[j] as Vec3), t));
  // The raised part keeps the laid body's track in plan, pitched up by `pitchAt`.
  const h = (from: number): Vec3 => {
    const a = front.heading(L - from);
    return [dmath.cos(a), dmath.sin(a), 0];
  };
  const along = (from: number): Vec3 => {
    const [phi, d] = [pitchAt(from, L), h(from)];
    return [d[0] * dmath.cos(phi), d[1] * dmath.cos(phi), dmath.sin(phi)];
  };
  const back = (from: number): Vec3 => {
    const [phi, d] = [pitchAt(from, L), h(from)];
    return [-d[0] * dmath.sin(phi), -d[1] * dmath.sin(phi), dmath.cos(phi)];
  };
  // The rising profile, integrated a millimetre at a time from the base.
  const dz = 0.001;
  const profile: Vec3[] = [base];
  for (let f = 0; f < L; f += dz)
    profile.push(add(profile.at(-1) ?? base, scale(along(f + dz / 2), dz)));
  const onProfile = (from: number): Vec3 =>
    profile[Math.min(profile.length - 1, Math.round(from / dz))] ?? base;
  // Where the profile still runs flat it lies over the laid track, so it keeps the track's drape
  // over the pile turns below; a straight run at the base's height would cut into them.
  const laidOrRaised = arcs.map((s, i): Vec3 => {
    if (s >= L || i >= hinge) return laid[i] as Vec3;
    const p = onProfile(L - s);
    return [p[0], p[1], Math.max(p[2], (laid[i] as Vec3)[2])];
  });
  // Into the stance: each segment's direction turns toward the stance's, rebuilt from the hinge
  // at bone length, so the front neither stretches nor shoots up past either pose.
  const atJ = [...laidOrRaised];
  if (settle > 0)
    for (let i = hinge - 1; i >= 0; i--) {
      const from = norm(sub(laidOrRaised[i] as Vec3, laidOrRaised[i + 1] as Vec3));
      const to = norm(sub(rest.at[i] as Vec3, rest.at[i + 1] as Vec3));
      const len = (arcs[i + 1] ?? 0) - (arcs[i] ?? 0);
      atJ[i] = add(atJ[i + 1] as Vec3, scale(blendDir(from, to, settle), len));
    }
  const dorsal = arcs.slice(1).map((s, i): Vec3 => {
    if (i >= hinge) return rest.dorsal[i] ?? UP;
    const mid = ((arcs[i] ?? 0) + s) / 2;
    const d = mid >= L ? UP : back(L - mid);
    return norm(add(scale(d, 1 - settle), scale(rest.dorsal[i] ?? UP, settle)));
  });
  return { at: atJ, dorsal };
}
