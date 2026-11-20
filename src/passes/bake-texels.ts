// The texel walk every high → low bake shares: rasterise the low mesh's UV layout (closed edges,
// first triangle wins a texel, triangles in index order) and hand each covered texel its surface
// frame — point, unit normal, unit tangent and bitangent from the given per-vertex tangents
// (glTF VEC4: B = cross(N, T)·w points toward decreasing v), plus triangle and barycentrics.
// One frame object is reused: copy what you keep. Deterministic: fixed texel and triangle order.

import type { Mesh } from '../core/index.ts';
import { dmath } from '../core/index.ts';

export interface TexelFrame {
  /** Texel index (y · size + x). */
  i: number;
  tri: number;
  /** Barycentrics of the triangle's three corners. */
  readonly w: Float64Array;
  readonly p: Float64Array;
  readonly n: Float64Array;
  readonly t: Float64Array;
  readonly b: Float64Array;
}

/** Interpolate attribute `a` (stride k) of corners (i0, i1, i2) into out[0..k). */
function lerp(a: Float32Array, k: number, c: Int32Array, w: Float64Array, out: Float64Array) {
  for (let j = 0; j < k; j++)
    out[j] =
      (a[(c[0] ?? 0) * k + j] ?? 0) * (w[0] ?? 0) +
      (a[(c[1] ?? 0) * k + j] ?? 0) * (w[1] ?? 0) +
      (a[(c[2] ?? 0) * k + j] ?? 0) * (w[2] ?? 0);
}

function unit(v: Float64Array): void {
  const l = dmath.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) || 1;
  v[0] = (v[0] ?? 0) / l;
  v[1] = (v[1] ?? 0) / l;
  v[2] = (v[2] ?? 0) / l;
}

/** Walk every covered texel of `low` at `size`²; returns the coverage mask (1 = covered). */
export function walkTexels(
  low: Mesh,
  size: number,
  tangents: Float32Array,
  visit: (f: TexelFrame) => void,
): Uint8Array {
  const S = size;
  const covered = new Uint8Array(S * S);
  const f: TexelFrame = {
    i: 0,
    tri: 0,
    w: new Float64Array(3),
    p: new Float64Array(3),
    n: new Float64Array(3),
    t: new Float64Array(3),
    b: new Float64Array(3),
  };
  const c = new Int32Array(3);
  const t4 = new Float64Array(4);
  const U = low.uvs;
  for (let tri = 0; tri < low.indices.length / 3; tri++) {
    c[0] = low.indices[tri * 3] ?? 0;
    c[1] = low.indices[tri * 3 + 1] ?? 0;
    c[2] = low.indices[tri * 3 + 2] ?? 0;
    const ax = (U[(c[0] ?? 0) * 2] ?? 0) * S;
    const ay = (U[(c[0] ?? 0) * 2 + 1] ?? 0) * S;
    const bx = (U[(c[1] ?? 0) * 2] ?? 0) * S;
    const by = (U[(c[1] ?? 0) * 2 + 1] ?? 0) * S;
    const cx = (U[(c[2] ?? 0) * 2] ?? 0) * S;
    const cy = (U[(c[2] ?? 0) * 2 + 1] ?? 0) * S;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
        const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const i = y * S + x;
        if (covered[i]) continue;
        covered[i] = 1;
        f.i = i;
        f.tri = tri;
        f.w[0] = w0;
        f.w[1] = w1;
        f.w[2] = w2;
        lerp(low.positions, 3, c, f.w, f.p);
        lerp(low.normals, 3, c, f.w, f.n);
        unit(f.n);
        lerp(tangents, 4, c, f.w, t4);
        const d =
          (t4[0] ?? 0) * (f.n[0] ?? 0) +
          (t4[1] ?? 0) * (f.n[1] ?? 0) +
          (t4[2] ?? 0) * (f.n[2] ?? 0);
        for (let k = 0; k < 3; k++) f.t[k] = (t4[k] ?? 0) - (f.n[k] ?? 0) * d;
        unit(f.t);
        const hand = (tangents[(c[0] ?? 0) * 4 + 3] ?? 1) < 0 ? -1 : 1;
        const [nx, ny, nz] = [f.n[0] ?? 0, f.n[1] ?? 0, f.n[2] ?? 0];
        const [tx, ty, tz] = [f.t[0] ?? 0, f.t[1] ?? 0, f.t[2] ?? 0];
        f.b[0] = (ny * tz - nz * ty) * hand;
        f.b[1] = (nz * tx - nx * tz) * hand;
        f.b[2] = (nx * ty - ny * tx) * hand;
        visit(f);
      }
  }
  return covered;
}

/** Grow covered texels into empty ones `steps` times (4-neighbour mean of `channels` floats). */
export function dilateTexels(
  img: Float32Array | Uint8Array,
  channels: number,
  filled: Uint8Array,
  size: number,
  steps: number,
): void {
  const S = size;
  const add: number[] = [];
  const sum = new Float64Array(channels);
  for (let s = 0; s < steps; s++) {
    add.length = 0;
    for (let t = 0; t < S * S; t++) {
      if (filled[t]) continue;
      const x = t % S;
      const y = (t - x) / S;
      let n = 0;
      sum.fill(0);
      for (const j of [
        x + 1 < S ? t + 1 : -1,
        x > 0 ? t - 1 : -1,
        y + 1 < S ? t + S : -1,
        y > 0 ? t - S : -1,
      ]) {
        if (j < 0 || !filled[j]) continue;
        for (let k = 0; k < channels; k++) sum[k] = (sum[k] ?? 0) + (img[j * channels + k] ?? 0);
        n++;
      }
      if (!n) continue;
      add.push(t);
      for (let k = 0; k < channels; k++) add.push((sum[k] ?? 0) / n);
    }
    if (!add.length) break;
    const integer = img instanceof Uint8Array;
    for (let a = 0; a < add.length; a += channels + 1) {
      const t = add[a] ?? 0;
      for (let k = 0; k < channels; k++) {
        const v = add[a + 1 + k] ?? 0;
        img[t * channels + k] = integer ? Math.round(v) : v;
      }
      filled[t] = 1;
    }
  }
}
