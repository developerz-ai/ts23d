// Union occupancy of overlapping solids by ray-interval integration: a grid of +Z rays through
// the shells' footprint; per ray every crossing (exact top-left rule via orient2d, so a watertight
// mesh is crossed exactly once per surface) updates that shell's winding; a point is solid when
// ANY shell winds around it. Open shells use their own crossings where a ray balances, their convex
// hull where it falls through a hole. Only the CORRECTION to the closed shells' exact integrals is
// sampled: per interval (densest covering shell) − Σ (closed shell ρ · |winding|), so overlaps are
// removed once and open shells added, while the bulk keeps exact moments. Deterministic.

import { orient2d, type Vec3 } from '../core/index.ts';
import { emptyMoments, type Moments } from './moments.ts';

export type Tri = readonly [Vec3, Vec3, Vec3];

export interface RasterShell {
  readonly tris: readonly Tri[];
  readonly rho: number;
  /** Open shells: the closed stand-in for rays that fall through a hole. Absent = closed shell. */
  readonly hull?: readonly Tri[];
}

/** Add to the exact sum of the CLOSED shells' moments/volumes to get the union. */
export interface UnionCorrection {
  readonly moments: Moments;
  /** m³; negative where closed shells overlap, positive for open shells' fill. */
  readonly volume: number;
  /** First-order estimate of |error| in `volume` (m³): correction jumps between neighbouring rays. */
  readonly error: number;
}

/** Grid density: at most this many cells across the larger footprint side (fewer for light
 * meshes: ~4·√triangles, at least 48), never finer than the minimum cell (m). */
export const OCCUPANCY_CELLS = 160;
export const OCCUPANCY_MIN_CELL = 0.004;

interface Prepared {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly cx: number;
  readonly cy: number;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  /** +1 entering (normal faces −Z), −1 leaving; already CCW-normalised in xy. */
  readonly dir: number;
  /** Shell index; `src + n` marks the shell's hull stand-in. */
  readonly src: number;
}

/** Rasterisation top-left rule for a CCW edge a→b: owns the points exactly on it. */
const ownsEdge = (ax: number, ay: number, bx: number, by: number): boolean =>
  by < ay || (by === ay && bx < ax);

function covers(t: Prepared, x: number, y: number): boolean {
  const e = (ax: number, ay: number, bx: number, by: number): boolean => {
    // Axis-parallel edges (most of hard-surface kit) have an exact sign without the predicate.
    const o =
      ax === bx
        ? Math.sign(ax - x) * Math.sign(by - ay)
        : ay === by
          ? Math.sign(ay - y) * Math.sign(ax - bx)
          : orient2d(ax, ay, bx, by, x, y);
    return o > 0 || (o === 0 && ownsEdge(ax, ay, bx, by));
  };
  return e(t.ax, t.ay, t.bx, t.by) && e(t.bx, t.by, t.cx, t.cy) && e(t.cx, t.cy, t.ax, t.ay);
}

function zAt(t: Prepared, x: number, y: number): number {
  const d = (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax);
  const u = ((t.bx - x) * (t.cy - y) - (t.by - y) * (t.cx - x)) / d;
  const v = ((t.cx - x) * (t.ay - y) - (t.cy - y) * (t.ax - x)) / d;
  return u * t.a[2] + v * t.b[2] + (1 - u - v) * t.c[2];
}

function prepare(tri: Tri, src: number): Prepared | null {
  const [p, q, r] = tri;
  // Axis-aligned walls (common, and exactly degenerate) skip the exact predicate's slow path.
  if ((p[0] === q[0] && q[0] === r[0]) || (p[1] === q[1] && q[1] === r[1])) return null;
  const o = orient2d(p[0], p[1], q[0], q[1], r[0], r[1]);
  if (o === 0) return null; // edge-on to every +Z ray
  const [a, b, c] = o > 0 ? [p, q, r] : [p, r, q];
  return {
    ax: a[0],
    ay: a[1],
    bx: b[0],
    by: b[1],
    cx: c[0],
    cy: c[1],
    a,
    b,
    c,
    dir: o > 0 ? -1 : 1,
    src,
  };
}

interface Grid {
  readonly x0: number;
  readonly y0: number;
  readonly hx: number;
  readonly hy: number;
  readonly nx: number;
  readonly ny: number;
}

function gridOf(tris: readonly Prepared[], cells: number, minCell: number): Grid {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of tris)
    for (const [x, y] of [
      [t.ax, t.ay],
      [t.bx, t.by],
      [t.cx, t.cy],
    ] as const) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const h = Math.max(minCell, Math.max(x1 - x0, y1 - y0) / cells);
  const nx = Math.max(1, Math.ceil((x1 - x0) / h));
  const ny = Math.max(1, Math.ceil((y1 - y0) / h));
  return { x0, y0, hx: (x1 - x0) / nx || h, hy: (y1 - y0) / ny || h, nx, ny };
}

/** Triangles per ray column (CSR), each listed in every column its xy bounds can reach. */
function binned(tris: readonly Prepared[], g: Grid): { start: Uint32Array; items: Uint32Array } {
  const span = (t: Prepared): [number, number, number, number] => {
    const lo = (v: number, o: number, h: number): number =>
      Math.max(0, Math.ceil((v - o) / h - 0.5));
    const hi = (v: number, o: number, h: number, n: number): number =>
      Math.min(n - 1, Math.floor((v - o) / h - 0.5));
    return [
      lo(Math.min(t.ax, t.bx, t.cx), g.x0, g.hx),
      hi(Math.max(t.ax, t.bx, t.cx), g.x0, g.hx, g.nx),
      lo(Math.min(t.ay, t.by, t.cy), g.y0, g.hy),
      hi(Math.max(t.ay, t.by, t.cy), g.y0, g.hy, g.ny),
    ];
  };
  const start = new Uint32Array(g.nx * g.ny + 1);
  const spans = tris.map(span);
  for (const [i0, i1, j0, j1] of spans)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) start[j * g.nx + i + 1] = (start[j * g.nx + i + 1] ?? 0) + 1;
  for (let k = 1; k < start.length; k++) start[k] = (start[k] ?? 0) + (start[k - 1] ?? 0);
  const fill = start.slice(0, -1);
  const items = new Uint32Array(start[start.length - 1] ?? 0);
  spans.forEach(([i0, i1, j0, j1], ti) => {
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const at = fill[j * g.nx + i] ?? 0;
        items[at] = ti;
        fill[j * g.nx + i] = at + 1;
      }
  });
  return { start, items };
}

function addInterval(
  m: Moments,
  x: number,
  y: number,
  z0: number,
  z1: number,
  rho: number,
  g: Grid,
): void {
  const A = g.hx * g.hy;
  const dm = rho * A * (z1 - z0);
  const fz = (rho * A * (z1 * z1 - z0 * z0)) / 2;
  const sz = (rho * A * (z1 ** 3 - z0 ** 3)) / 3;
  m.mass += dm;
  m.first[0] += x * dm;
  m.first[1] += y * dm;
  m.first[2] += fz;
  const s = m.second;
  s[0] += x * x * dm + (dm * g.hx * g.hx) / 12;
  s[4] += y * y * dm + (dm * g.hy * g.hy) / 12;
  s[8] += sz;
  s[1] += x * y * dm;
  s[3] += x * y * dm;
  s[2] += x * fz;
  s[6] += x * fz;
  s[5] += y * fz;
  s[7] += y * fz;
}

/** Union of `shells` minus the exact sum of the closed ones, integrated along +Z rays. */
export function unionCorrection(
  shells: readonly RasterShell[],
  cells = OCCUPANCY_CELLS,
  minCell = OCCUPANCY_MIN_CELL,
): UnionCorrection {
  const n = shells.length;
  const tris: Prepared[] = [];
  shells.forEach((s, i) => {
    for (const t of s.tris) {
      const p = prepare(t, i);
      if (p) tris.push(p);
    }
    for (const t of s.hull ?? []) {
      const p = prepare(t, i + n);
      if (p) tris.push(p);
    }
  });
  const moments = emptyMoments();
  if (tris.length === 0) return { moments, volume: 0, error: 0 };
  const g = gridOf(
    tris,
    Math.min(cells, Math.max(48, Math.round(4 * Math.sqrt(tris.length)))),
    minCell,
  );
  const { start, items } = binned(tris, g);
  const thick = new Float64Array(g.nx * g.ny);
  const balance = new Int32Array(2 * n);
  const wind = new Int32Array(2 * n);
  const hits: { z: number; src: number; dir: number }[] = [];
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const cell = j * g.nx + i;
      const [k0, k1] = [start[cell] ?? 0, start[cell + 1] ?? 0];
      if (k0 === k1) continue;
      const x = g.x0 + (i + 0.5) * g.hx;
      const y = g.y0 + (j + 0.5) * g.hy;
      hits.length = 0;
      for (let k = k0; k < k1; k++) {
        const t = tris[items[k] ?? 0];
        if (t && covers(t, x, y)) hits.push({ z: zAt(t, x, y), src: t.src, dir: t.dir });
      }
      if (hits.length === 0) continue;
      hits.sort((a, b) => a.z - b.z || a.src - b.src || a.dir - b.dir);
      for (const h of hits) balance[h.src] = (balance[h.src] ?? 0) + h.dir;
      // A shell's own crossings when they balance; its hull's when the ray fell through a hole.
      const use = (src: number): boolean =>
        src < n ? !shells[src]?.hull || balance[src] === 0 : balance[src - n] !== 0;
      const active: number[] = [];
      let len = 0;
      let prev = 0;
      for (const h of hits) {
        if (!use(h.src)) continue;
        if (active.length > 0 && h.z > prev) {
          let rho = 0;
          let closedRho = 0;
          let closedDepth = 0;
          for (const s of active) {
            const sh = shells[s % n];
            rho = Math.max(rho, sh?.rho ?? 0);
            if (s < n && !sh?.hull) {
              const w = Math.abs(wind[s] ?? 0);
              closedRho += w * (sh?.rho ?? 0);
              closedDepth += w;
            }
          }
          if (rho !== closedRho) addInterval(moments, x, y, prev, h.z, rho - closedRho, g);
          len += (1 - closedDepth) * (h.z - prev);
        }
        const was = wind[h.src] ?? 0;
        const now = was + h.dir;
        wind[h.src] = now;
        if (was === 0) active.push(h.src);
        else if (now === 0) active.splice(active.indexOf(h.src), 1);
        prev = h.z;
      }
      for (const s of active) wind[s] = 0;
      for (const h of hits) balance[h.src] = 0;
      thick[cell] = len;
    }
  let volume = 0;
  let error = 0;
  const A = g.hx * g.hy;
  // Midpoint-rule error lives where the sampled thickness jumps: half a cell per jump.
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      const l = thick[k] ?? 0;
      volume += l * A;
      const right = i + 1 < g.nx ? (thick[k + 1] ?? 0) : 0;
      const up = j + 1 < g.ny ? (thick[k + g.nx] ?? 0) : 0;
      error += (Math.abs(l - right) + Math.abs(l - up)) * (A / 2);
      if (i === 0) error += Math.abs(l) * (A / 2);
      if (j === 0) error += Math.abs(l) * (A / 2);
    }
  return { moments, volume, error };
}
