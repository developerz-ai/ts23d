// bakeNormals: high → low texture bake for IMPORTED parts that carry their own texture set
// (ADR 011). Every texel of the low mesh's UV layout is rasterised to a point + frame on the low
// surface; a ray from the cage (point + normal × cage) inward finds the nearest high-poly surface;
// its smooth normal goes into the low frame's tangent space (glTF: green = image up = −v) and its colour
// into an albedo map. Empty texels are dilated from their neighbours so mip levels do not bleed.
// Pure and deterministic: texel order, nearest hit ties to the lower triangle.

import { type Mesh, Ts23dError } from '../core/index.ts';
import { type Hit, HitGrid } from './bake-hit.ts';
import { uvTangents } from './bake-tangents.ts';

export interface BakeOptions {
  /** Square texture size in texels (power of two, 16…4096). */
  readonly size: number;
  /** Ray start distance above the low surface, metres (default 2% of the low mesh's size). */
  readonly cage?: number;
  /** High-poly albedo at a hit (linear RGB 0..1 into `out`); default: the high mesh's vertex colour. */
  readonly albedo?: (tri: number, u: number, v: number, out: number[]) => void;
  /** Texels of dilation around each UV island (default 4). */
  readonly padding?: number;
}

export interface NormalBake {
  readonly size: number;
  /** RGBA8 tangent-space normal map, row 0 = v 0 (glTF image orientation). */
  readonly normal: Uint8Array;
  /** RGBA8 sRGB albedo. */
  readonly albedo: Uint8Array;
  /** The low mesh's tangents (VEC4) the map is encoded in: export them as TANGENT. */
  readonly tangents: Float32Array;
  /** Fraction of covered texels whose ray hit the high mesh. */
  readonly hitRate: number;
}

const toSrgb = (l: number): number => {
  const c = Math.min(1, Math.max(0, l));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
};

export function bakeNormals(high: Mesh, low: Mesh, o: BakeOptions): NormalBake {
  const S = o.size;
  if (!(Number.isInteger(Math.log2(S)) && S >= 16 && S <= 4096))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `bake size ${S} is not a power of two in 16…4096`,
      fix: 'use 256, 512, 1024 or 2048',
    });
  if (!low.uvs.length || !high.indices.length)
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: 'the low mesh has no UVs or the high mesh has no triangles',
      fix: 'bake onto a low mesh that keeps its import UVs (simplify with preserveUVSeams), from a non-empty high mesh',
    });
  const tangents = uvTangents(low);
  const grid = new HitGrid(high);
  let span = 0;
  for (let k = 0; k < 3; k++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = k; i < low.positions.length; i += 3) {
      lo = Math.min(lo, low.positions[i] ?? 0);
      hi = Math.max(hi, low.positions[i] ?? 0);
    }
    span = Math.max(span, hi - lo);
  }
  const cage = o.cage ?? span * 0.02;
  const normal = new Uint8Array(S * S * 4);
  const albedo = new Uint8Array(S * S * 4);
  const filled = new Uint8Array(S * S);
  const hit: Hit = { tri: -1, t: 0, u: 0, v: 0 };
  const col = [0, 0, 0];
  const L = low;
  let covered = 0;
  let hits = 0;
  const attr = (
    a: Float32Array,
    w: number,
    i: readonly number[],
    bc: readonly number[],
    k: number,
  ): number =>
    (a[(i[0] ?? 0) * w + k] ?? 0) * (bc[0] ?? 0) +
    (a[(i[1] ?? 0) * w + k] ?? 0) * (bc[1] ?? 0) +
    (a[(i[2] ?? 0) * w + k] ?? 0) * (bc[2] ?? 0);
  for (let f = 0; f < L.indices.length; f += 3) {
    const idx = [L.indices[f] ?? 0, L.indices[f + 1] ?? 0, L.indices[f + 2] ?? 0];
    const uv = idx.map((i) => [(L.uvs[i * 2] ?? 0) * S, (L.uvs[i * 2 + 1] ?? 0) * S]) as Array<
      [number, number]
    >;
    const [a, b, c] = uv as [[number, number], [number, number], [number, number]];
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const x1 = Math.min(S - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const y1 = Math.min(S - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
        const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const t = y * S + x;
        if (filled[t]) continue;
        filled[t] = 1;
        covered++;
        const bc = [w0, w1, w2];
        const P = [0, 1, 2].map((k) => attr(L.positions, 3, idx, bc, k));
        let N = [0, 1, 2].map((k) => attr(L.normals, 3, idx, bc, k));
        const nl = Math.hypot(N[0] ?? 0, N[1] ?? 0, N[2] ?? 0) || 1;
        N = N.map((v) => v / nl);
        let T = [0, 1, 2].map((k) => attr(tangents, 4, idx, bc, k));
        const d = T.reduce((s, v, k) => s + v * (N[k] ?? 0), 0);
        T = T.map((v, k) => v - (N[k] ?? 0) * d);
        const tl = Math.hypot(T[0] ?? 0, T[1] ?? 0, T[2] ?? 0) || 1;
        T = T.map((v) => v / tl);
        const w = (tangents[(idx[0] ?? 0) * 4 + 3] ?? 1) < 0 ? -1 : 1;
        const B = [
          ((N[1] ?? 0) * (T[2] ?? 0) - (N[2] ?? 0) * (T[1] ?? 0)) * w,
          ((N[2] ?? 0) * (T[0] ?? 0) - (N[0] ?? 0) * (T[2] ?? 0)) * w,
          ((N[0] ?? 0) * (T[1] ?? 0) - (N[1] ?? 0) * (T[0] ?? 0)) * w,
        ];
        let n = N;
        let rgb = [0, 1, 2].map((k) => attr(L.colors, 3, idx, bc, k));
        const origin = P.map((v, k) => v + (N[k] ?? 0) * cage);
        if (
          grid.nearest(
            origin,
            N.map((v) => -v),
            cage * 2,
            hit,
          )
        ) {
          hits++;
          const h = [0, 1, 2].map((k) => high.indices[hit.tri * 3 + k] ?? 0);
          const hb = [1 - hit.u - hit.v, hit.u, hit.v];
          n = [0, 1, 2].map((k) => attr(high.normals, 3, h, hb, k));
          const hl = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
          n = n.map((v) => v / hl);
          if (o.albedo) {
            o.albedo(hit.tri, hit.u, hit.v, col);
            rgb = [...col];
          } else rgb = [0, 1, 2].map((k) => attr(high.colors, 3, h, hb, k));
        }
        const dot = (v: readonly number[]): number => v.reduce((s, x, k) => s + x * (n[k] ?? 0), 0);
        const ts = [dot(T), dot(B), dot(N)];
        normal.set([...ts.map((v) => Math.round((v * 0.5 + 0.5) * 255)), 255], t * 4);
        albedo.set([...rgb.map((v) => Math.round(toSrgb(v) * 255)), 255], t * 4);
      }
  }
  const island = new Uint8Array(filled);
  dilate(normal, filled, S, o.padding ?? 4, [128, 128, 255]);
  dilate(albedo, island, S, o.padding ?? 4, [128, 128, 128]);
  return { size: S, normal, albedo, tangents, hitRate: covered ? hits / covered : 0 };
}

/** Grow covered texels outward `steps` times (4-neighbour mean); the rest gets `rest`. */
function dilate(
  img: Uint8Array,
  filled: Uint8Array,
  S: number,
  steps: number,
  rest: readonly number[],
): void {
  for (let s = 0; s < steps; s++) {
    const add: Array<[number, number[]]> = [];
    for (let t = 0; t < S * S; t++) {
      if (filled[t]) continue;
      const x = t % S;
      const y = (t - x) / S;
      const sum = [0, 0, 0];
      let n = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S || !filled[ny * S + nx]) continue;
        for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + (img[(ny * S + nx) * 4 + k] ?? 0);
        n++;
      }
      if (n) add.push([t, sum.map((v) => Math.round(v / n))]);
    }
    for (const [t, v] of add) {
      img.set([...v, 255], t * 4);
      filled[t] = 1;
    }
  }
  for (let t = 0; t < S * S; t++) if (!filled[t]) img.set([...rest, 255], t * 4);
}
