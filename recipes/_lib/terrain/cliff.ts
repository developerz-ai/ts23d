// Weathering on steep terrain and the river's banks, shared by the terrain tiles (mountain_range,
// real_valley). All of it is per-vertex colour on the welded surface, sized to read at hero
// distance (tens of metres):
// - water streaks: dark bands down every cliff. A 2D noise in plan (x, y) barely changes down a
//   steep face (the plan position moves little while the height drops fast), so its bands run
//   straight down the fall line: streaks for free, no flow tracing.
// - strata: horizontal light/dark bedding by altitude on the steep faces, wobbled in plan.
// - tone: large pale and dark patches (fresh exfoliation scars against weathered rock).
// - banks: a pale gravel strip either side of the river, so the channel reads from far away.

import type { Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

const ramp = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

export interface CliffWear {
  /** Plan noise in about [−1, 1] (an fbm of gradient noise). */
  readonly noise: (x: number, y: number) => number;
  /** Rise over run where a face counts as cliff: wear fades in from `steep[0]` to `steep[1]`. */
  readonly steep: readonly [number, number];
  /** Streak colour, width of a streak band (m) and how dark it gets (0..1). */
  readonly streak: { readonly color: Vec3; readonly width: number; readonly amount: number };
  /** Bedding: band thickness (m) and value swing (± fraction). */
  readonly strata?: { readonly thickness: number; readonly amount: number };
  /** Exfoliation tone: pale and dark rock, patch size (m). */
  readonly tone?: { readonly pale: Vec3; readonly dark: Vec3; readonly size: number };
}

/** `c` weathered at (x, y, z) on ground of rise-over-run `slope`; `bare` 0..1 (0 under snow). */
export function cliffWear(
  c: Vec3,
  x: number,
  y: number,
  z: number,
  slope: number,
  bare: number,
  o: CliffWear,
): Vec3 {
  const k = ramp(o.steep[0], o.steep[1], slope) * bare;
  if (k <= 0) return c;
  let out = c;
  if (o.tone) {
    const t = o.noise(x / o.tone.size + 31, y / o.tone.size - 17);
    out = mix(out, t > 0 ? o.tone.pale : o.tone.dark, Math.min(1, Math.abs(t) * 1.6) * 0.55 * k);
  }
  if (o.strata) {
    const wobble = 2.5 * o.noise(x / 500 + 9, y / 500 - 4);
    const b = dmath.sin((z / o.strata.thickness) * Math.PI * 2 + wobble);
    const v = 1 + o.strata.amount * b * k;
    out = [out[0] * v, out[1] * v, out[2] * v];
  }
  // Streaks: the bands of a fine plan noise, sharpened so each reads as a stripe.
  const s = o.noise(x / o.streak.width, y / o.streak.width);
  const w = ramp(0.05, 0.4, s) * o.streak.amount * k;
  out = mix(out, o.streak.color, w);
  return [Math.min(1, out[0]), Math.min(1, out[1]), Math.min(1, out[2])];
}

/** Distance from (x, y) to segment a–q. */
function segmentDistance(x: number, y: number, a: [number, number], q: [number, number]): number {
  const dx = q[0] - a[0];
  const dy = q[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
  return dmath.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}

/** A run of consecutive path segments [lo, hi) and its plan box; children split it in two. */
interface Run {
  readonly lo: number;
  readonly hi: number;
  readonly box: readonly [number, number, number, number];
  readonly kids?: readonly [Run, Run];
}

/** The path's segments as a tree of runs: a polyline's consecutive segments lie together. */
function runs(path: readonly [number, number][], lo: number, hi: number): Run {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = lo; i <= hi; i++) {
    const [x, y] = path[i] ?? [0, 0];
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const box = [x0, y0, x1, y1] as const;
  if (hi - lo <= 4) return { lo, hi, box };
  const mid = (lo + hi) >> 1;
  return { lo, hi, box, kids: [runs(path, lo, mid), runs(path, mid, hi)] };
}

/** Plan distance from (x, y) to a box (0 inside). */
const boxDistance = (x: number, y: number, b: Run['box']): number =>
  dmath.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));

/**
 * Plan distance from (x, y) to a polyline, m (∞ for an empty path). Built once per path, asked
 * once per ground vertex: the segments are held as a tree of runs and a query skips every run
 * whose box lies further than the nearest segment found so far, so it reads a few runs, not the
 * whole path. Exact: the same nearest segment and the same arithmetic as a scan of every segment.
 */
export function pathDistance(path: readonly [number, number][]): (x: number, y: number) => number {
  if (path.length === 0) return () => Infinity;
  const root = runs(path, 0, path.length - 1);
  const [x0, y0, x1, y1] = root.box;
  return (x, y) => {
    // Far outside the path's box: the box distance is a lower bound, good enough past the banks.
    const bx = Math.max(x0 - x, 0, x - x1);
    const by = Math.max(y0 - y, 0, y - y1);
    if (bx > 200 || by > 200) return dmath.hypot(bx, by);
    let best = Infinity;
    const visit = (r: Run): void => {
      if (!r.kids) {
        for (let i = r.lo; i < r.hi; i++)
          best = Math.min(best, segmentDistance(x, y, path[i] ?? [0, 0], path[i + 1] ?? [0, 0]));
        return;
      }
      // Nearer run first: its segments shrink `best`, so the other is often skipped.
      const [a, b] = r.kids;
      const [da, db] = [boxDistance(x, y, a.box), boxDistance(x, y, b.box)];
      const [n, f, df] = da <= db ? [a, b, db] : [b, a, da];
      if (Math.min(da, db) < best) visit(n);
      if (df < best) visit(f);
    };
    visit(root);
    return best;
  };
}

/** Gravel banks: `c` turned to `gravel` within `half` + `bank` m of the river's centre line. */
export function banks(c: Vec3, d: number, half: number, bank: number, gravel: Vec3): Vec3 {
  const k = 1 - ramp(half, half + bank, d);
  return k > 0 ? mix(c, gravel, k * 0.9) : c;
}
