// Contact between two shells, measured on surfaces, not boxes: area-weighted samples of one shell
// tested against the other's triangle grid (distance) and solid index (embedded = inside). The
// patch area says whether two pieces are joined over a face or only kiss at a point or an edge.

import type { Bounds, Vec3 } from '../core/index.ts';
import type { Shell } from './connections-shells.ts';
import { probeOf } from './contact-probe.ts';
import { CONTACT_EPS } from './types.ts';

export interface Samples {
  /** xyz per sample. */
  readonly p: Float64Array;
  /** Face normal per sample (unit). */
  readonly n: Float64Array;
  /** Area each sample stands for, m². */
  readonly w: Float64Array;
  readonly count: number;
}

/** Characteristic thickness: 4·V/A for solids (a w×w beam → w, a ball of radius r → 4r/3),
 *  a tenth of √area for open sheets. */
export const thickness = (s: Shell): number =>
  s.solid && s.area > 0 ? (4 * s.volume) / s.area : Math.sqrt(s.area) / 10;

export const boxGap = (a: Shell, b: Shell): number =>
  Math.hypot(
    ...([0, 1, 2] as const).map((k) =>
      Math.max(0, a.bounds.min[k] - b.bounds.max[k], b.bounds.min[k] - a.bounds.max[k]),
    ),
  );

/** Sample step and contact tolerance for a piece, from its thickness. */
export const stepOf = (s: Shell): number => Math.min(0.05, Math.max(0.001, thickness(s) / 4));
export const epsOf = (s: Shell): number =>
  s.solid ? Math.min(0.005, Math.max(0.002, thickness(s) / 4)) : 0.003;

const overlaps = (lo: Vec3, hi: Vec3, b: Bounds, pad: number): boolean =>
  lo[0] <= b.max[0] + pad &&
  hi[0] >= b.min[0] - pad &&
  lo[1] <= b.max[1] + pad &&
  hi[1] >= b.min[1] - pad &&
  lo[2] <= b.max[2] + pad &&
  hi[2] >= b.min[2] - pad;

/** Samples of `s` on triangles inside `box` (+pad): each triangle cut into k² parts (k from `step`,
 *  at most `maxSplit`);
 *  above `cap` samples a fixed stride keeps every k-th one with its weight scaled (deterministic). */
export function samplesIn(
  s: Shell,
  box: Bounds | null,
  pad: number,
  step: number,
  cap = 2000,
  maxSplit = 4,
): Samples {
  const P = s.mesh.positions;
  const pts: number[] = [];
  const nrm: number[] = [];
  const wts: number[] = [];
  const tris = box
    ? probeOf(s).trianglesIn(
        [box.min[0] - pad, box.min[1] - pad, box.min[2] - pad],
        [box.max[0] + pad, box.max[1] + pad, box.max[2] + pad],
      )
    : null;
  const n = tris ? tris.length : P.length / 9;
  for (let ti = 0; ti < n; ti++) {
    const o = (tris ? (tris[ti] ?? 0) : ti) * 9;
    const a: Vec3 = [P[o] ?? 0, P[o + 1] ?? 0, P[o + 2] ?? 0];
    const b: Vec3 = [P[o + 3] ?? 0, P[o + 4] ?? 0, P[o + 5] ?? 0];
    const c: Vec3 = [P[o + 6] ?? 0, P[o + 7] ?? 0, P[o + 8] ?? 0];
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const x: Vec3 = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const len = Math.hypot(x[0], x[1], x[2]);
    if (len < 1e-14) continue;
    const longest = Math.max(
      Math.hypot(...u),
      Math.hypot(...v),
      Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]),
    );
    const k = Math.min(maxSplit, Math.max(1, Math.ceil(longest / step)));
    const w = len / 2 / (k * k);
    // Corners and edge midpoints weigh nothing (no area) but catch corner and edge contacts.
    for (const [fu, fv] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [0.5, 0],
      [0, 0.5],
      [0.5, 0.5],
    ] as const) {
      pts.push(
        a[0] + u[0] * fu + v[0] * fv,
        a[1] + u[1] * fu + v[1] * fv,
        a[2] + u[2] * fu + v[2] * fv,
      );
      nrm.push(x[0] / len, x[1] / len, x[2] / len);
      wts.push(0);
    }
    // Centroids of the k² sub-triangles of a regular split (upward and downward ones).
    for (let i = 0; i < k; i++)
      for (let j = 0; j + i < k; j++)
        for (const [di, dj] of j + i < k - 1
          ? [
              [1 / 3, 1 / 3],
              [2 / 3, 2 / 3],
            ]
          : [[1 / 3, 1 / 3]]) {
          const fu = (i + (di ?? 0)) / k;
          const fv = (j + (dj ?? 0)) / k;
          pts.push(
            a[0] + u[0] * fu + v[0] * fv,
            a[1] + u[1] * fu + v[1] * fv,
            a[2] + u[2] * fu + v[2] * fv,
          );
          nrm.push(x[0] / len, x[1] / len, x[2] / len);
          wts.push(w);
        }
  }
  const total = wts.length;
  const stride = Math.max(1, Math.ceil(total / cap));
  const count = Math.ceil(total / stride);
  const out = {
    p: new Float64Array(count * 3),
    n: new Float64Array(count * 3),
    w: new Float64Array(count),
    count,
  };
  for (let i = 0, j = 0; i < total; i += stride, j++) {
    for (let k = 0; k < 3; k++) {
      out.p[j * 3 + k] = pts[i * 3 + k] ?? 0;
      out.n[j * 3 + k] = nrm[i * 3 + k] ?? 0;
    }
    out.w[j] = (wts[i] ?? 0) * stride;
  }
  return out;
}

export interface Patch {
  /** Area of `a` within `eps` of `b`'s surface or inside `b`, m². */
  readonly area: number;
  /** Area of `a` inside `b` (embedded). */
  readonly buried: number;
  /** Facing area within `gap + max(1 mm, eps/4)`: the patch at a tight tolerance above the
   *  closest approach. */
  readonly tight: number;
  /** tight ÷ facing area within `gap + eps`: ≈ 1 for faces (flat or parallel), ≈ ½ for a line
   *  contact on a curve, ≈ ¼ for a point — how the patch grows with the tolerance. */
  readonly spread: number;
  /** Any sample within CONTACT_EPS (the floating-parts rule). */
  readonly touches: boolean;
  /** Closest sample distance (0 when embedded); Infinity beyond CONTACT_EPS. */
  readonly gap: number;
  /** Area-weighted centre of the patch (a's samples in contact); null when none. */
  readonly at: Vec3 | null;
  /** Where `a` comes closest to `b` (a sample of `a`); null when nothing is within reach. */
  readonly closest: Vec3 | null;
}

/** How `a` meets `b`, from `a`'s side. With `stopAt`, it returns as soon as the buried area
 *  reaches it or the flush area reaches three times it (the other figures are then partial). */
export function patch(a: Shell, b: Shell, eps: number, step: number, stopAt = Infinity): Patch {
  const reach = CONTACT_EPS;
  const S = samplesIn(a, b.bounds, reach, step);
  const q = probeOf(b);
  const dist = new Float64Array(S.count).fill(Infinity);
  let area = 0;
  let buried = 0;
  let gap = Infinity;
  let closest: Vec3 | null = null;
  let close = 0;
  const snug = Math.max(0.001, eps / 4);
  const at: [number, number, number] = [0, 0, 0];
  const p: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < S.count; i++) {
    p[0] = S.p[i * 3] ?? 0;
    p[1] = S.p[i * 3 + 1] ?? 0;
    p[2] = S.p[i * 3 + 2] ?? 0;
    if (!overlaps(p, p, b.bounds, reach)) continue;
    const w = S.w[i] ?? 0;
    const near = q.dist(p, reach);
    const inside = near > eps && q.inside(p);
    const d = inside ? 0 : near;
    dist[i] = d;
    if (d < gap) {
      gap = d;
      closest = [p[0], p[1], p[2]];
    }
    if (inside) buried += w;
    if (d <= eps) {
      area += w;
      for (const k of [0, 1, 2] as const) at[k] += p[k] * w;
    }
    if (d <= snug) close += w;
    // Embedded that deep, or flush over three times the need: the contact holds, stop sampling.
    if (buried >= stopAt || close >= 3 * stopAt) break;
  }
  // Spread over the samples that face the contact (their normal near the patch's mean normal):
  // a prism standing on its face has side walls whose bands would dilute a flat contact.
  const near = (i: number): boolean => (dist[i] ?? Infinity) <= gap + snug;
  const n0 = [0, 0, 0];
  let ref = -1;
  for (let i = 0; i < S.count; i++) {
    if (!near(i)) continue;
    if (ref < 0) ref = i;
    const sign =
      Math.sign(
        (S.n[i * 3] ?? 0) * (S.n[ref * 3] ?? 0) +
          (S.n[i * 3 + 1] ?? 0) * (S.n[ref * 3 + 1] ?? 0) +
          (S.n[i * 3 + 2] ?? 0) * (S.n[ref * 3 + 2] ?? 0),
      ) || 1;
    for (let k = 0; k < 3; k++) n0[k] = (n0[k] ?? 0) + (S.n[i * 3 + k] ?? 0) * (S.w[i] ?? 0) * sign;
  }
  const nl = Math.hypot(n0[0] ?? 0, n0[1] ?? 0, n0[2] ?? 0) || 1;
  let tight = 0;
  let loose = 0;
  for (let i = 0; i < S.count; i++) {
    const d = dist[i] ?? Infinity;
    if (d > gap + eps) continue;
    const facing =
      Math.abs(
        (S.n[i * 3] ?? 0) * (n0[0] ?? 0) +
          (S.n[i * 3 + 1] ?? 0) * (n0[1] ?? 0) +
          (S.n[i * 3 + 2] ?? 0) * (n0[2] ?? 0),
      ) / nl;
    if (facing < 0.7) continue;
    loose += S.w[i] ?? 0;
    if (d <= gap + snug) tight += S.w[i] ?? 0;
  }
  return {
    area,
    buried,
    tight,
    spread: loose > 0 ? tight / loose : 0,
    touches: gap <= CONTACT_EPS,
    gap,
    at: area > 0 ? [at[0] / area, at[1] / area, at[2] / area] : null,
    closest,
  };
}

/** A contact that holds: embedded over `need`, or touching over a patch of at least `need` at a
 *  tight tolerance (a ball on a floor or a corner on a wall makes a few mm², a face makes cm²). */
export const holds = (p: Patch, eps: number, need: number): boolean =>
  p.buried >= need || (p.gap <= eps && p.tight >= need);

export { Probe, probeOf } from './contact-probe.ts';
