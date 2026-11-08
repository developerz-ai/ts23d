// Shape language from a silhouette contour: trace the outer boundary of the largest blob, simplify
// it (Douglas–Peucker), and measure its corners — acute spikes (aggressive), long straight edges
// (stable), or neither: soft rounds (friendly). Plus the taper of the outline.

import { type Mask, taper } from './critique-mask.ts';

export type ShapeClass = 'aggressive' | 'friendly' | 'stable';

export interface ShapeStats {
  /** Acute corners (interior < 70°) among convex corners (turn ≥ 45° outward). */
  readonly acuteShare: number;
  /** Share of the outline along its 4 dominant directions (see `straightShare`). */
  readonly straightShare: number;
  /** See `taper` in critique-mask.ts: + wide base, − top-heavy. */
  readonly taper: number;
  readonly shape: ShapeClass;
}

type P = readonly [number, number];
// Clockwise on screen (y down): E, SE, S, SW, W, NW, N, NE.
const DIRS: readonly P[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Moore-neighbour trace of the outer boundary of the blob holding the top-left-most pixel. */
export function contour(m: Mask): P[] {
  const { size, data } = m;
  const on = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && (data[y * size + x] ?? 0) >= 0.5;
  const s = data.findIndex((v) => v >= 0.5);
  if (s < 0) return [];
  const start: P = [s % size, Math.floor(s / size)];
  let cur = start;
  let back: P = [start[0] - 1, start[1]];
  const back0 = back;
  const out: P[] = [start];
  for (let step = 0; step < size * size * 4; step++) {
    const from = DIRS.findIndex((d) => cur[0] + d[0] === back[0] && cur[1] + d[1] === back[1]);
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = DIRS[(from + k) % 8] ?? [0, 0];
      const n: P = [cur[0] + d[0], cur[1] + d[1]];
      if (on(n[0], n[1])) {
        const pd = DIRS[(from + k - 1) % 8] ?? [0, 0];
        back = [cur[0] + pd[0], cur[1] + pd[1]];
        cur = n;
        moved = true;
        break;
      }
    }
    if (!moved) break; // a lone pixel
    if (cur[0] === start[0] && cur[1] === start[1] && back[0] === back0[0] && back[1] === back0[1])
      break;
    out.push(cur);
  }
  return out;
}

const segDist = (p: P, a: P, b: P): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  return l < 1e-9
    ? Math.hypot(p[0] - a[0], p[1] - a[1])
    : Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / l;
};

function dp(pts: readonly P[], i: number, j: number, eps: number, keep: Uint8Array): void {
  let best = -1;
  let far = 0;
  const a = pts[i] ?? [0, 0];
  const b = pts[j] ?? [0, 0];
  for (let k = i + 1; k < j; k++) {
    const d = segDist(pts[k] ?? [0, 0], a, b);
    if (d > far) {
      far = d;
      best = k;
    }
  }
  if (best < 0 || far <= eps) return;
  keep[best] = 1;
  dp(pts, i, best, eps, keep);
  dp(pts, best, j, eps, keep);
}

/** Closed-polygon Douglas–Peucker: split at the point farthest from the first, simplify halves. */
export function simplify(pts: readonly P[], eps: number): P[] {
  if (pts.length < 4) return [...pts];
  const p0 = pts[0] ?? [0, 0];
  let far = 0;
  pts.forEach((p, k) => {
    if (
      Math.hypot(p[0] - p0[0], p[1] - p0[1]) >
      Math.hypot((pts[far] ?? p0)[0] - p0[0], (pts[far] ?? p0)[1] - p0[1])
    )
      far = k;
  });
  const ring = [...pts, p0];
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[far] = 1;
  dp(ring, 0, far, eps, keep);
  dp(ring, far, ring.length - 1, eps, keep);
  return pts.filter((_, k) => keep[k] === 1);
}

/**
 * Share of the outline's length running along its four dominant directions (5° bins, mod 180°):
 * ~1 for boxes and prisms from any view, ~0.3 for discs and blobs whose edges turn evenly.
 */
function straightShare(poly: readonly P[]): number {
  const bins = new Float64Array(36);
  let total = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k] ?? [0, 0];
    const b = poly[(k + 1) % poly.length] ?? [0, 0];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const deg = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 180;
    const i = Math.min(35, Math.floor(deg / 5));
    bins[i] = (bins[i] ?? 0) + len;
    total += len;
  }
  const top = [...bins].sort((x, y) => y - x).slice(0, 4);
  return total ? top.reduce((s, v) => s + v, 0) / total : 0;
}

/** Shape statistics of one solid mask. */
export function shapeStats(m: Mask): Omit<ShapeStats, 'shape'> {
  const raw = contour(m);
  const poly = simplify(raw, Math.max(1, m.size / 100));
  const n = poly.length;
  let area = 0;
  for (let k = 0; k < n; k++) {
    const a = poly[k] ?? [0, 0];
    const b = poly[(k + 1) % n] ?? [0, 0];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const orient = Math.sign(area) || 1;
  let corners = 0;
  let acute = 0;
  for (let k = 0; k < n; k++) {
    const p = poly[(k + n - 1) % n] ?? [0, 0];
    const c = poly[k] ?? [0, 0];
    const q = poly[(k + 1) % n] ?? [0, 0];
    const e1: P = [c[0] - p[0], c[1] - p[1]];
    const e2: P = [q[0] - c[0], q[1] - c[1]];
    const turn = Math.atan2(e1[0] * e2[1] - e1[1] * e2[0], e1[0] * e2[0] + e1[1] * e2[1]);
    const deg = (Math.abs(turn) * 180) / Math.PI;
    if (deg >= 45 && Math.sign(turn) === orient) corners++;
    if (deg > 110 && Math.sign(turn) === orient) acute++;
  }
  return {
    acuteShare: corners ? acute / corners : 0,
    // Finer for directions: a coarse polygon turns a disc into a few parallel pairs.
    straightShare: straightShare(simplify(raw, Math.max(0.6, m.size / 170))),
    taper: taper(m),
  };
}

/** Thresholds of the classifier, calibrated on the committed gallery (see 16-art-as-text.md). */
export const SHAPE_THRESHOLDS = { acute: 0.3, acuteStrong: 0.45, straight: 0.5 } as const;

/**
 * Aggressive: mostly acute convex corners (≥ 0.45), or many (≥ 0.3) on an outline that is not
 * blocky. Stable: blocky (straight ≥ 0.5). Friendly: neither — soft, rounded turns.
 */
export function classifyShape(s: Omit<ShapeStats, 'shape'>): ShapeClass {
  const T = SHAPE_THRESHOLDS;
  const blocky = s.straightShare >= T.straight;
  if (s.acuteShare >= T.acuteStrong || (s.acuteShare >= T.acute && !blocky)) return 'aggressive';
  return blocky ? 'stable' : 'friendly';
}

/** Mean statistics over several views' masks, classified. */
export function shapeLanguageOf(masks: readonly Mask[]): ShapeStats {
  const all = masks.map(shapeStats);
  const mean = (k: 'acuteShare' | 'straightShare' | 'taper'): number =>
    all.reduce((s, v) => s + v[k], 0) / Math.max(1, all.length);
  const s = {
    acuteShare: mean('acuteShare'),
    straightShare: mean('straightShare'),
    taper: mean('taper'),
  };
  return { ...s, shape: classifyShape(s) };
}
