// Inside/outside of every node of a regular grid against a closed-enough triangle mesh, by ray
// parity along each axis (every grid column along X, Y and Z crossed with the triangles, the
// crossings sorted, nodes between an odd and an even crossing inside) and a majority vote of the
// three axes, so one leaky column (a pinhole, a cap seam) cannot flip a region. Used by
// mesh-field.ts where a flood fill from outside would leak through any gap in the band and turn
// a head into a thin shell. Deterministic.

import type { Mesh } from '@developerz.ai/ts23d';

export interface GridSpec {
  readonly origin: readonly [number, number, number];
  readonly cell: number;
  readonly n: readonly [number, number, number];
}

/** 1 where a node is inside the mesh by at least two of the three axis parities. */
export function insideVotes(m: Mesh, g: GridSpec): Uint8Array {
  const [nx, ny, nz] = g.n;
  const votes = new Uint8Array(nx * ny * nz);
  for (let axis = 0; axis < 3; axis++) parity(m, g, axis, votes);
  for (let i = 0; i < votes.length; i++) votes[i] = (votes[i] ?? 0) >= 2 ? 1 : 0;
  return votes;
}

/** Adds 1 to `votes` at every node inside by parity along `axis`. */
function parity(m: Mesh, g: GridSpec, axis: number, votes: Uint8Array): void {
  const P = m.positions;
  const T = m.indices;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const [nx, ny, nz] = g.n;
  const n = [nx, ny, nz];
  const nu = n[u] ?? 1;
  const nv = n[v] ?? 1;
  const na = n[axis] ?? 1;
  const o = g.origin;
  const h = g.cell;
  const hits = new Map<number, number[]>();
  for (let t = 0; t < T.length; t += 3) {
    const a = (T[t] ?? 0) * 3;
    const b = (T[t + 1] ?? 0) * 3;
    const c = (T[t + 2] ?? 0) * 3;
    // Triangle in column coordinates (u, v in cells) and its depth along the axis.
    const au = ((P[a + u] ?? 0) - (o[u] ?? 0)) / h;
    const av = ((P[a + v] ?? 0) - (o[v] ?? 0)) / h;
    const bu = ((P[b + u] ?? 0) - (o[u] ?? 0)) / h;
    const bv = ((P[b + v] ?? 0) - (o[v] ?? 0)) / h;
    const cu = ((P[c + u] ?? 0) - (o[u] ?? 0)) / h;
    const cv = ((P[c + v] ?? 0) - (o[v] ?? 0)) / h;
    const det = (bu - au) * (cv - av) - (cu - au) * (bv - av);
    if (det === 0) continue;
    const i0 = Math.max(0, Math.ceil(Math.min(au, bu, cu)));
    const i1 = Math.min(nu - 1, Math.floor(Math.max(au, bu, cu)));
    const j0 = Math.max(0, Math.ceil(Math.min(av, bv, cv)));
    const j1 = Math.min(nv - 1, Math.floor(Math.max(av, bv, cv)));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const w1 = ((i - au) * (cv - av) - (cu - au) * (j - av)) / det;
        const w2 = ((bu - au) * (j - av) - (i - au) * (bv - av)) / det;
        const w0 = 1 - w1 - w2;
        // A column exactly on a shared edge may count twice: that column's parity flips, and the
        // three-axis vote outweighs it.
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * (P[a + axis] ?? 0) + w1 * (P[b + axis] ?? 0) + w2 * (P[c + axis] ?? 0);
        const key = j * nu + i;
        const list = hits.get(key);
        const k = (depth - (o[axis] ?? 0)) / h;
        if (list) list.push(k);
        else hits.set(key, [k]);
      }
  }
  const stride = [1, nx, nx * ny];
  const su = stride[u] ?? 1;
  const sv = stride[v] ?? 1;
  const sa = stride[axis] ?? 1;
  for (const [key, list] of hits) {
    if (list.length < 2) continue;
    list.sort((p, q) => p - q);
    const i = key % nu;
    const j = Math.floor(key / nu);
    const base = i * su + j * sv;
    for (let s = 0; s + 1 < list.length; s += 2) {
      const k0 = Math.max(0, Math.ceil(list[s] ?? 0));
      const k1 = Math.min(na - 1, Math.floor(list[s + 1] ?? 0));
      for (let k = k0; k <= k1; k++) votes[base + k * sa] = (votes[base + k * sa] ?? 0) + 1;
    }
  }
}

/**
 * Marks inside every outside node the grid's boundary cannot reach through open space: the closed
 * voids of a mesh and the ones sealed by a slit narrower than `gap` (a closed mouth's oral cavity
 * behind its lip line), which would otherwise mesh as hidden inner walls. The flood runs through
 * outside nodes farther than `gap` from the surface (`dist`, unsigned), then grows two nodes into
 * the skin's own thin outside shell. Only for a grid whose boundary is outside (the whole mesh).
 */
export function fillVoids(
  votes: Uint8Array,
  n: readonly [number, number, number],
  dist: Float32Array,
  gap: number,
): void {
  const [nx, ny, nz] = n;
  const size = votes.length;
  // 0 unseen · 1 reached through open space · 2 grown into the skin's thin outside shell.
  const seen = new Uint8Array(size);
  const queue = new Int32Array(size);
  let tail = 0;
  const open = (at: number): boolean => Math.abs(dist[at] ?? Infinity) > gap;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) {
          const at = (k * ny + j) * nx + i;
          if (!votes[at]) {
            seen[at] = 1;
            queue[tail++] = at;
          }
        }
  // Breadth-first: open nodes spread the flood, shell nodes take ring numbers 1, 2 and stop.
  const ring = new Uint8Array(size);
  for (let head = 0; head < tail; head++) {
    const at = queue[head] ?? 0;
    const r = ring[at] ?? 0;
    if (r >= 2) continue;
    const i = at % nx;
    const j = Math.floor(at / nx) % ny;
    const k = Math.floor(at / (nx * ny));
    for (let e = 0; e < 6; e++) {
      const ok =
        e === 0
          ? i > 0
          : e === 1
            ? i < nx - 1
            : e === 2
              ? j > 0
              : e === 3
                ? j < ny - 1
                : e === 4
                  ? k > 0
                  : k < nz - 1;
      if (!ok) continue;
      const b =
        at +
        (e === 0 ? -1 : e === 1 ? 1 : e === 2 ? -nx : e === 3 ? nx : e === 4 ? -nx * ny : nx * ny);
      if (seen[b] || votes[b]) continue;
      seen[b] = 1;
      // Through open space the ring resets; into the shell it counts up.
      ring[b] = open(b) && r === 0 ? 0 : r + 1;
      queue[tail++] = b;
    }
  }
  for (let at = 0; at < size; at++) if (!seen[at] && !votes[at]) votes[at] = 1;
}
