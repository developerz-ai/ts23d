// The centre line of a limb the creature plan does not know (a wing arm and finger, a fin ray, an
// antenna), for the joints of an extra chain (model-extra.ts): the cheapest path through the
// mesh's solid from one point to another, on a grid of `cell` metres, where a step costs its
// length over the squared depth under the skin. Deep flesh is cheap and a thin membrane dear, so
// the path runs down the middle of the spars and never crosses air. Cells are tested as the
// search reaches them (winding number, distance to the surface). A step between two inside cells
// is taken only when the segment stays inside (D342): the balls of their depths cover it, else it
// is split and its midpoints tested, so a gap narrower than a cell between two solids is not
// crossed. Deterministic: fixed grid, fixed neighbour order, ties broken by cell index.

import { dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { triBvh } from '../primitives/index.ts';

export interface TraceOptions {
  /** Grid cell, metres: under half the thinnest spar the path should follow. */
  readonly cell: number;
  /** Margin round the box of the two ends the path may use, metres. Default 12 cells. */
  readonly pad?: number;
}

/** Grid cells one trace may hold: 16 bytes each (depth, cost, back), about 256 MiB (D343). */
const MAX_CELLS = 16777216 /* 2^24 */;
/** Segment pieces shorter than this many cells are not split further (gaps under it go unseen). */
const FINEST = 1 / 32;

const lost = (cause: string): Ts23dError =>
  new Ts23dError('T3D_MODEL_SKELETON', {
    cause: `tracePath: ${cause}`,
    fix: 'start and end the path on or in the limb (a surface point of its tip, a bone inside the body), with a cell under half its thickness',
  });

/** Binary min-heap of [cost, cell] pairs; equal costs pop the lower cell first. */
function heap(): { push(c: number, i: number): void; pop(): [number, number] | undefined } {
  const items: [number, number][] = [];
  const less = (a: [number, number], b: [number, number]): boolean =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const swap = (i: number, j: number): void => {
    const [a, b] = [items[i], items[j]];
    if (a && b) [items[i], items[j]] = [b, a];
  };
  return {
    push(c, i) {
      items.push([c, i]);
      for (let k = items.length - 1; k > 0; ) {
        const up = (k - 1) >> 1;
        const [a, b] = [items[k], items[up]];
        if (!a || !b || !less(a, b)) break;
        swap(k, up);
        k = up;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0 && last) {
        items[0] = last;
        for (let k = 0; ; ) {
          let low = k;
          for (const child of [2 * k + 1, 2 * k + 2]) {
            const [a, b] = [items[child], items[low]];
            if (a && b && less(a, b)) low = child;
          }
          if (low === k) break;
          swap(k, low);
          k = low;
        }
      }
      return top;
    },
  };
}

/**
 * Points from `from` to `to` through the inside of `mesh` (asset frame), about one per cell,
 * each deep in the limb it runs through. Either end may lie on or just off the surface: the
 * nearest inside cell within 6 cells stands in for it. No way through: T3D_MODEL_SKELETON.
 */
export function tracePath(mesh: Mesh, from: Vec3, to: Vec3, o: TraceOptions): Vec3[] {
  const pad = o.pad ?? o.cell * 12;
  if (!(Number.isFinite(o.cell) && o.cell > 0) || !(Number.isFinite(pad) && pad >= 0))
    throw new Ts23dError('T3D_MODEL_SKELETON', {
      cause: `tracePath: cell ${o.cell} m and pad ${pad} m must be a finite size (cell > 0, pad ≥ 0)`,
      fix: 'pass { cell: <under half the thinnest spar, metres> } and leave pad out or ≥ 0',
    });
  const org = [0, 1, 2].map((k) => Math.min(from[k] ?? 0, to[k] ?? 0) - pad);
  const dim = [0, 1, 2].map(
    (k) => Math.ceil((Math.abs((from[k] ?? 0) - (to[k] ?? 0)) + 2 * pad) / o.cell) + 1,
  ) as [number, number, number];
  const [nx, ny, nz] = dim;
  if (!(nx * ny * nz <= MAX_CELLS))
    throw new Ts23dError('T3D_MODEL_SKELETON', {
      cause: `tracePath: a ${nx}×${ny}×${nz} grid is ${(nx * ny * nz).toExponential(2)} cells, over the ${MAX_CELLS} one trace may allocate`,
      fix: `use a coarser cell (about ${(o.cell * dmath.cbrt((nx * ny * nz) / MAX_CELLS)).toPrecision(2)} m or more), a smaller pad, or trace the limb in pieces between closer points`,
    });
  const bvh = triBvh(mesh);
  const at = (i: number): Vec3 => [
    (org[0] ?? 0) + (i % nx) * o.cell,
    (org[1] ?? 0) + (Math.floor(i / nx) % ny) * o.cell,
    (org[2] ?? 0) + Math.floor(i / (nx * ny)) * o.cell,
  ];
  const q: [number, number, number] = [0, 0, 0];
  /** Distance to the skin of an inside point; −1 outside. */
  const inside = (p: Vec3): number => (bvh.winding(p) > 0.5 ? bvh.closest(p, q) : -1);
  // Distance to the skin per cell: NaN = not asked yet, < 0 = outside.
  const depth = new Float32Array(nx * ny * nz).fill(Number.NaN);
  const depthOf = (i: number): number => {
    if (Number.isNaN(depth[i] ?? 0)) depth[i] = inside(at(i));
    return depth[i] ?? -1;
  };
  /**
   * Whether the segment a→b (inside points `da`, `db` from the skin) stays inside: no surface lies
   * within `da` of a or `db` of b, so when they reach each other the balls cover it.
   */
  const through = (a: Vec3, da: number, b: Vec3, db: number, len: number): boolean => {
    if (len <= da + db) return true;
    if (len < o.cell * FINEST) return true;
    const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dm = inside(m);
    return dm >= 0 && through(a, da, m, dm, len / 2) && through(m, dm, b, db, len / 2);
  };
  const steps: [number, number, number][] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) steps.push([dx, dy, dz]);
  /** The inside cell nearest `p`, within `reach` cells. */
  const cellAt = (p: Vec3, what: string): number => {
    const c = [0, 1, 2].map((k) => Math.round(((p[k] ?? 0) - (org[k] ?? 0)) / o.cell));
    let [best, d] = [-1, Infinity];
    const reach = 6;
    for (let dz = -reach; dz <= reach; dz++)
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const [x, y, z] = [(c[0] ?? 0) + dx, (c[1] ?? 0) + dy, (c[2] ?? 0) + dz];
          const e = dx * dx + dy * dy + dz * dz;
          if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz || e >= d) continue;
          const i = x + nx * (y + ny * z);
          if (depthOf(i) >= 0) [best, d] = [i, e];
        }
    if (best < 0)
      throw lost(
        `no part of the mesh within ${reach} cells (${(reach * o.cell).toFixed(3)} m) of the ${what} point`,
      );
    return best;
  };
  const [start, goal] = [cellAt(from, 'first'), cellAt(to, 'last')];
  const cost = new Float64Array(depth.length).fill(Infinity);
  const back = new Int32Array(depth.length).fill(-1);
  const open = heap();
  cost[start] = 0;
  open.push(0, start);
  for (let top = open.pop(); top; top = open.pop()) {
    const [c, i] = top;
    if (i === goal) break;
    if (c > (cost[i] ?? Infinity)) continue;
    const [x, y, z] = [i % nx, Math.floor(i / nx) % ny, Math.floor(i / (nx * ny))];
    for (const [dx, dy, dz] of steps) {
      const [u, v, w] = [x + dx, y + dy, z + dz];
      if (u < 0 || v < 0 || w < 0 || u >= nx || v >= ny || w >= nz) continue;
      const j = u + nx * (v + ny * w);
      const d = depthOf(j);
      if (d < 0) continue;
      const len = dmath.hypot(dx, dy, dz) * o.cell;
      const di = depth[i] ?? 0;
      if (!through(at(i), di, at(j), d, len)) continue;
      const deep = Math.max(d, o.cell * 0.05);
      const next = c + len / (deep * deep);
      if (next < (cost[j] ?? Infinity)) {
        cost[j] = next;
        back[j] = i;
        open.push(next, j);
      }
    }
  }
  if (goal !== start && (back[goal] ?? -1) < 0)
    throw lost('the two points are not joined through the inside of the mesh');
  const path: Vec3[] = [];
  for (let i = goal; i >= 0; i = back[i] ?? -1) path.push(at(i));
  return path.reverse();
}
