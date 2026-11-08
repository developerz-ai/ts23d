// Stripes painted per vertex, following the form (README "Coat and stripe logic"):
//   trunk  dorso-ventral stripes anchored on the spine (shared by both sides so they meet over the
//          back), each side its own slant, wobble, reach, forks (Y), doubles and breaks — left and
//          right differ like a real tiger's. Denser toward the rear; on the haunch they bend back
//          round the thigh; sparse and broken on the shoulder; thinning into the white belly.
//   legs   horizontal bands on the outer/back side; few on the fore legs, more on the hind.
//   tail   dorsal dashes near the root, then full rings, thickening to a black tip.
// Deterministic: a fixed seed hashed per stripe, never Math.random. Returns coverage 0..1,
// antialiased with a band that widens at coarse LODs (vertex spacing).

import type { Vec3 } from '@developerz.ai/ts23d';
import { arcT, smoothstep, spline } from '../_lib/creature/curve.ts';
import { SK } from './skeleton.ts';
import { FORE_CHAIN, HIND_CHAIN, legFrame, lerpTable, TOP_LINE, whiteEdge } from './zones.ts';

const SEED = 1931;
/** Antialias half-band per LOD (metres). */
const AA = [0.0065, 0.011, 0.022] as const;

/** Integer hash → [0, 1). */
export function hash(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 668265263 + SEED * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface SideStripe {
  /** Shift along x per unit descent (+ = forward as it goes down). */
  readonly slant: number;
  /** Bend: extra slant growing with descent² (haunch stripes curve back). */
  readonly bend: number;
  readonly wobA: number;
  readonly wobF: number;
  readonly wobP: number;
  /** Where it ends, in descent units (1 = the white edge). */
  readonly reach: number;
  /** Where it starts (0 = on the spine; > 0 = begins on the flank). */
  readonly start: number;
  /** Half-width at the top, metres. */
  readonly w: number;
  /** Fork point (descent) or 2 = none. */
  readonly fork: number;
  /** A gap (descent) that breaks the stripe into a dash and a spot, or 2 = none. */
  readonly gap: number;
  /** A thin companion stripe this far behind, or 0. */
  readonly twin: number;
}

interface Stripe {
  readonly x: number;
  readonly side: readonly [SideStripe, SideStripe];
}

/** Stripe spacing along the back at x: denser to the rear (photos), wide on the shoulder. */
const spacing = (x: number): number =>
  lerpTable(
    [
      [-0.9, 0.056],
      [-0.5, 0.062],
      [0.0, 0.074],
      [0.3, 0.086],
      [0.55, 0.075],
      [0.8, 0.065],
    ],
    x,
  );

function sideOf(k: number, s: number, x: number): SideStripe {
  const r = (salt: number): number => hash(k * 2 + s, salt);
  const haunch = smoothstep(-0.35, -0.7, x);
  const shoulder = smoothstep(0.22, 0.38, x) * smoothstep(0.62, 0.5, x);
  return {
    slant: 0.05 + (r(1) - 0.5) * 0.08 - 0.04 * haunch,
    bend: -0.12 * haunch - (r(2) - 0.3) * 0.05,
    wobA: 0.004 + 0.01 * r(3),
    wobF: 5 + 6 * r(4),
    wobP: r(5) * 6.283,
    reach: (0.85 + 0.4 * r(6)) * (1 - 0.15 * shoulder),
    start: shoulder * (0.05 + 0.25 * r(7)) + (r(8) < 0.15 ? 0.2 + 0.3 * r(9) : 0),
    w: (0.008 + 0.014 * r(10) ** 1.4) * (1 - 0.25 * shoulder),
    fork: r(11) < 0.38 ? 0.35 + 0.35 * r(12) : 2,
    gap: r(13) < 0.3 ? 0.45 + 0.35 * r(14) : 2,
    twin: r(15) < 0.18 ? 0.018 + 0.008 * r(16) : 0,
  };
}

/** The stripe table, spine anchors from the tail root to the head (built once). */
const STRIPES: readonly Stripe[] = (() => {
  const out: Stripe[] = [];
  let x = -0.86;
  let k = 0;
  while (x < 0.76) {
    out.push({ x, side: [sideOf(k, 0, x), sideOf(k, 1, x)] });
    const sp = spacing(x);
    x += sp * (0.66 + 0.4 * hash(k, 99));
    k++;
  }
  return out;
})();

/** Coverage of a stripe of half-width w at distance d. */
const cover = (d: number, w: number, aa: number): number =>
  w <= 0 ? 0 : smoothstep(w + aa, Math.max(0, w - aa), d);

/** One side-stripe's coverage at (x, descent). */
function stripeAt(a: number, st: SideStripe, x: number, s: number, aa: number): number {
  if (s < st.start - 0.05 || s > st.reach + 0.05) return 0;
  const centre = a + st.slant * s + st.bend * s * s + st.wobA * Math.sin(st.wobF * s + st.wobP);
  // Taper: full from the start, thinning over the last third of the reach; soft start.
  const taper =
    smoothstep(st.reach, st.reach - 0.3, s) * smoothstep(st.start - 0.05, st.start + 0.1, s);
  // Thinner toward the white belly.
  const w = st.w * taper * (1 - 0.35 * smoothstep(0.6, 1.1, s));
  let c: number;
  if (s > st.fork) {
    const spread = (s - st.fork) * 0.045;
    c = Math.max(
      cover(Math.abs(x - centre - spread), w * 0.7, aa),
      cover(Math.abs(x - centre + spread * 0.2), w * 0.6, aa),
    );
  } else c = cover(Math.abs(x - centre), w, aa);
  if (st.twin > 0 && s > 0.15 && s < st.reach * 0.75)
    c = Math.max(c, cover(Math.abs(x - centre + st.twin), w * 0.45, aa));
  if (st.gap < 2) c *= 1 - smoothstep(0.03, 0.0, Math.abs(s - st.gap) - 0.04);
  return c;
}

/** Index of the first stripe anchored at or after x. */
function lowerBound(x: number): number {
  let lo = 0;
  let hi = STRIPES.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if ((STRIPES[m]?.x ?? 0) < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Trunk / neck stripes at a body point (0..1). */
export function bodyStripe(p: Vec3, lod: number): number {
  const [x, y, z] = p;
  if (x < -0.95 || x > 0.8) return 0;
  const top = lerpTable(TOP_LINE, x);
  const edge = whiteEdge(x);
  const s = (top - z) / Math.max(0.05, top - edge);
  if (s < -0.1 || s > 1.3) return 0;
  // Legs below the trunk are leg stripes' business.
  if (z < 0.42) return 0;
  const side = y >= 0 ? 0 : 1;
  const aa = AA[lod as 0 | 1 | 2] ?? 0.02;
  const i = lowerBound(x);
  let c = 0;
  for (let j = i - 3; j <= i + 2; j++) {
    const st = STRIPES[j];
    if (!st) continue;
    c = Math.max(c, stripeAt(st.x, st.side[side], x, Math.max(0, s), aa));
  }
  return c;
}

interface LegSpec {
  readonly chain: readonly Vec3[];
  /** Band heights (z) and their count; outer/back mask. */
  readonly bands: number;
  readonly zLo: number;
  readonly zHi: number;
  readonly salt: number;
  /** Band half-width. */
  readonly w: number;
}

const FORE: LegSpec = {
  chain: FORE_CHAIN,
  bands: 5,
  zLo: 0.14,
  zHi: 0.5,
  salt: 300,
  w: 0.006,
};
const HIND: LegSpec = {
  chain: HIND_CHAIN,
  bands: 9,
  zLo: 0.12,
  zHi: 0.62,
  salt: 400,
  w: 0.0085,
};

/** Horizontal leg bands on the outer and back faces (0..1). */
export function legStripe(p: Vec3, lod: number): number {
  const [x, y0, z] = p;
  const y = Math.abs(y0);
  const side = y0 >= 0 ? 0 : 1;
  const spec = x > 0.15 ? FORE : HIND;
  if (z < spec.zLo - 0.03 || z > spec.zHi + 0.05) return 0;
  const f = legFrame(spec.chain, [x, y, z]);
  if (f.d > 0.16) return 0;
  // Outer and back faces only (front and inner faces stay plain / white).
  const mask =
    smoothstep(-0.35, 0.1, f.ry) * smoothstep(0.6, 0.1, f.rx) + smoothstep(-0.2, -0.7, f.rx) * 0.8;
  if (mask <= 0.01) return 0;
  const aa = AA[lod as 0 | 1 | 2] ?? 0.02;
  let c = 0;
  for (let k = 0; k < spec.bands; k++) {
    const r = (s: number): number => hash(spec.salt + k * 2 + side, s);
    const zc = spec.zLo + ((k + 0.3 + 0.4 * r(1)) / spec.bands) * (spec.zHi - spec.zLo);
    // Bands slope down toward the back and wobble round the leg.
    const centre = zc + (0.05 + 0.06 * r(2)) * -f.rx * 0.5 + 0.006 * Math.sin(f.ry * 4 + r(3) * 6);
    const w = spec.w * (0.6 + 0.8 * r(4)) * smoothstep(spec.zLo - 0.02, spec.zLo + 0.06, zc);
    // Some bands only wrap part of the leg.
    const part = r(5) < 0.35 ? smoothstep(-0.2, 0.3, f.ry) : 1;
    c = Math.max(c, cover(Math.abs(z - centre), w, aa) * part);
  }
  return c * Math.min(1, mask);
}

/** Tail centre line (root → tip) with arc fractions, sampled once. */
const TAIL = spline(SK.tail, 8);
const TAIL_T = arcT(TAIL);

/** Arc fraction along the tail of the nearest centre-line point, and how far up p sits (−1..1). */
export function tailCoord(p: Vec3): { t: number; up: number } {
  let best = { t: 0, up: 0, d: Number.POSITIVE_INFINITY };
  for (let i = 0; i + 1 < TAIL.length; i++) {
    const a = TAIL[i];
    const b = TAIL[i + 1];
    if (!a || !b) continue;
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const u = Math.min(
      1,
      Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2),
    );
    const q: Vec3 = [a[0] + ab[0] * u, a[1] + ab[1] * u, a[2] + ab[2] * u];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best.d) {
      const t0 = TAIL_T[i] ?? 0;
      const t1 = TAIL_T[i + 1] ?? 1;
      best = { t: t0 + (t1 - t0) * u, up: (p[2] - q[2]) / (d || 1), d };
    }
  }
  return { t: best.t, up: best.up };
}

/** Tail stripes (0..1): dorsal dashes near the root, then rings thickening to a black tip. */
export function tailStripe(p: Vec3, lod: number): number {
  const { t, up } = tailCoord(p);
  const aa = (AA[lod as 0 | 1 | 2] ?? 0.02) / 0.99;
  if (t > 0.9) return smoothstep(0.9, 0.93, t);
  const n = 11;
  let c = 0;
  for (let k = 0; k < n; k++) {
    const tc = 0.08 + (k / (n - 1)) * 0.78 + (hash(500 + k, 1) - 0.5) * 0.02;
    const w = (0.008 + 0.014 * (k / (n - 1))) * (0.85 + 0.3 * hash(500 + k, 2));
    // The first rings only cross the top of the tail; later ones close all round.
    const mask = k < 4 ? smoothstep(-0.6 + k * 0.2, -0.1 + k * 0.2, up) : 1;
    c = Math.max(c, cover(Math.abs(t - tc), w, aa) * mask);
  }
  return c;
}
