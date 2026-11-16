// Unsigned distance to a triangle mesh on a brick grid, out to `band`: each triangle writes its
// exact distance into the points within one cell of it (every grid point near the surface gets a
// candidate), then a layer-by-layer propagation hands each point its neighbours' candidate
// triangles and keeps the closest exact distance (a closest-point transform). Cost ~ the band's
// volume, not triangles × band³. Points past the band read `band`. `signs`: the generalised
// winding number decides inside/outside — exactly for every point in the 2-cell shell, by one
// unanimous vote per connected region beyond it (the shell separates regions), and where a hole
// lets a region's votes disagree, per point from the nearest even-lattice point, which lies on
// the same side (it is < √3 cells away and the point is ≥ 2 cells from the surface).

import type { Vec3 } from '../core/index.ts';
import type { TriBvh } from './mesh-bvh.ts';
import { pointTriangle } from './triangle-queries.ts';

export function unsignedBand(
  pos: Float32Array,
  indices: Uint32Array,
  org: Vec3,
  dims: readonly [number, number, number],
  cell: number,
  band: number,
): Float32Array {
  const [nx, ny, nz] = dims;
  const total = nx * ny * nz;
  const nt = indices.length / 3;
  const tri = new Float64Array(nt * 9);
  for (let i = 0; i < nt * 3; i++)
    for (let a = 0; a < 3; a++) tri[i * 3 + a] = pos[(indices[i] ?? 0) * 3 + a] ?? 0;
  const dist = new Float32Array(total).fill(band);
  const near = new Int32Array(total).fill(-1);
  const px = (id: number): number => org[0] + (id % nx) * cell;
  const py = (id: number): number => org[1] + (Math.floor(id / nx) % ny) * cell;
  const pz = (id: number): number => org[2] + Math.floor(id / (nx * ny)) * cell;
  const test = (id: number, t: number): boolean => {
    // Compared as stored (float32): two near-equal candidates could otherwise swap forever, each
    // looking smaller than the other's rounded value (D56).
    const d = Math.fround(Math.sqrt(pointTriangle(px(id), py(id), pz(id), tri, t * 9, null)));
    if (d < (dist[id] ?? band) && d < band) {
      dist[id] = d;
      near[id] = t;
      return true;
    }
    return false;
  };
  for (let t = 0; t < nt; t++) {
    const r = [0, 1, 2].map((a) => {
      const xs = [tri[t * 9 + a] ?? 0, tri[t * 9 + 3 + a] ?? 0, tri[t * 9 + 6 + a] ?? 0];
      const o = org[a] ?? 0;
      const n = dims[a] ?? 1;
      return [
        Math.max(0, Math.floor((Math.min(...xs) - cell - o) / cell)),
        Math.min(n - 1, Math.ceil((Math.max(...xs) + cell - o) / cell)),
      ] as const;
    });
    const [[i0, i1], [j0, j1], [k0, k1]] = r as unknown as [
      [number, number],
      [number, number],
      [number, number],
    ];
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) test(i + nx * (j + ny * k), t);
  }
  let front: number[] = [];
  for (let id = 0; id < total; id++) if ((near[id] ?? -1) >= 0) front.push(id);
  const queued = new Uint8Array(total);
  while (front.length > 0) {
    const next: number[] = [];
    for (const id of front) {
      const t = near[id] ?? -1;
      const i = id % nx;
      const j = Math.floor(id / nx) % ny;
      const k = Math.floor(id / (nx * ny));
      const nb = [
        i > 0 ? id - 1 : -1,
        i < nx - 1 ? id + 1 : -1,
        j > 0 ? id - nx : -1,
        j < ny - 1 ? id + nx : -1,
        k > 0 ? id - nx * ny : -1,
        k < nz - 1 ? id + nx * ny : -1,
      ];
      for (const n of nb)
        if (n >= 0 && near[n] !== t && test(n, t) && !queued[n]) {
          queued[n] = 1;
          next.push(n);
        }
    }
    for (const id of next) queued[id] = 0;
    front = next;
  }
  return dist;
}

const neighbours = (id: number, nx: number, ny: number, nz: number): number[] => {
  const i = id % nx;
  const j = Math.floor(id / nx) % ny;
  const k = Math.floor(id / (nx * ny));
  return [
    i > 0 ? id - 1 : -1,
    i < nx - 1 ? id + 1 : -1,
    j > 0 ? id - nx : -1,
    j < ny - 1 ? id + nx : -1,
    k > 0 ? id - nx * ny : -1,
    k < nz - 1 ? id + nx * ny : -1,
  ];
};

/** −1 inside, +1 outside, per brick point. */
export function signs(
  bvh: TriBvh,
  dist: Float32Array,
  org: Vec3,
  dims: readonly [number, number, number],
  cell: number,
): Int8Array {
  const [nx, ny, nz] = dims;
  const total = nx * ny * nz;
  const ijk = (id: number): [number, number, number] => [
    id % nx,
    Math.floor(id / nx) % ny,
    Math.floor(id / (nx * ny)),
  ];
  const inside = (i: number, j: number, k: number): boolean =>
    bvh.winding([org[0] + i * cell, org[1] + j * cell, org[2] + k * cell]) > 0.5;
  const shell = cell * 2;
  const sign = new Int8Array(total);
  for (let id = 0; id < total; id++)
    if ((dist[id] ?? shell) < shell) sign[id] = inside(...ijk(id)) ? -1 : 1;
  const lattice = new Int8Array(total);
  const even = (c: number, n: number): number =>
    Math.min(n - 1 - ((n - 1) % 2), 2 * Math.round(c / 2));
  const byLattice = (id: number): number => {
    const [i, j, k] = ijk(id);
    const l = even(i, nx) + nx * (even(j, ny) + ny * even(k, nz));
    if (lattice[l] === 0) {
      const [li, lj, lk] = ijk(l);
      lattice[l] = inside(li, lj, lk) ? -1 : 1;
    }
    return lattice[l] ?? 1;
  };
  const queue = new Int32Array(total);
  for (let seed = 0; seed < total; seed++) {
    if (sign[seed] !== 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    sign[seed] = 2;
    while (head < tail)
      for (const n of neighbours(queue[head++] ?? 0, nx, ny, nz))
        if (n >= 0 && sign[n] === 0) {
          sign[n] = 2;
          queue[tail++] = n;
        }
    const picks = Math.min(7, tail);
    let votes = 0;
    for (let v = 0; v < picks; v++)
      votes += inside(...ijk(queue[Math.floor(((v + 0.5) * tail) / picks)] ?? 0)) ? 1 : -1;
    const unanimous = Math.abs(votes) === picks;
    for (let q = 0; q < tail; q++) {
      const id = queue[q] ?? 0;
      sign[id] = unanimous ? (votes > 0 ? -1 : 1) : byLattice(id);
    }
  }
  return sign;
}
