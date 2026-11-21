// Rain and mortar stains on the Warden Hall's dressed stone, as vertex colour on the stones
// themselves (D591). A stain is a soft field down the face: darkest under its source, fading
// down, a little wider at its foot than its head (water spreads as it runs), its edges eased
// (no hard rim), with fine vertical streaking along the wall. The stones under a stain get a fine
// grid on their outward face so the field has vertices to live on; joints stay joints.

import { dmath, type Vec3 } from '@developerz.ai/ts23d';

/** One stain on a bay face: centred `t` along the bay, from `top` (z) down `len`, `w` wide. */
export interface RainStain {
  readonly t: number;
  readonly top: number;
  readonly len: number;
  readonly w: number;
  /** The colour it pulls the stone toward, and how far at its darkest (0..1). */
  readonly color: Vec3;
  readonly k: number;
}

/** How much wider the foot is than the head (rain spreads as it runs). */
const SPREAD = 0.35;

/** Half-width of a stain at depth fraction d (0 at its head, 1 at its foot). */
export const halfWidth = (s: RainStain, d: number): number => (s.w / 2) * (1 + SPREAD * d);

/**
 * The stain's pull (0..1 × k) at (t, z): smooth across its width ((1 − x²)², no hard rim), fading
 * down ((1 − d)^1.6) to nothing at its foot, with fine streaking along the wall.
 */
export function stainWeight(s: RainStain, t: number, z: number): number {
  if (z > s.top + 1e-6 || z < s.top - s.len) return 0;
  const d = Math.min(1, Math.max(0, (s.top - z) / s.len));
  const x = Math.abs(t - s.t) / halfWidth(s, d);
  if (x >= 1) return 0;
  const across = (1 - x * x) * (1 - x * x);
  const fade = dmath.pow(1 - d, 1.6);
  const streaks = 0.85 + 0.15 * dmath.sin(t * 24 + s.t * 7.1);
  return s.k * across * fade * streaks;
}

/** `base` with every stain's pull applied in order. */
export function stainTone(base: Vec3, stains: readonly RainStain[], t: number, z: number): Vec3 {
  let c = base;
  for (const s of stains) {
    const w = stainWeight(s, t, z);
    if (w <= 0) continue;
    c = [
      c[0] + (s.color[0] - c[0]) * w,
      c[1] + (s.color[1] - c[1]) * w,
      c[2] + (s.color[2] - c[2]) * w,
    ];
  }
  return c;
}

/** Grid spacing on a stained face: along the wall, and down it. */
const STEP_T = 0.08;
const STEP_Z = 0.22;

/** Sorted breakpoints a..b: the ends, plus `step` samples inside any [lo, hi] window. */
function breaks(
  a: number,
  b: number,
  windows: readonly [number, number][],
  step: number,
): number[] {
  const out = [a, b];
  for (const [lo, hi] of windows) {
    const l = Math.max(a, lo);
    const h = Math.min(b, hi);
    if (h - l <= 0) continue;
    const n = Math.max(1, Math.ceil((h - l) / step));
    for (let i = 0; i <= n; i++) out.push(l + ((h - l) * i) / n);
  }
  out.sort((x, y) => x - y);
  return out.filter((v, i) => i === 0 || v - (out[i - 1] ?? v) > 1e-4);
}

/**
 * The grid lines (t and z) a stone face t0..t1 × z0..z1 needs for these stains: just its corners
 * when none reaches it, fine samples where one does.
 */
export function stainGrid(
  stains: readonly RainStain[],
  t0: number,
  t1: number,
  z0: number,
  z1: number,
): { ts: number[]; zs: number[] } {
  const hit = stains.filter((s) => {
    const hw = halfWidth(s, 1);
    return s.t + hw > t0 && s.t - hw < t1 && s.top > z0 && s.top - s.len < z1;
  });
  return {
    ts: breaks(
      t0,
      t1,
      hit.map((s) => [s.t - halfWidth(s, 1), s.t + halfWidth(s, 1)]),
      STEP_T,
    ),
    zs: breaks(
      z0,
      z1,
      hit.map((s) => [s.top - s.len, s.top]),
      STEP_Z,
    ),
  };
}
