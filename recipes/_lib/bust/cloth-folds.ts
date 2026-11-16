// Cloth folds as a displacement of the garment's thickness: each fold is a line on the cloth with
// a width and a signed amplitude (+ a rounded pipe ridge, − a sharper valley), faded in and out
// along its length. `foldField` sums them into one height h(p) in metres — ridges by max, valleys
// by min, so crossing folds never stack into a lump — with a declared Lipschitz bound, so the
// garment that adds h to its thickness can normalise its field and stay safe for the mesher.

import type { V } from './kit.ts';

export interface Fold {
  /** Centre line ON the cloth surface (≥ 2 points), metres. */
  readonly path: readonly V[];
  /** Half-width of the fold's influence, metres. */
  readonly width: number;
  /** Height at the line, metres: > 0 a ridge (pipe fold), < 0 a valley (crease between). */
  readonly amp: number;
  /** Fraction of the length faded in at the start and out at the end (default [0.25, 0.35]). */
  readonly fade?: readonly [number, number];
  /** Width at the end ÷ width at the start (default 1): a pipe fold opens as it falls. */
  readonly widen?: number;
}

/** A folds' height field and its slope bound. */
export interface FoldField {
  readonly h: (p: V) => number;
  /** Bound on |∇h| (h is at most this steep anywhere). */
  readonly lipschitz: number;
  /** Largest |h|, metres. */
  readonly peak: number;
}

/** Ridge profile (1 − s²)²: round-topped; max |φ'| = 8 / (3√3) ≈ 1.54. */
const ridge = (s: number): number => (1 - s * s) ** 2;
/** Valley profile (1 − s²)³: tighter than a ridge where the cloth tucks in, yet round at the
 *  bottom (a V-groove reads as a cut, and QA `connections` as a seam); max |φ'| ≈ 1.72. */
const valley = (s: number): number => (1 - s * s) ** 3;
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

interface Compiled {
  /** Per segment (stride 12): a, unit direction, length, arc length at a, midpoint, reach². */
  readonly seg: Float64Array;
  readonly total: number;
  readonly c: V;
  readonly r: number;
  readonly width: number;
  /** Width change per metre along the path. */
  readonly dw: number;
  readonly amp: number;
  readonly fin: number;
  readonly fout: number;
}

function compile(f: Fold): Compiled | null {
  const pts = f.path;
  if (pts.length < 2 || !(f.width > 0) || f.amp === 0) return null;
  const n = pts.length - 1;
  const seg = new Float64Array(n * 12);
  const wmax = f.width * Math.max(1, f.widen ?? 1);
  let total = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const a = pts[i] ?? [0, 0, 0];
    const b = pts[i + 1] ?? a;
    const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1e-9;
    const reach = l / 2 + wmax;
    const mid = [a[0] + d[0] / 2, a[1] + d[1] / 2, a[2] + d[2] / 2];
    seg.set(
      [a[0], a[1], a[2], d[0] / l, d[1] / l, d[2] / l, l, total, ...mid, reach * reach],
      i * 12,
    );
    total += l;
    for (const q of [a, b])
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k] ?? 0, q[k] ?? 0);
        hi[k] = Math.max(hi[k] ?? 0, q[k] ?? 0);
      }
  }
  const [x0 = 0, y0 = 0, z0 = 0] = lo;
  const [x1 = 0, y1 = 0, z1 = 0] = hi;
  const c: V = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const widen = f.widen ?? 1;
  const r = Math.hypot(x1 - c[0], y1 - c[1], z1 - c[2]) + f.width * Math.max(1, widen);
  const [fi, fo] = f.fade ?? [0.25, 0.35];
  const dw = (f.width * (widen - 1)) / total;
  return { seg, total, c, r, width: f.width, dw, amp: f.amp, fin: fi * total, fout: fo * total };
}

/** Weight in [0, 1] of one fold at p (profile across × fade along). */
function weight(f: Compiled, x: number, y: number, z: number): number {
  if (Math.hypot(x - f.c[0], y - f.c[1], z - f.c[2]) >= f.r) return 0;
  let best = Infinity;
  let at = 0;
  const s = f.seg;
  for (let i = 0; i < s.length; i += 12) {
    // A segment whose sphere (midpoint, half length + widest width) misses p cannot weigh in.
    const mx = x - (s[i + 8] ?? 0);
    const my = y - (s[i + 9] ?? 0);
    const mz = z - (s[i + 10] ?? 0);
    if (mx * mx + my * my + mz * mz > (s[i + 11] ?? 0)) continue;
    const px = x - (s[i] ?? 0);
    const py = y - (s[i + 1] ?? 0);
    const pz = z - (s[i + 2] ?? 0);
    const l = s[i + 6] ?? 0;
    const t0 = px * (s[i + 3] ?? 0) + py * (s[i + 4] ?? 0) + pz * (s[i + 5] ?? 0);
    const t = Math.min(Math.max(t0, 0), l);
    const qx = px - (s[i + 3] ?? 0) * t;
    const qy = py - (s[i + 4] ?? 0) * t;
    const qz = pz - (s[i + 5] ?? 0) * t;
    const d = qx * qx + qy * qy + qz * qz;
    if (d < best) {
      best = d;
      at = (s[i + 7] ?? 0) + t;
    }
  }
  if (best === Infinity) return 0;
  const u = Math.sqrt(best) / (f.width + f.dw * at);
  if (u >= 1) return 0;
  const env =
    (f.fin > 0 ? smooth(at / f.fin) : 1) * (f.fout > 0 ? smooth((f.total - at) / f.fout) : 1);
  return (f.amp > 0 ? ridge(u) : valley(u)) * env;
}

/** The height field of `folds`: max of the ridges plus min of the valleys. */
export function foldField(folds: readonly Fold[]): FoldField {
  const cs = folds.map(compile).filter((c): c is Compiled => c !== null);
  const bound = (sign: number, slope: number): number =>
    Math.max(
      0,
      ...cs
        .filter((c) => Math.sign(c.amp) === sign)
        // Across: |amp| · max|φ'| / width; along: the fade's 1.5 / ramp (the arc length at the
        // nearest point moves at most 1:1 with p for paths gentler than their width).
        // A widening fold: its narrowest width, plus the profile sliding as the width changes.
        .map((c) => {
          const ramp = Math.min(c.fin || Infinity, c.fout || Infinity);
          const w = Math.min(c.width, c.width + c.dw * c.total);
          const across = (slope * (1 + Math.abs(c.dw))) / w;
          return Math.abs(c.amp) * (across + (Number.isFinite(ramp) ? 1.5 / ramp : 0));
        }),
    );
  return {
    lipschitz: 1.2 * (bound(1, 1.54) + bound(-1, 1.72)),
    peak: Math.max(0, ...cs.map((c) => Math.abs(c.amp))),
    h: (p) => {
      let up = 0;
      let down = 0;
      for (const c of cs) {
        const w = weight(c, p[0], p[1], p[2]);
        if (w === 0) continue;
        const v = c.amp * w;
        if (v > up) up = v;
        else if (v < down) down = v;
      }
      return up + down;
    },
  };
}
