// Ray casting for the mesh assertions: triangles bucketed in a uniform grid, a ray walks the grid
// in half-cell segments and tests each segment's cells (Möller–Trumbore), so outward-facing and
// wall-thickness probes cost a neighbourhood, not the whole mesh. Deterministic, allocation-light.

import type { Mesh, Vec3 } from '../core/index.ts';

const key = (x: number, y: number, z: number): number =>
  ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;

export interface Hit {
  readonly t: number;
  readonly tri: number;
}

export class RayGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly tri: Float64Array;
  private readonly cell: number;
  private readonly lo: Vec3;
  private readonly hi: Vec3;
  private readonly stamp: Int32Array;
  private query = 0;

  constructor(mesh: Mesh) {
    const n = mesh.indices.length / 3;
    this.tri = new Float64Array(n * 9);
    this.stamp = new Int32Array(n);
    // Bounds of the indexed triangles (a shell may index a subset of a shared vertex buffer).
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const i of mesh.indices)
      for (let k = 0; k < 3; k++) {
        const v = mesh.positions[i * 3 + k] ?? 0;
        if (v < (lo[k] ?? Infinity)) lo[k] = v;
        if (v > (hi[k] ?? -Infinity)) hi[k] = v;
      }
    this.lo = lo;
    this.hi = hi;
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    // About two cells per axis per cube-root triangle: small meshes walk a few cells, big ones 64.
    this.cell = Math.max(diag / Math.min(64, Math.max(2, 2 * Math.cbrt(n))), 1e-3);
    for (let t = 0; t < n; t++) {
      for (let v = 0; v < 3; v++) {
        const i = mesh.indices[t * 3 + v] ?? 0;
        for (let k = 0; k < 3; k++) this.tri[t * 9 + v * 3 + k] = mesh.positions[i * 3 + k] ?? 0;
      }
      const T = this.tri;
      const o = t * 9;
      const c = (k: number, f: (...x: number[]) => number): number =>
        Math.floor(f(T[o + k] ?? 0, T[o + 3 + k] ?? 0, T[o + 6 + k] ?? 0) / this.cell);
      for (let x = c(0, Math.min); x <= c(0, Math.max); x++)
        for (let y = c(1, Math.min); y <= c(1, Math.max); y++)
          for (let z = c(2, Math.min); z <= c(2, Math.max); z++) {
            const k = key(x, y, z);
            const list = this.cells.get(k);
            if (list) list.push(t);
            else this.cells.set(k, [t]);
          }
    }
  }

  /** Every hit along origin + t·dir (t > tMin, dir unit), excluding triangle `skip`, sorted by t. */
  cast(origin: Vec3, dir: Vec3, skip = -1, tMin = 1e-6): Hit[] {
    const q = ++this.query;
    const hits: Hit[] = [];
    const tMax = this.exit(origin, dir);
    const step = this.cell / 2;
    const C = this.cell;
    for (let s = 0; s <= tMax; s += step) {
      const e = Math.min(s + step, tMax);
      const a = [0, 1, 2].map((k) => (origin[k] ?? 0) + (dir[k] ?? 0) * s);
      const b = [0, 1, 2].map((k) => (origin[k] ?? 0) + (dir[k] ?? 0) * e);
      const lo = [0, 1, 2].map((k) => Math.floor(Math.min(a[k] ?? 0, b[k] ?? 0) / C));
      const hi = [0, 1, 2].map((k) => Math.floor(Math.max(a[k] ?? 0, b[k] ?? 0) / C));
      for (let x = lo[0] ?? 0; x <= (hi[0] ?? 0); x++)
        for (let y = lo[1] ?? 0; y <= (hi[1] ?? 0); y++)
          for (let z = lo[2] ?? 0; z <= (hi[2] ?? 0); z++)
            for (const t of this.cells.get(key(x, y, z)) ?? []) {
              if (t === skip || this.stamp[t] === q) continue;
              this.stamp[t] = q;
              const d = this.hit(t, origin, dir);
              if (d > tMin) hits.push({ t: d, tri: t });
            }
      if (e >= tMax) break;
    }
    return hits.sort((x, y) => x.t - y.t || x.tri - y.tri);
  }

  /** Ray parameter where it leaves the mesh bounds (plus a cell of slack): the nearest far slab. */
  private exit(o: Vec3, d: Vec3): number {
    let t = Infinity;
    for (let k = 0; k < 3; k++) {
      const dk = d[k] ?? 0;
      if (Math.abs(dk) < 1e-12) continue;
      const bound = dk > 0 ? (this.hi[k] ?? 0) + this.cell : (this.lo[k] ?? 0) - this.cell;
      t = Math.min(t, (bound - (o[k] ?? 0)) / dk);
    }
    return Number.isFinite(t) ? Math.max(0, t) : 0;
  }

  /** Möller–Trumbore: ray parameter of the hit on triangle t, or −1. Two-sided. */
  private hit(t: number, o: Vec3, d: Vec3): number {
    const T = this.tri;
    const i = t * 9;
    const ax = T[i] ?? 0;
    const ay = T[i + 1] ?? 0;
    const az = T[i + 2] ?? 0;
    const e1x = (T[i + 3] ?? 0) - ax;
    const e1y = (T[i + 4] ?? 0) - ay;
    const e1z = (T[i + 5] ?? 0) - az;
    const e2x = (T[i + 6] ?? 0) - ax;
    const e2y = (T[i + 7] ?? 0) - ay;
    const e2z = (T[i + 8] ?? 0) - az;
    const px = d[1] * e2z - d[2] * e2y;
    const py = d[2] * e2x - d[0] * e2z;
    const pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-14) return -1;
    const inv = 1 / det;
    const sx = o[0] - ax;
    const sy = o[1] - ay;
    const sz = o[2] - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }
}
