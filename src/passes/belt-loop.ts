// A track belt's closed centre line as a ruler: resampled evenly (about 1 cm) so an arc length
// maps to a point and a tangent in O(1), with the loop's plane normal (the wheels' axle direction).
// The winding is the path's own: +s runs the way the points were given. Pure maths, shared by the
// exporter (tread morph targets), the `treads` gate and the gallery's runtime belt.

import { dmath } from '../core/index.ts';

type V3 = readonly [number, number, number];

const dist = (a: V3, b: V3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class BeltLoop {
  /** Samples round the loop. */
  readonly n: number;
  /** Arc length between two samples, metres. */
  readonly step: number;
  /** Length of the whole loop, metres. */
  readonly length: number;
  /** Sample points, xyz per sample. */
  readonly p: Float64Array;
  /** Unit tangents, xyz per sample. */
  readonly t: Float64Array;
  /** Unit normal of the belt plane, right-handed about the path's winding. */
  readonly normal: V3;

  constructor(path: readonly (readonly number[])[]) {
    const pts = path.map((q): V3 => [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0]);
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
      const l = dmath.norm(d) || 1;
      this.t.set([d[0] / l, d[1] / l, d[2] / l], k * 3);
    }
    // Newell's normal of the loop: the plane's normal whatever its orientation.
    const nn: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k] ?? [0, 0, 0];
      const c = pts[(k + 1) % pts.length] ?? a;
      nn[0] += (a[1] - c[1]) * (a[2] + c[2]);
      nn[1] += (a[2] - c[2]) * (a[0] + c[0]);
      nn[2] += (a[0] - c[0]) * (a[1] + c[1]);
    }
    const l = dmath.norm(nn);
    this.normal = l > 0 ? [nn[0] / l, nn[1] / l, nn[2] / l] : [0, 0, 1];
  }

  /** Point (out[0..2]) and unit tangent (out[3..5]) at arc length `s` (any real; wraps). */
  frame(s: number, out: Float64Array): void {
    const f = ((((s % this.length) + this.length) % this.length) / this.step) % this.n;
    const i = Math.floor(f);
    const j = (i + 1) % this.n;
    const a = f - i;
    for (let k = 0; k < 3; k++) {
      out[k] = (this.p[i * 3 + k] ?? 0) * (1 - a) + (this.p[j * 3 + k] ?? 0) * a;
      out[3 + k] = (this.t[i * 3 + k] ?? 0) * (1 - a) + (this.t[j * 3 + k] ?? 0) * a;
    }
    const l = dmath.hypot(out[3] ?? 0, out[4] ?? 0, out[5] ?? 0) || 1;
    for (let k = 3; k < 6; k++) out[k] = (out[k] ?? 0) / l;
  }

  /** Arc length of the sample nearest `q`: a coarse sweep, then a look round the best. */
  nearest(q: V3): number {
    const d2 = (k: number): number => {
      const m = (((k % this.n) + this.n) % this.n) * 3;
      return (
        dmath.pow(q[0] - (this.p[m] ?? 0), 2) +
        dmath.pow(q[1] - (this.p[m + 1] ?? 0), 2) +
        dmath.pow(q[2] - (this.p[m + 2] ?? 0), 2)
      );
    };
    const coarse = 16;
    let best = 0;
    for (let k = 0; k < this.n; k += coarse) if (d2(k) < d2(best)) best = k;
    let fine = best;
    for (let k = best - coarse; k <= best + coarse; k++) if (d2(k) < d2(fine)) fine = k;
    return (((fine % this.n) + this.n) % this.n) * this.step;
  }
}
