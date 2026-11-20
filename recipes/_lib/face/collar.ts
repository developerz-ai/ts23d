// The face busts' collar as geometry: a rolled binding laid along the tunic's neckline on the
// skin. The tunic itself is paint on the skin mesh (./garment.ts), so its edge is only as smooth
// as the vertices it falls between: painted, the collar band was a stair-stepped zigzag along the
// shoulders. Here the neckline is found where it crosses the skin's edges, binned by angle round
// the neck's axis, smoothed into one closed curve and swept with a flattened round section that
// sits a third into the skin: a hem with a clean line at every LOD, covering the paint's edge.

import { dmath, type Mesh, MeshBuilder, type Vec3 } from '@developerz.ai/ts23d';

export interface CollarOptions {
  /** The neckline (> 0 skin, ≤ 0 cloth): the band is centred on its `centre` level. */
  readonly line: (p: Vec3) => number;
  /** The level of the line the band's middle follows, metres (negative: down onto the cloth). */
  readonly centre: number;
  /** The neck's axis (x) the curve is binned round, in the mesh's space (y = 0 on it). */
  readonly axisX: number;
  /** Half the band's width across the surface, and its height off it, metres. */
  readonly width: number;
  readonly thick: number;
  /** Samples round the neck and points round the section. */
  readonly segments: number;
  readonly sides: number;
  /** Colour along the band (t in 0 … 1 round the neck). */
  readonly color: (t: number) => Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const l = dmath.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The neckline's crossings of `skin`'s edges as a closed curve: `n` points and normals, one
 *  per angle bin round the axis (empty bins filled from their neighbours), smoothed. */
export function necklineCurve(
  skin: Mesh,
  o: Pick<CollarOptions, 'line' | 'centre' | 'axisX' | 'segments'>,
): { readonly p: Vec3[]; readonly n: Vec3[] } {
  const N = o.segments;
  const P = skin.positions;
  const Nm = skin.normals;
  const at = (v: number): Vec3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  const nAt = (v: number): Vec3 => [Nm[v * 3] ?? 0, Nm[v * 3 + 1] ?? 0, Nm[v * 3 + 2] ?? 0];
  const f = new Float64Array(P.length / 3);
  for (let v = 0; v < f.length; v++) f[v] = o.line(at(v)) - o.centre;
  const sum = new Float64Array(N * 6);
  const cnt = new Float64Array(N);
  const I = skin.indices;
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = I[t + e] ?? 0;
      const b = I[t + ((e + 1) % 3)] ?? 0;
      const fa = f[a] ?? 0;
      const fb = f[b] ?? 0;
      if (fa > 0 === fb > 0) continue;
      const k = fa / (fa - fb);
      const pa = at(a);
      const pb = at(b);
      const na = nAt(a);
      const nb = nAt(b);
      const q: Vec3 = [
        pa[0] + (pb[0] - pa[0]) * k,
        pa[1] + (pb[1] - pa[1]) * k,
        pa[2] + (pb[2] - pa[2]) * k,
      ];
      const ang = dmath.atan2(q[1], q[0] - o.axisX);
      const bin = Math.min(N - 1, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * N));
      for (let c = 0; c < 3; c++) {
        sum[bin * 6 + c] = (sum[bin * 6 + c] ?? 0) + (q[c] ?? 0);
        sum[bin * 6 + 3 + c] =
          (sum[bin * 6 + 3 + c] ?? 0) + (na[c] ?? 0) + ((nb[c] ?? 0) - (na[c] ?? 0)) * k;
      }
      cnt[bin] = (cnt[bin] ?? 0) + 1;
    }
  const full: number[] = [];
  for (let i = 0; i < N; i++) if ((cnt[i] ?? 0) > 0) full.push(i);
  if (full.length < 3) return { p: [], n: [] };
  let pts: number[][] = [];
  for (let i = 0; i < N; i++) {
    const c = cnt[i] ?? 0;
    if (c > 0) {
      pts.push([...Array(6).keys()].map((k) => (sum[i * 6 + k] ?? 0) / c));
      continue;
    }
    // An empty bin: between the nearest filled bins either side, round the loop.
    const next = full.find((j) => j > i) ?? (full[0] ?? 0) + N;
    const prevs = full.filter((j) => j < i);
    const prev = prevs.length ? (prevs[prevs.length - 1] ?? 0) : (full[full.length - 1] ?? 0) - N;
    const w = (i - prev) / (next - prev);
    const A = (j: number): number[] => {
      const m = ((j % N) + N) % N;
      const cm = cnt[m] ?? 1;
      return [...Array(6).keys()].map((k) => (sum[m * 6 + k] ?? 0) / cm);
    };
    const a = A(prev);
    const b = A(next);
    pts.push(a.map((x, k) => x + ((b[k] ?? 0) - x) * w));
  }
  // Smooth the curve (the crossings wander by a triangle's size, the neck's surface by more):
  // binomial passes, as many as reach about a twentieth of the way round.
  for (let pass = 0; pass < Math.round(N / 12); pass++)
    pts = pts.map((x, i) => {
      const a = pts[(i + N - 1) % N] ?? x;
      const b = pts[(i + 1) % N] ?? x;
      return x.map((v, k) => 0.25 * (a[k] ?? 0) + 0.5 * v + 0.25 * (b[k] ?? 0));
    });
  return {
    p: pts.map((x): Vec3 => [x[0] ?? 0, x[1] ?? 0, x[2] ?? 0]),
    n: pts.map((x): Vec3 => unit([x[3] ?? 0, x[4] ?? 0, x[5] ?? 0])),
  };
}

/** The collar: a closed, flattened tube along the neckline, a third of it sunk into the skin. */
export function collarBand(skin: Mesh, o: CollarOptions): Mesh | undefined {
  const { p, n } = necklineCurve(skin, o);
  const N = p.length;
  if (N < 3) return undefined;
  const S = o.sides;
  const mb = new MeshBuilder();
  for (let i = 0; i < N; i++) {
    const pi = p[i] ?? [0, 0, 0];
    const T = unit(sub(p[(i + 1) % N] ?? pi, p[(i + N - 1) % N] ?? pi));
    const B = unit(cross(T, n[i] ?? [0, 0, 1]));
    const U = unit(cross(B, T));
    const c: Vec3 = [
      pi[0] + U[0] * o.thick * 0.35,
      pi[1] + U[1] * o.thick * 0.35,
      pi[2] + U[2] * o.thick * 0.35,
    ];
    const color = o.color(i / N);
    for (let k = 0; k < S; k++) {
      const a = (k / S) * 2 * Math.PI;
      const cb = dmath.cos(a);
      const su = dmath.sin(a);
      const pos: Vec3 = [
        c[0] + B[0] * o.width * cb + U[0] * o.thick * su,
        c[1] + B[1] * o.width * cb + U[1] * o.thick * su,
        c[2] + B[2] * o.width * cb + U[2] * o.thick * su,
      ];
      const nrm = unit([
        (B[0] * cb) / o.width + (U[0] * su) / o.thick,
        (B[1] * cb) / o.width + (U[1] * su) / o.thick,
        (B[2] * cb) / o.width + (U[2] * su) / o.thick,
      ]);
      mb.vertex({ p: pos, n: nrm, uv: [0, 0], color });
    }
  }
  // (Winding: along +T and round +φ the face's normal is U at the section's top, outward.)
  for (let i = 0; i < N; i++)
    for (let k = 0; k < S; k++) {
      const v = (ii: number, kk: number): number => ((ii % N) * S + (kk % S)) | 0;
      mb.quad(v(i, k), v(i + 1, k), v(i + 1, k + 1), v(i, k + 1));
    }
  return mb.build();
}
