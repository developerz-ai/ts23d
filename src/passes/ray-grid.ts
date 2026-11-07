// Ray casting for bakes: triangles bucketed in a uniform 3D grid (CSR, typed arrays), walked
// with Amanatides–Woo DDA, tested with Möller–Trumbore. Answers "does this ray hit anything
// within `tMax`?" — all an occlusion bake needs. Allocation-free per ray, deterministic.

import { boundsOf, type Mesh, type Vec3 } from '../core/index.ts';

const CELL_SCALE = 0.3;

export class RayGrid {
  private readonly tri: Float64Array;
  /** Per triangle: v0, e1 = v1 − v0, e2 = v2 − v0 (Möller–Trumbore inputs, computed once). */
  private readonly edges: Float64Array;
  /** Per triangle: unnormalised plane normal e1 × e2 and its offset n·v0. */
  private readonly planes: Float64Array;
  private readonly start: Int32Array;
  private readonly list: Int32Array;
  private readonly min: Vec3;
  private readonly res: [number, number, number];
  private readonly cell: number;
  private readonly stamp: Int32Array;
  private ray = 0;

  constructor(mesh: Mesh) {
    const n = mesh.indices.length / 3;
    this.tri = new Float64Array(n * 9);
    for (let t = 0; t < n; t++)
      for (let v = 0; v < 3; v++) {
        const i = (mesh.indices[t * 3 + v] ?? 0) * 3;
        for (let k = 0; k < 3; k++) this.tri[t * 9 + v * 3 + k] = mesh.positions[i + k] ?? 0;
      }
    this.edges = new Float64Array(n * 9);
    for (let t = 0; t < n; t++) {
      const o = t * 9;
      for (let k = 0; k < 3; k++) {
        const v0 = this.tri[o + k] ?? 0;
        this.edges[o + k] = v0;
        this.edges[o + 3 + k] = (this.tri[o + 3 + k] ?? 0) - v0;
        this.edges[o + 6 + k] = (this.tri[o + 6 + k] ?? 0) - v0;
      }
    }
    this.planes = new Float64Array(n * 4);
    for (let t = 0; t < n; t++) {
      const E = this.edges;
      const o = t * 9;
      const [ax, ay, az] = [E[o + 3] ?? 0, E[o + 4] ?? 0, E[o + 5] ?? 0];
      const [bx, by, bz] = [E[o + 6] ?? 0, E[o + 7] ?? 0, E[o + 8] ?? 0];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      this.planes.set(
        [nx, ny, nz, nx * (E[o] ?? 0) + ny * (E[o + 1] ?? 0) + nz * (E[o + 2] ?? 0)],
        t * 4,
      );
    }
    const b = boundsOf(mesh);
    const span = [0, 1, 2].map((k) => Math.max(1e-6, (b.max[k] ?? 0) - (b.min[k] ?? 0)));
    // Cells ~0.3× the "two triangles per cell if they filled the volume" size: triangles live
    // on surfaces, so that size leaves a dozen per occupied cell. Measured on tiger_1 and a
    // sculpted head (0.2–0.5 is flat; larger cells cost 2–4×). Bounded to 256 per axis and
    // ~4M cells overall. Any cell size gives the same answers; only the speed changes.
    const vol = (span[0] ?? 1) * (span[1] ?? 1) * (span[2] ?? 1);
    this.cell = Math.max(
      CELL_SCALE * Math.cbrt(vol / Math.max(1, n / 2)),
      Math.max(...span) / 256,
      Math.cbrt(vol / 4e6),
      1e-4,
    );
    this.min = [b.min[0] - 1e-6, b.min[1] - 1e-6, b.min[2] - 1e-6];
    this.res = [0, 1, 2].map((k) => Math.max(1, Math.ceil((span[k] ?? 0) / this.cell) + 1)) as [
      number,
      number,
      number,
    ];
    const [rx, ry] = this.res;
    const cells = rx * ry * this.res[2];
    // Each triangle's cell box once, then a counting pass and a fill pass (CSR, t ascending).
    const box = new Int32Array(n * 6);
    const T = this.tri;
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 3; k++) {
        const a = T[t * 9 + k] ?? 0;
        const b2 = T[t * 9 + 3 + k] ?? 0;
        const c = T[t * 9 + 6 + k] ?? 0;
        box[t * 6 + k] = this.coord(Math.min(a, b2, c), k);
        box[t * 6 + 3 + k] = this.coord(Math.max(a, b2, c), k);
      }
    const count = new Int32Array(cells + 1);
    const visit = (t: number, f: (c: number) => void): void => {
      const o = t * 6;
      for (let x = box[o] ?? 0; x <= (box[o + 3] ?? 0); x++)
        for (let y = box[o + 1] ?? 0; y <= (box[o + 4] ?? 0); y++)
          for (let z = box[o + 2] ?? 0; z <= (box[o + 5] ?? 0); z++) f((z * ry + y) * rx + x);
    };
    const bump = (c: number): void => {
      count[c + 1] = (count[c + 1] ?? 0) + 1;
    };
    for (let t = 0; t < n; t++) visit(t, bump);
    for (let c = 0; c < cells; c++) count[c + 1] = (count[c + 1] ?? 0) + (count[c] ?? 0);
    this.start = count;
    const list = new Int32Array(count[cells] ?? 0);
    const fill = new Int32Array(cells);
    for (let t = 0; t < n; t++)
      visit(t, (c) => {
        list[(count[c] ?? 0) + (fill[c] ?? 0)] = t;
        fill[c] = (fill[c] ?? 0) + 1;
      });
    this.list = list;
    this.stamp = new Int32Array(n);
  }

  private coord(v: number, k: number): number {
    const r = this.res[k as 0 | 1 | 2];
    return Math.min(
      r - 1,
      Math.max(0, Math.floor((v - (this.min[k as 0 | 1 | 2] ?? 0)) / this.cell)),
    );
  }

  /** Any hit of the ray o + t·d (d unit) for 0 < t ≤ tMax. Scalar arguments: no allocation. */
  hit(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    tMax: number,
  ): boolean {
    const q = ++this.ray;
    const start = this.start;
    const list = this.list;
    const stamp = this.stamp;
    const size = this.cell;
    const [rx, ry, rz] = this.res;
    const [mx, my, mz] = this.min;
    let cx = this.coord(ox, 0);
    let cy = this.coord(oy, 1);
    let cz = this.coord(oz, 2);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    let nx = Math.abs(dx) < 1e-12 ? Infinity : (mx + (cx + (dx > 0 ? 1 : 0)) * size - ox) / dx;
    let ny = Math.abs(dy) < 1e-12 ? Infinity : (my + (cy + (dy > 0 ? 1 : 0)) * size - oy) / dy;
    let nz = Math.abs(dz) < 1e-12 ? Infinity : (mz + (cz + (dz > 0 ? 1 : 0)) * size - oz) / dz;
    const ddx = Math.abs(dx) < 1e-12 ? Infinity : size / Math.abs(dx);
    const ddy = Math.abs(dy) < 1e-12 ? Infinity : size / Math.abs(dy);
    const ddz = Math.abs(dz) < 1e-12 ? Infinity : size / Math.abs(dz);
    let t = 0;
    while (t <= tMax) {
      const c = (cz * ry + cy) * rx + cx;
      const end = start[c + 1] ?? 0;
      for (let i = start[c] ?? 0; i < end; i++) {
        const tri = list[i] ?? 0;
        if (stamp[tri] === q) continue;
        stamp[tri] = q;
        if (this.test(tri, ox, oy, oz, dx, dy, dz, tMax)) return true;
      }
      if (nx < ny) {
        if (nx < nz) {
          t = nx;
          cx += sx;
          if (cx < 0 || cx >= rx) return false;
          nx = t + ddx;
        } else {
          t = nz;
          cz += sz;
          if (cz < 0 || cz >= rz) return false;
          nz = t + ddz;
        }
      } else if (ny < nz) {
        t = ny;
        cy += sy;
        if (cy < 0 || cy >= ry) return false;
        ny = t + ddy;
      } else {
        t = nz;
        cz += sz;
        if (cz < 0 || cz >= rz) return false;
        nz = t + ddz;
      }
    }
    return false;
  }

  /** Möller–Trumbore on cached v0, e1, e2 (the same arithmetic as deriving them per ray). */
  private test(
    tri: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    tMax: number,
  ): boolean {
    // Plane pre-reject: the hit distance along the ray, from two dot products. Only clear misses
    // (behind the origin, or past tMax, with margin) are skipped; Möller–Trumbore decides the rest.
    const P = this.planes;
    const f = tri * 4;
    const nx = P[f] ?? 0;
    const ny = P[f + 1] ?? 0;
    const nz = P[f + 2] ?? 0;
    const th0 = ((P[f + 3] ?? 0) - (nx * ox + ny * oy + nz * oz)) / (nx * dx + ny * dy + nz * dz);
    if (!(th0 > -1e-9 && th0 <= tMax * (1 + 1e-9) + 1e-9)) return false;
    const E = this.edges;
    const b = tri * 9;
    const e1x = E[b + 3] ?? 0;
    const e1y = E[b + 4] ?? 0;
    const e1z = E[b + 5] ?? 0;
    const e2x = E[b + 6] ?? 0;
    const e2y = E[b + 7] ?? 0;
    const e2z = E[b + 8] ?? 0;
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-14) return false;
    const inv = 1 / det;
    const tx = ox - (E[b] ?? 0);
    const ty = oy - (E[b + 1] ?? 0);
    const tz = oz - (E[b + 2] ?? 0);
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return false;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return false;
    const th = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return th > 0 && th <= tMax;
  }

  /** True if the ray o + t·d (d unit) hits any triangle for 0 < t ≤ tMax. */
  occluded(o: Vec3, d: Vec3, tMax: number): boolean {
    return this.hit(o[0], o[1], o[2], d[0], d[1], d[2], tMax);
  }
}
