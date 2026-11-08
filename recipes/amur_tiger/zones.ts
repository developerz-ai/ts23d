// Body zones in world space, shared by the coat paint and the stripe layout: the dorsal (top) line
// and the edge of the white underside along the trunk, the white-ness of any point (underside,
// throat, inner legs) and the dorsal weight. Pure lookups, no randomness.

import type { Vec3 } from '@developerz.ai/ts23d';
import { smoothstep } from '../_lib/creature/curve.ts';
import { SK } from './skeleton.ts';

/** Piecewise-linear lookup over sorted x. */
export function lerpTable(t: readonly (readonly [number, number])[], x: number): number {
  const first = t[0];
  const last = t[t.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1];
    const b = t[i];
    if (a && b && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

/** Height of the white underside's edge along the trunk (x → z), photos (README "Coat"). */
const WHITE_LINE: readonly (readonly [number, number])[] = [
  [-0.95, 0.62],
  [-0.7, 0.6],
  [-0.4, 0.585],
  [-0.1, 0.56],
  [0.25, 0.54],
  [0.45, 0.58],
  [0.62, 0.68],
  [0.8, 0.74],
];

/** Edge of the white underside at x. */
export function whiteEdge(x: number): number {
  return lerpTable(WHITE_LINE, x);
}

/** Leg bone chains (left) for the leg colour and stripe frames. */
export const FORE_CHAIN: readonly Vec3[] = [
  SK.fore.shoulder,
  SK.fore.elbow,
  SK.fore.wrist,
  SK.fore.paw,
];
export const HIND_CHAIN: readonly Vec3[] = [SK.hind.hip, SK.hind.knee, SK.hind.hock, SK.hind.paw];

export interface LegFrame {
  /** Unit radial direction from the bone to p (x, y components; + y = outer side). */
  readonly rx: number;
  readonly ry: number;
  /** Distance from the bone line. */
  readonly d: number;
}

/** Nearest point on a leg chain → the radial direction to p (left-side coordinates). */
export function legFrame(chain: readonly Vec3[], p: Vec3): LegFrame {
  let best: LegFrame = { rx: 0, ry: 0, d: Number.POSITIVE_INFINITY };
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    if (!a || !b) continue;
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.min(
      1,
      Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2),
    );
    const v: Vec3 = [p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t];
    const d = Math.hypot(v[0], v[1], v[2]);
    if (d < best.d) best = { rx: v[0] / (d || 1), ry: v[1] / (d || 1), d };
  }
  return best;
}

/** The leg chain a point belongs to (by x: fore legs ahead of the belly). */
export const chainOf = (x: number): readonly Vec3[] => (x > 0.12 ? FORE_CHAIN : HIND_CHAIN);

/**
 * White of a leg point: the inner face and (lower down) the back of each leg are white, the
 * outer-front face orange — and how much a point is "leg" rather than trunk (0..1).
 */
export function legWhite(p: Vec3): { w: number; leg: number } {
  const q: Vec3 = [p[0], Math.abs(p[1]), p[2]];
  const fore = p[0] > 0.12;
  const f = legFrame(chainOf(p[0]), q);
  const inner = smoothstep(-0.05, -0.55, f.ry);
  const backK = fore ? 0.9 : smoothstep(0.42, 0.22, p[2]) * 0.85;
  const back = smoothstep(-0.15, -0.65, f.rx) * backK;
  // Toes and paws pale; the front of the lower leg pale orange (coat.ts) rather than white.
  const paw = smoothstep(0.07, 0.03, p[2]) * 0.6;
  const below = smoothstep(whiteEdge(p[0]) + 0.02, whiteEdge(p[0]) - 0.1, p[2]);
  const leg = Math.max(below * smoothstep(0.17, 0.11, f.d), smoothstep(0.36, 0.3, p[2]));
  return { w: Math.min(1, Math.max(inner, back, paw)), leg };
}

/** How white a body point is (0 orange … 1 white). */
export function whiteOf(p: Vec3): number {
  const [x, y0, z] = p;
  const y = Math.abs(y0);
  const edge = lerpTable(WHITE_LINE, x);
  // The edge wanders a little (fur, not paint).
  const wob = 0.018 * Math.sin(x * 23 + 1.3) + 0.01 * Math.sin(x * 61);
  const trunk = smoothstep(edge + 0.03 + wob, edge - 0.03 + wob, z);
  const lw = legWhite(p);
  const w = trunk * (1 - lw.leg) + lw.w * lw.leg;
  // Throat and the front of the chest.
  // Throat, chest and the brisket between the fore legs: white from the chin down.
  const throat = smoothstep(0.48, 0.58, x) * smoothstep(0.8, 0.7, z) * smoothstep(0.14, 0.08, y);
  return Math.min(1, Math.max(w, throat));
}

/** Dorsal weight: the deeper orange along the spine. */
export function dorsalOf(p: Vec3): number {
  return smoothstep(0.82, 0.96, p[2]) * smoothstep(0.12, 0.0, Math.abs(p[1]));
}

/** Top of the body (the dorsal line incl. the nape) along x. */
export const TOP_LINE: readonly (readonly [number, number])[] = [
  [-0.9, 0.84],
  ...[...SK.spine].reverse().map((p) => [p[0], p[2]] as const),
  [0.6, 0.955],
  [0.74, 0.9],
];
