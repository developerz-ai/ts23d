// King cobra body: the arc-length centreline of the alert rest pose (front third raised, the rest in
// loose curves on the ground), its parallel-transported frame, and the section with the hood. s is
// the distance from the snout along the body, metres. Numbers and sources: README.md.

import type { Vec3 } from '@developerz.ai/ts23d';
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

const halfWidth = profile([
  [0, 0.0004],
  [0.004, 0.0105],
  [0.014, 0.0185],
  [0.034, 0.0265],
  [HEAD.length * 0.72, HEAD.width / 2],
  [HEAD.length, 0.0255],
  [0.112, 0.022],
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
  f * Math.cos(FACING) - w * Math.sin(FACING),
  f * Math.sin(FACING) + w * Math.cos(FACING),
  z,
];

/** Height of a pile turn's axis above its belly-on-ground height, per turn below the top. */
const TURN_RISE = 0.045;
const COIL_TURNS = 1.85;
const COIL_RISE = TURN_RISE * COIL_TURNS;
const COIL_STEP = 0.49;
const COIL_POINTS = Math.round((COIL_TURNS * Math.PI * 2) / COIL_STEP);
const AXIS_ON_GROUND = 0.022;

/** The pile: a tightening helix, each turn resting on the shoulder of the one below. */
const coil = (i: number): Vec3 => {
  const k = i / COIL_POINTS;
  const a = (100 * Math.PI) / 180 + i * COIL_STEP;
  const r = 0.19 + 0.085 * k + 0.02 * Math.max(0, k - 1);
  return faced(r * Math.cos(a), r * Math.sin(a), COIL_RISE + AXIS_ON_GROUND);
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

/** Top of the pile's axis: what the raised front leaves from. */
export const COIL_TOP = COIL_RISE + AXIS_ON_GROUND;

/** Share of the pile's height still under the body at s: the last half metre lies on the ground. */
const pileShare = (s: number): number => Math.max(0, Math.min(1, 1 - (s - 1) / 2));

interface Sample {
  readonly s: number;
  readonly p: Vec3;
  readonly t: Vec3;
  readonly d: Vec3;
}

function buildSamples(): Sample[] {
  const c = curve3(CONTROL);
  const N = 1400;
  const raw = Array.from({ length: N + 1 }, (_, i) => c(i / N));
  const arcs = [0];
  for (let i = 1; i <= N; i++) {
    const [a, b] = [raw[i - 1] ?? [0, 0, 0], raw[i] ?? [0, 0, 0]];
    arcs.push((arcs[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const out: Sample[] = [];
  let d: Vec3 = [0, 0, 1];
  raw.forEach((q, i) => {
    const s = arcs[i] ?? 0;
    // In the pile each turn's axis rides at its belly's own height over the turn below.
    const onGround = smooth(0.8, 0.95, s);
    const seat = bellyHalf(Math.min(s, TOTAL)) - AXIS_ON_GROUND - COIL_RISE * (1 - pileShare(s));
    const p: Vec3 = [q[0], q[1], q[2] + onGround * seat];
    const next = raw[Math.min(N, i + 1)] ?? q;
    const prev = raw[Math.max(0, i - 1)] ?? q;
    const t = norm(sub(next, prev));
    // On the ground the back settles to face straight up; the raised part keeps its transport.
    d = add(d, [0, 0, 0.05 * onGround]);
    d = norm(sub(d, scale(t, dot(d, t))));
    out.push({ s, p, t, d });
  });
  return out;
}

const SAMPLES = buildSamples();
export const CURVE_LENGTH = SAMPLES.at(-1)?.s ?? 0;

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
  const [sn, cs] = [Math.sin(a), Math.cos(a)];
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
