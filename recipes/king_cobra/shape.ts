// King cobra body: the arc-length centreline of the alert rest pose (front third raised, the rest in
// loose curves on the ground), its parallel-transported frame, and the section with the hood. s is
// the distance from the snout along the body, metres. Numbers and sources: README.md.

import type { Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import {
  add,
  cross,
  curve3,
  dot,
  gauss,
  mix,
  norm,
  profile,
  scale,
  smooth,
  spow,
  sub,
} from '../_lib/body-plan-kit.ts';

export const TOTAL = 3.5;
/** Snout to vent: the tail is 18.1 % of total length in the species' neotype. */
export const SVL = TOTAL * (1 - 462 / 2547);
/** Head scaled from a 3005 mm holotype (72 × 52.5 × 30 mm) to this length. */
const K = TOTAL / 3.005;
export const HEAD = { length: 0.072 * K, width: 0.0525 * K, depth: 0.03 * K } as const;
/** Preserved midbody width, 43.2 mm at 3005 mm: narrower than a live snake. */
export const PRESERVED_WIDTH = 0.0432 * K;
/** Live body about 0.9 head widths across in the front photos (estimate, README). */
export const BODY_WIDTH = 0.9 * HEAD.width;
/** Hood about 2 head widths across at full spread, read off front photos (README); no published value found. */
export const HOOD_WIDTH = 2.05 * HEAD.width;
export const RAISED = TOTAL / 3;

/** A live head reads about a tenth wider than the fixed holotype's against the spread hood in the
 *  front photos (README); the holotype keeps its numbers, the skin takes this factor. */
export const LIVE_HEAD = 1.1;
const halfWidth = profile([
  [0, 0.0004 * LIVE_HEAD],
  [0.004, 0.0105 * LIVE_HEAD],
  [0.014, 0.0185 * LIVE_HEAD],
  [0.034, 0.0265 * LIVE_HEAD],
  [HEAD.length * 0.72, (HEAD.width / 2) * LIVE_HEAD],
  [HEAD.length, 0.0255 * LIVE_HEAD],
  [0.112, 0.0225],
  [0.5, 0.0238],
  [0.9, BODY_WIDTH * 0.47],
  [1.45, BODY_WIDTH * 0.55],
  [1.85, BODY_WIDTH * 0.56],
  [2.35, BODY_WIDTH * 0.47],
  [SVL, BODY_WIDTH * 0.33],
  [3.15, 0.0098],
  [3.4, 0.0042],
  [3.47, 0.0018],
  [TOTAL, 0.0006],
]);

/** Share of the hood spread at s: long and narrow, widest a little behind the head. */
export const hoodShare = profile([
  [0.085, 0],
  [0.115, 0.55],
  [0.16, 0.92],
  [0.205, 1],
  [0.27, 0.88],
  [0.34, 0.5],
  [0.4, 0.16],
  [0.45, 0],
]);

export const halfW = (s: number): number =>
  halfWidth(s) + hoodShare(s) * (HOOD_WIDTH / 2 - halfWidth(s));

/** Height of the section's top and belly halves over the half-width. */
const TOP = 0.92;
const BELLY = 0.7;
export const bellyHalf = (s: number): number => halfWidth(s) * BELLY;
/** Height of the spine joint at s lying on the ground: the snout's joint rides at head height. */
export const seatHeight = (s: number): number => bellyHalf(Math.max(s, HEAD.length * 0.72));

/** The raised front faces the hero camera: the spread hood is seen square on. */
const FACING = (-35 * Math.PI) / 180;
const faced = (f: number, w: number, z: number): Vec3 => [
  f * dmath.cos(FACING) - w * dmath.sin(FACING),
  f * dmath.sin(FACING) + w * dmath.cos(FACING),
  z,
];

const COIL_TURNS = 2.4;
const COIL_STEP = 0.49;
const COIL_POINTS = Math.round((COIL_TURNS * Math.PI * 2) / COIL_STEP);
/** Axis height the neck comes down to; the pile's own heights are settled (`settlePile`). */
const PILE_ENTRY = 0.095;

/** The pile's planform: a tight spiral widening toward the tail, each turn 2.4 cm inside the next,
 *  so the smaller top turn rides on the inner shoulder of the ground ring under the raised forebody
 *  and the rest reads as a pile of two turns, not one flat ring (heights: `settleHeights`). */
const coil = (i: number): Vec3 => {
  const u = (i * COIL_STEP) / (Math.PI * 2);
  const a = (100 * Math.PI) / 180 + i * COIL_STEP;
  const r = 0.165 + 0.024 * u;
  return faced(r * dmath.cos(a), r * dmath.sin(a), PILE_ENTRY);
};

/** Head level, the hood square to the viewer, an S down onto the top of the pile, then the pile. */
const CONTROL: readonly Vec3[] = [
  faced(0.155, 0, 0.742),
  faced(0.075, 0, 0.765),
  faced(0.02, 0, 0.73),
  faced(0.005, 0, 0.66),
  faced(0.015, 0, 0.56),
  faced(0.035, 0, 0.46),
  faced(0.055, 0, 0.365),
  faced(0.08, 0.015, 0.29),
  faced(0.09, 0.08, 0.225),
  faced(0.06, 0.15, 0.165),
  ...Array.from({ length: COIL_POINTS + 8 }, (_, i) => coil(i)),
];

/** Steepest climb of the body along itself where it rises onto a turn (design). */
const PILE_SLOPE = 0.35;
/** The oval contact under-reads the real section's shoulder: pad it so turns never cut in. */
const CONTACT_PAD = 1.15;
/** Half-length of the body over which a climb onto a turn is rounded. */
const SMOOTH = 0.1;
/** Arc distance below which two body samples are neighbours, not turns over turns. */
const TURN_GAP = 0.4;

/** Axis height where the section, sitting on the turn below, touches its top: both sections are
 *  flat-bellied ovals (BELLY under, TOP over the half-width), lateral offset `dh`. */
const restsOn = (hwUp: number, hwLow: number, dh: number): number => {
  const reach = hwUp + hwLow;
  return dh >= reach ? 0 : (BELLY * hwUp + TOP * hwLow) * Math.sqrt(1 - dmath.pow(dh / reach, 2));
};

/**
 * Axis heights of a body lying on the floor and on itself: every sample rests on the ground or on
 * the turn under it, never in the air. Lower turns lie further along the body (the tail is laid
 * first), so heights settle from the tail toward the head; a slope cap and a light smoothing keep
 * the climb onto a turn a curve. Exported for the clip poses that lie on the ground.
 */
export function settleHeights(
  xy: readonly (readonly [number, number])[],
  s: readonly number[],
): number[] {
  const n = xy.length;
  const hw = s.map((v) => halfWidth(Math.min(v, TOTAL)));
  const need = s.map((_, i) => bellyHalf(Math.min(s[i] ?? 0, TOTAL)));
  const z = [...need];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const [x, y] = xy[i] ?? [0, 0];
      for (let j = i + 1; j < n; j++) {
        if ((s[j] ?? 0) - (s[i] ?? 0) < TURN_GAP) continue;
        const [u, v] = xy[j] ?? [0, 0];
        const r = restsOn(hw[i] ?? 0, hw[j] ?? 0, dmath.hypot(u - x, v - y));
        if (r > 0) z[i] = Math.max(z[i] ?? 0, (z[j] ?? 0) + r * CONTACT_PAD + 0.003);
      }
      need[i] = z[i] ?? 0;
      if (i < n - 1)
        z[i] = Math.max(z[i] ?? 0, (z[i + 1] ?? 0) - PILE_SLOPE * ((s[i + 1] ?? 0) - (s[i] ?? 0)));
    }
    for (let i = 1; i < n; i++)
      z[i] = Math.max(z[i] ?? 0, (z[i - 1] ?? 0) - PILE_SLOPE * ((s[i] ?? 0) - (s[i - 1] ?? 0)));
  }
  // Round the climbs over about 20 cm of body; never below what holds the section up.
  const out = z.map((_, i) => {
    let [sum, count] = [0, 0];
    for (let j = i; j >= 0 && (s[i] ?? 0) - (s[j] ?? 0) < SMOOTH; j--)
      [sum, count] = [sum + (z[j] ?? 0), count + 1];
    for (let j = i + 1; j < n && (s[j] ?? 0) - (s[i] ?? 0) < SMOOTH; j++)
      [sum, count] = [sum + (z[j] ?? 0), count + 1];
    return Math.max(sum / count, need[i] ?? 0);
  });
  return out;
}

interface Sample {
  readonly s: number;
  readonly p: Vec3;
  readonly t: Vec3;
  readonly d: Vec3;
}

const arcsOf = (pts: readonly Vec3[]): number[] => {
  const arcs = [0];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1] ?? [0, 0, 0], pts[i] ?? [0, 0, 0]];
    arcs.push((arcs[i - 1] ?? 0) + dmath.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return arcs;
};

/** The control curve with the pile's heights settled; twice, since settling changes the arc length. */
function settledCurve(): { pts: Vec3[]; arcs: number[]; onGround: number[] } {
  const c = curve3(CONTROL);
  const N = 1400;
  const raw = Array.from({ length: N + 1 }, (_, i) => c(i / N));
  let pts = raw;
  let arcs = arcsOf(raw);
  for (let pass = 0; pass < 2; pass++) {
    // In the pile each turn's axis rests on the ground or on the turn below it.
    const first = arcs.findIndex((s) => s >= 0.75);
    const rested = settleHeights(
      raw.slice(first).map((q): [number, number] => [q[0], q[1]]),
      arcs.slice(first),
    );
    pts = raw.map((q, i): Vec3 => {
      const z = i >= first ? (rested[i - first] ?? q[2]) : q[2];
      return [q[0], q[1], mix(q[2], z, smooth(0.8, 0.95, arcs[i] ?? 0))];
    });
    arcs = arcsOf(pts);
  }
  return { pts, arcs, onGround: arcs.map((s) => smooth(0.8, 0.95, s)) };
}

function buildSamples(): Sample[] {
  const { pts, arcs, onGround } = settledCurve();
  const out: Sample[] = [];
  let d: Vec3 = [0, 0, 1];
  pts.forEach((p, i) => {
    const s = arcs[i] ?? 0;
    const next = pts[Math.min(pts.length - 1, i + 1)] ?? p;
    const prev = pts[Math.max(0, i - 1)] ?? p;
    const t = norm(sub(next, prev));
    // On the ground the back settles to face straight up; the raised part keeps its transport.
    d = add(d, [0, 0, 0.05 * (onGround[i] ?? 0)]);
    d = norm(sub(d, scale(t, dot(d, t))));
    out.push({ s, p, t, d });
  });
  return out;
}

const SAMPLES = buildSamples();
export const CURVE_LENGTH = SAMPLES.at(-1)?.s ?? 0;
/** Top of the pile's axis: what the raised front leaves from. */
export const COIL_TOP = Math.max(...SAMPLES.filter((x) => x.s >= RAISED).map((x) => x.p[2]));

/** Centreline point, tangent (toward the tail) and dorsal direction at s. */
export function frameAt(s: number): { p: Vec3; t: Vec3; d: Vec3; side: Vec3 } {
  let [lo, hi] = [0, SAMPLES.length - 1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((SAMPLES[mid]?.s ?? 0) <= s) lo = mid;
    else hi = mid;
  }
  const a = SAMPLES[lo] as Sample;
  const b = SAMPLES[hi] as Sample;
  const k = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-9, b.s - a.s)));
  const lerp = (u: Vec3, v: Vec3): Vec3 => add(u, scale(sub(v, u), k));
  const t = norm(lerp(a.t, b.t));
  const d = norm(sub(lerp(a.d, b.d), scale(t, dot(lerp(a.d, b.d), t))));
  return { p: lerp(a.p, b.p), t, d, side: cross(d, t) };
}

/** Section at (s, a): a from the dorsal ridge toward +side. Triangular over a flat belly. */
export function sectionAt(s: number, a: number): { lateral: number; up: number } {
  const [sn, cs] = [dmath.sin(a), dmath.cos(a)];
  const hood = hoodShare(s);
  const w = halfW(s);
  const base = halfWidth(s);
  const flat = mix(1, 0.38, hood);
  const narrowTop = 1 - 0.1 * Math.max(0, cs) * (1 - hood);
  const lateral = w * spow(sn, 0.85) * narrowTop;
  const up =
    cs >= 0
      ? base * TOP * flat * (spow(cs, 1.05) + 0.05 * gauss(sn, 0.16) * (1 - hood))
      : base * BELLY * flat * spow(cs, 0.72);
  // The spread hood is shallowly dished toward the front.
  return { lateral, up: up - hood * 0.011 * sn * sn };
}

export function surfacePoint(s: number, a: number, lift = 0): Vec3 {
  const f = frameAt(s);
  const { lateral, up } = sectionAt(s, a);
  const out = norm(
    add(
      scale(f.side, lateral / Math.max(1e-4, halfW(s))),
      scale(f.d, up / Math.max(1e-4, halfW(s))),
    ),
  );
  return add(add(add(f.p, scale(f.side, lateral)), scale(f.d, up)), scale(out, lift));
}
