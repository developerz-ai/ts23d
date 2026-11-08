// Closest-hit ray queries for high→low bakes: triangles in a uniform grid (CSR), walked with
// Amanatides–Woo DDA, tested with Möller–Trumbore, keeping the NEAREST hit and its barycentrics
// (RayGrid answers only "anything within tMax?", enough for occlusion, not for a normal bake).
// Deterministic: ties go to the lower triangle index.

import { boundsOf, type Mesh } from '../core/index.ts';

export interface Hit {
  tri: number;
  t: number;
  u: number;
  v: number;
}

export class HitGrid {
  private readonly P: Float64Array;
  private readonly start: Int32Array;
  private readonly list: Int32Array;
  private readonly min: [number, number, number];
  private readonly res: [number, number, number];
  private readonly cell: number;

  constructor(readonly mesh: Mesh) {
    const n = mesh.indices.length / 3;
    this.P = new Float64Array(n * 9);
    for (let t = 0; t < n; t++)
      for (let v = 0; v < 3; v++) {
        const i = (mesh.indices[t * 3 + v] ?? 0) * 3;
        for (let k = 0; k < 3; k++) this.P[t * 9 + v * 3 + k] = mesh.positions[i + k] ?? 0;
      }
    const b = boundsOf(mesh);
    const span = [0, 1, 2].map((k) => Math.max(1e-6, (b.max[k] ?? 0) - (b.min[k] ?? 0)));
    const vol = (span[0] ?? 1) * (span[1] ?? 1) * (span[2] ?? 1);
    this.cell = Math.max(0.3 * Math.cbrt(vol / Math.max(1, n / 2)), Math.max(...span) / 200);
    this.min = [b.min[0] - 1e-6, b.min[1] - 1e-6, b.min[2] - 1e-6];
    this.res = span.map((s) => Math.max(1, Math.ceil(s / this.cell) + 1)) as [
      number,
      number,
      number,
    ];
    const [rx, ry, rz] = this.res;
    const count = new Int32Array(rx * ry * rz + 1);
    const box = (t: number, k: number, hi: boolean): number => {
      const o = t * 9 + k;
      const a = this.P[o] ?? 0;
      const c = this.P[o + 3] ?? 0;
      const d = this.P[o + 6] ?? 0;
      return this.coord(hi ? Math.max(a, c, d) : Math.min(a, c, d), k);
    };
    const visit = (t: number, f: (c: number) => void): void => {
      for (let x = box(t, 0, false); x <= box(t, 0, true); x++)
        for (let y = box(t, 1, false); y <= box(t, 1, true); y++)
          for (let z = box(t, 2, false); z <= box(t, 2, true); z++) f((z * ry + y) * rx + x);
    };
    for (let t = 0; t < n; t++) visit(t, (c) => (count[c + 1] = (count[c + 1] ?? 0) + 1));
    for (let c = 0; c < rx * ry * rz; c++) count[c + 1] = (count[c + 1] ?? 0) + (count[c] ?? 0);
    this.start = count;
    this.list = new Int32Array(count[rx * ry * rz] ?? 0);
    const fill = new Int32Array(rx * ry * rz);
    for (let t = 0; t < n; t++)
      visit(t, (c) => {
        this.list[(count[c] ?? 0) + (fill[c] ?? 0)] = t;
        fill[c] = (fill[c] ?? 0) + 1;
      });
  }

  private coord(v: number, k: number): number {
    const r = this.res[k as 0 | 1 | 2];
    return Math.min(r - 1, Math.max(0, Math.floor((v - this.min[k as 0 | 1 | 2]) / this.cell)));
  }

  /** Nearest hit of o + t·d (d unit), 0 ≤ t ≤ tMax, either face side; false when none. */
  nearest(o: readonly number[], d: readonly number[], tMax: number, out: Hit): boolean {
    const [ox, oy, oz] = [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0];
    const [dx, dy, dz] = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    const [rx, ry] = this.res;
    let c = [this.coord(ox, 0), this.coord(oy, 1), this.coord(oz, 2)] as [number, number, number];
    const dir = [dx, dy, dz];
    const org = [ox, oy, oz];
    const step = dir.map((v) => (v > 0 ? 1 : -1));
    const next = dir.map((v, k) =>
      Math.abs(v) < 1e-12
        ? Infinity
        : (this.min[k as 0 | 1 | 2] + ((c[k] ?? 0) + (v > 0 ? 1 : 0)) * this.cell - (org[k] ?? 0)) /
          v,
    );
    const delta = dir.map((v) => (Math.abs(v) < 1e-12 ? Infinity : this.cell / Math.abs(v)));
    out.t = Infinity;
    out.tri = -1;
    let t = 0;
    while (t <= tMax) {
      const cell = (c[2] * ry + c[1]) * rx + c[0];
      for (let i = this.start[cell] ?? 0; i < (this.start[cell + 1] ?? 0); i++)
        this.test(this.list[i] ?? 0, ox, oy, oz, dx, dy, dz, Math.min(tMax, out.t), out);
      const k =
        (next[0] ?? 0) < (next[1] ?? 0)
          ? (next[0] ?? 0) < (next[2] ?? 0)
            ? 0
            : 2
          : (next[1] ?? 0) < (next[2] ?? 0)
            ? 1
            : 2;
      t = next[k] ?? Infinity;
      if (out.tri >= 0 && out.t <= t) return true;
      c = c.map((v, j) => (j === k ? v + (step[j] ?? 0) : v)) as [number, number, number];
      if ((c[k] ?? 0) < 0 || (c[k] ?? 0) >= this.res[k as 0 | 1 | 2]) break;
      next[k] = t + (delta[k] ?? Infinity);
    }
    return out.tri >= 0;
  }

  private test(
    tri: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    tMax: number,
    out: Hit,
  ): void {
    const P = this.P;
    const b = tri * 9;
    const e1x = (P[b + 3] ?? 0) - (P[b] ?? 0);
    const e1y = (P[b + 4] ?? 0) - (P[b + 1] ?? 0);
    const e1z = (P[b + 5] ?? 0) - (P[b + 2] ?? 0);
    const e2x = (P[b + 6] ?? 0) - (P[b] ?? 0);
    const e2y = (P[b + 7] ?? 0) - (P[b + 1] ?? 0);
    const e2z = (P[b + 8] ?? 0) - (P[b + 2] ?? 0);
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-18) return;
    const inv = 1 / det;
    const tx = ox - (P[b] ?? 0);
    const ty = oy - (P[b + 1] ?? 0);
    const tz = oz - (P[b + 2] ?? 0);
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) return;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) return;
    const th = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (th < 0 || th > tMax || th > out.t || (th === out.t && tri > out.tri)) return;
    out.t = th;
    out.tri = tri;
    out.u = u;
    out.v = v;
  }
}
