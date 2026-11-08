// Runs a track belt round its loop: every vertex of a `tread` part is bound once to the nearest
// point of the belt centre line (`extras.ts23d.tread.path`, node-local, Z up) as an offset in that
// point's frame (along, out, across), then re-posed at any distance travelled. Pure math, no three.

type V3 = readonly [number, number, number];

/** The closed centre line, resampled evenly so a distance maps to a sample in O(1). */
class Loop {
  readonly n: number;
  readonly step: number;
  readonly length: number;
  readonly p: Float64Array;
  readonly t: Float64Array;
  /** Unit normal of the belt plane (the wheels' spin axis). */
  readonly b: V3;

  constructor(path: readonly (readonly number[])[]) {
    let pts = path.map((q): V3 => [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0]);
    // Drive forward = the ground run moves back (−X) relative to the hull: run that way at +s.
    const low = pts.reduce((best, q, i) => (q[2] < (pts[best]?.[2] ?? 0) ? i : best), 0);
    const nx = pts[(low + 1) % pts.length] ?? pts[low];
    const px = pts[(low + pts.length - 1) % pts.length] ?? pts[low];
    if (nx && px && nx[0] - px[0] > 0) pts = [...pts].reverse();
    const seg = pts.map((a, i) => dist(a, pts[(i + 1) % pts.length] ?? a));
    this.length = seg.reduce((s, l) => s + l, 0);
    this.n = Math.max(64, Math.ceil(this.length / 0.01));
    this.step = this.length / this.n;
    this.p = new Float64Array(this.n * 3);
    this.t = new Float64Array(this.n * 3);
    let i = 0;
    let acc = 0;
    for (let k = 0; k < this.n; k++) {
      const d = k * this.step;
      while (acc + (seg[i] ?? 0) < d && i < pts.length - 1) acc += seg[i++] ?? 0;
      const a = pts[i] ?? [0, 0, 0];
      const c = pts[(i + 1) % pts.length] ?? a;
      const f = (d - acc) / (seg[i] || 1);
      for (let j = 0; j < 3; j++) this.p[k * 3 + j] = (a[j] ?? 0) + ((c[j] ?? 0) - (a[j] ?? 0)) * f;
    }
    // Tangents by central difference: smooth across the polyline's corners.
    for (let k = 0; k < this.n; k++) {
      const a = ((k + 1) % this.n) * 3;
      const c = ((k + this.n - 1) % this.n) * 3;
      const d: V3 = [
        (this.p[a] ?? 0) - (this.p[c] ?? 0),
        (this.p[a + 1] ?? 0) - (this.p[c + 1] ?? 0),
        (this.p[a + 2] ?? 0) - (this.p[c + 2] ?? 0),
      ];
      const l = Math.hypot(...d) || 1;
      this.t.set([d[0] / l, d[1] / l, d[2] / l], k * 3);
    }
    // Newell's normal of the loop: the plane's normal whatever its orientation.
    const nn = [0, 0, 0];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k] ?? [0, 0, 0];
      const c = pts[(k + 1) % pts.length] ?? a;
      nn[0] = (nn[0] ?? 0) + (a[1] - c[1]) * (a[2] + c[2]);
      nn[1] = (nn[1] ?? 0) + (a[2] - c[2]) * (a[0] + c[0]);
      nn[2] = (nn[2] ?? 0) + (a[0] - c[0]) * (a[1] + c[1]);
    }
    const l = Math.hypot(nn[0] ?? 0, nn[1] ?? 0, nn[2] ?? 0) || 1;
    this.b = [(nn[0] ?? 0) / l, (nn[1] ?? 0) / l, (nn[2] ?? 1) / l];
  }

  /** Point and unit tangent at arc length `s` (any real; wraps). */
  frame(s: number, out: Float64Array): void {
    const f = ((((s % this.length) + this.length) % this.length) / this.step) % this.n;
    const i = Math.floor(f);
    const j = (i + 1) % this.n;
    const a = f - i;
    for (let k = 0; k < 3; k++) {
      out[k] = (this.p[i * 3 + k] ?? 0) * (1 - a) + (this.p[j * 3 + k] ?? 0) * a;
      out[3 + k] = (this.t[i * 3 + k] ?? 0) * (1 - a) + (this.t[j * 3 + k] ?? 0) * a;
    }
    const l = Math.hypot(out[3] ?? 0, out[4] ?? 0, out[5] ?? 0) || 1;
    for (let k = 3; k < 6; k++) out[k] = (out[k] ?? 0) / l;
  }
}

const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** One tread mesh's vertices bound to its loop. `pose(d)` writes positions/normals at distance d. */
export class TreadBelt {
  private readonly loop: Loop;
  private readonly s: Float64Array;
  private readonly off: Float64Array;
  private readonly nrm: Float64Array;
  private readonly f = new Float64Array(6);

  constructor(
    path: readonly (readonly number[])[],
    positions: ArrayLike<number>,
    normals: ArrayLike<number>,
  ) {
    const loop = new Loop(path);
    this.loop = loop;
    const count = Math.floor(positions.length / 3);
    this.s = new Float64Array(count);
    this.off = new Float64Array(count * 3);
    this.nrm = new Float64Array(count * 3);
    const coarse = 16;
    for (let v = 0; v < count; v++) {
      const q: V3 = [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
      const d2 = (k: number): number => {
        const m = (((k % loop.n) + loop.n) % loop.n) * 3;
        return (
          (q[0] - (loop.p[m] ?? 0)) ** 2 +
          (q[1] - (loop.p[m + 1] ?? 0)) ** 2 +
          (q[2] - (loop.p[m + 2] ?? 0)) ** 2
        );
      };
      // Coarse sweep, then refine around the best: the loop is dense (1 cm), meshes are big.
      let best = 0;
      for (let k = 0; k < loop.n; k += coarse) if (d2(k) < d2(best)) best = k;
      let fine = best;
      for (let k = best - coarse; k <= best + coarse; k++) if (d2(k) < d2(fine)) fine = k;
      const k = ((fine % loop.n) + loop.n) % loop.n;
      this.s[v] = k * loop.step;
      loop.frame(this.s[v] ?? 0, this.f);
      const r: V3 = [q[0] - (this.f[0] ?? 0), q[1] - (this.f[1] ?? 0), q[2] - (this.f[2] ?? 0)];
      const nv: V3 = [normals[v * 3] ?? 0, normals[v * 3 + 1] ?? 0, normals[v * 3 + 2] ?? 0];
      this.off.set(this.toFrame(r), v * 3);
      this.nrm.set(this.toFrame(nv), v * 3);
    }
  }

  /** Belt length: travelling this far brings every link back where it started. */
  get length(): number {
    return this.loop.length;
  }

  /** Vector → (along, out, across) in the frame currently in `this.f`. */
  private toFrame(r: V3): V3 {
    const t: V3 = [this.f[3] ?? 0, this.f[4] ?? 0, this.f[5] ?? 0];
    const b = this.loop.b;
    const n = cross(b, t);
    return [dot(r, t), dot(r, n), dot(r, b)];
  }

  /** Pose for `d` metres driven forward (negative = reverse) into the given xyz arrays. */
  pose(d: number, positions: { [i: number]: number }, normals: { [i: number]: number }): void {
    const b = this.loop.b;
    const f = this.f;
    for (let v = 0; v < this.s.length; v++) {
      this.loop.frame((this.s[v] ?? 0) + d, f);
      const t: V3 = [f[3] ?? 0, f[4] ?? 0, f[5] ?? 0];
      const n = cross(b, t);
      const u = this.off[v * 3] ?? 0;
      const o = this.off[v * 3 + 1] ?? 0;
      const w = this.off[v * 3 + 2] ?? 0;
      const nu = this.nrm[v * 3] ?? 0;
      const no = this.nrm[v * 3 + 1] ?? 0;
      const nw = this.nrm[v * 3 + 2] ?? 0;
      const x = v * 3;
      positions[x] = (f[0] ?? 0) + u * t[0] + o * n[0] + w * b[0];
      positions[x + 1] = (f[1] ?? 0) + u * t[1] + o * n[1] + w * b[1];
      positions[x + 2] = (f[2] ?? 0) + u * t[2] + o * n[2] + w * b[2];
      normals[x] = nu * t[0] + no * n[0] + nw * b[0];
      normals[x + 1] = nu * t[1] + no * n[1] + nw * b[1];
      normals[x + 2] = nu * t[2] + no * n[2] + nw * b[2];
    }
  }
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
