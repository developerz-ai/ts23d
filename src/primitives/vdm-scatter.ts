// Anchored VDM placement: Poisson-disk darts on the surface of a field (the block-out), each
// anchor projected onto f = 0 by Newton steps along ∇f, framed by the normal ∇f/|∇f| and an `up`
// from a flow callback (scale tips follow the flow: the hair-flow / bone-chain direction), thinned
// by a zone mask (density 0..1) and sized by a size mask. Darts come from `rng` (ctx.rng or a fork
// of it) inside `bounds`, or from caller `seeds` (e.g. a coarse mesh's vertices) — deterministic.

import type { Rng, Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { Field } from './sdf-ops.ts';
import type { VdmPlace } from './vdm.ts';

export interface StampScatterOptions {
  /** The surface to stamp: its zero set (negative inside), ~1-Lipschitz near the surface. */
  readonly field: Field;
  /** Box the darts are thrown in (and anchors must stay in). */
  readonly bounds: readonly [Vec3, Vec3];
  readonly rng: Rng;
  /** Footprint width of a stamp, metres. */
  readonly scale: number;
  /** Least distance between anchors, metres (× size). Default 0.8 × scale: footprints overlap. */
  readonly spacing?: number;
  /** Stamp depth, metres (× size). Default: the stamp's natural height. */
  readonly depth?: number;
  /** Stamp `up` at an anchor (tips point along it); made tangent by the stamp. */
  readonly flow?: (p: Vec3, n: Vec3) => Vec3;
  /** Density 0..1 at an anchor: the chance a dart there is kept (0 = no stamps in this zone). */
  readonly zone?: (p: Vec3) => number;
  /** Size multiplier at an anchor (scale, spacing and depth). Default 1. */
  readonly size?: (p: Vec3) => number;
  /** Dart start points instead of uniform darts in `bounds` (visited in a shuffled order). */
  readonly seeds?: readonly Vec3[];
  /** Darts thrown. Default 4000 (or every seed). */
  readonly attempts?: number;
  /** Stop after this many anchors. Default unlimited. */
  readonly max?: number;
  /**
   * Keep anchors whose outward normal is clear of other surface for this × the stamp's scale
   * (armpits, groin folds, a leg facing the chest): a stamp there would print through. Default
   * 0.5; 0 turns the check off.
   */
  readonly clearance?: number;
}

/** Project p onto f = 0 (≤ 4 Newton steps); the point and unit normal, or null if it misses. */
function project(f: Field, p0: Vec3, eps: number, tol: number): { p: Vec3; n: Vec3 } | null {
  let p: Vec3 = p0;
  for (let it = 0; it < 5; it++) {
    const d = f(p);
    const gx = f([p[0] + eps, p[1], p[2]]) - d;
    const gy = f([p[0], p[1] + eps, p[2]]) - d;
    const gz = f([p[0], p[1], p[2] + eps]) - d;
    const g2 = (gx * gx + gy * gy + gz * gz) / (eps * eps);
    if (!(g2 > 1e-8)) return null;
    const gl = Math.sqrt(g2);
    const n: Vec3 = [gx / eps / gl, gy / eps / gl, gz / eps / gl];
    if (Math.abs(d) < tol) return { p, n };
    p = [p[0] - (n[0] * d) / gl, p[1] - (n[1] * d) / gl, p[2] - (n[2] * d) / gl];
  }
  return null;
}

/** Is the ray from p along n free of other surface for `c` metres (the field keeps growing)? */
function clear(f: Field, p: Vec3, n: Vec3, c: number): boolean {
  for (const k of [0.25, 0.5, 0.75, 1])
    if (f([p[0] + n[0] * c * k, p[1] + n[1] * c * k, p[2] + n[2] * c * k]) < 0.7 * c * k)
      return false;
  return true;
}

export function scatterStamps(o: StampScatterOptions): VdmPlace[] {
  const [lo, hi] = o.bounds;
  if (!(o.scale > 0 && Number.isFinite(o.scale)))
    invalid(`scatterStamps scale is ${o.scale}`, 'give the footprint width in metres, > 0');
  if (![0, 1, 2].every((i) => (lo[i] ?? 0) < (hi[i] ?? 0)))
    invalid('scatterStamps bounds are not [min, max]', 'pass bounds: [[x0, y0, z0], [x1, y1, z1]]');
  const spacing = o.spacing ?? 0.8 * o.scale;
  if (!(spacing > 0)) invalid(`scatterStamps spacing is ${spacing}`, 'use spacing > 0 m');
  const eps = Math.min(1e-3, spacing * 0.02);
  const tol = spacing * 0.005;
  const seeds = o.seeds ? [...o.seeds] : null;
  if (seeds)
    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(o.rng.next() * (i + 1));
      const t = seeds[i] ?? [0, 0, 0];
      seeds[i] = seeds[j] ?? t;
      seeds[j] = t;
    }
  const attempts = seeds ? seeds.length : (o.attempts ?? 4000);
  const max = o.max ?? Number.POSITIVE_INFINITY;
  // Accepted anchors binned by `spacing`; the search widens with the largest size seen.
  const bins = new Map<string, number[]>();
  const placed: { at: Vec3; r: number }[] = [];
  let reach = 1;
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const cell = (v: number): number => Math.floor(v / spacing);
  const out: VdmPlace[] = [];
  for (let a = 0; a < attempts && out.length < max; a++) {
    const start: Vec3 = seeds?.[a] ?? [
      o.rng.range(lo[0], hi[0]),
      o.rng.range(lo[1], hi[1]),
      o.rng.range(lo[2], hi[2]),
    ];
    const keep = o.rng.next();
    const hit = project(o.field, start, eps, tol);
    if (!hit) continue;
    const p = hit.p;
    if (![0, 1, 2].every((i) => (p[i] ?? 0) >= (lo[i] ?? 0) && (p[i] ?? 0) <= (hi[i] ?? 0)))
      continue;
    if (o.zone && !(keep < o.zone(p))) continue;
    const s = o.size ? o.size(p) : 1;
    if (!(s > 0)) continue;
    const c = (o.clearance ?? 0.5) * o.scale * s;
    if (c > 0 && !clear(o.field, p, hit.n, c)) continue;
    const r = spacing * s;
    const [cx, cy, cz] = [cell(p[0]), cell(p[1]), cell(p[2])];
    const k = Math.ceil(Math.max(reach, s));
    let free = true;
    for (let z = cz - k; z <= cz + k && free; z++)
      for (let y = cy - k; y <= cy + k && free; y++)
        for (let x = cx - k; x <= cx + k && free; x++)
          for (const i of bins.get(key(x, y, z)) ?? []) {
            const q = placed[i];
            if (!q) continue;
            const lim = Math.max(r, q.r);
            if ((q.at[0] - p[0]) ** 2 + (q.at[1] - p[1]) ** 2 + (q.at[2] - p[2]) ** 2 < lim * lim) {
              free = false;
              break;
            }
          }
    if (!free) continue;
    reach = Math.max(reach, s);
    const kk = key(cx, cy, cz);
    const list = bins.get(kk);
    if (list) list.push(placed.length);
    else bins.set(kk, [placed.length]);
    placed.push({ at: p, r });
    const up = o.flow?.(p, hit.n);
    out.push({
      at: p,
      normal: hit.n,
      ...(up ? { up } : {}),
      scale: o.scale * s,
      ...(o.depth !== undefined ? { depth: o.depth * s } : {}),
    });
  }
  return out;
}
