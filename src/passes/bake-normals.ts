// bakeNormals: high → low texture bake. The high source is either a mesh (IMPORTED parts that
// carry their own texture set, ADR 011) or a signed-distance field (the hero tier, ADR 012). Every
// texel of the low mesh's UV layout gets a point + frame on the low surface (bake-texels.ts). Mesh
// source: a ray from the cage (point + normal × cage) inward finds the nearest high-poly surface,
// whose smooth normal and colour are taken. Field source: the nearest zero crossing along ±n inside
// the cage (bake-height.ts), normal = ∇f, colour = the low mesh's own. The normal goes into the low
// frame's tangent space (glTF: green = image up = −v). Empty texels are dilated from their
// neighbours so mip levels do not bleed. Pure and deterministic: texel order, nearest hit ties to
// the lower triangle.

import { type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import type { DistanceField } from './bake-field.ts';
import { fieldHit } from './bake-height.ts';
import { type Hit, HitGrid } from './bake-hit.ts';
import { uvTangents } from './bake-tangents.ts';
import { dilateTexels, walkTexels } from './bake-texels.ts';

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

export function bakeNormals(high: Mesh | DistanceField, low: Mesh, o: BakeOptions): NormalBake {
  const S = o.size;
  if (!(Number.isInteger(Math.log2(S)) && S >= 16 && S <= 4096))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `bake size ${S} is not a power of two in 16…4096`,
      fix: 'use 256, 512, 1024 or 2048',
    });
  if (!low.uvs.length || (typeof high !== 'function' && !high.indices.length))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: 'the low mesh has no UVs or the high mesh has no triangles',
      fix: 'bake onto a low mesh that keeps its import UVs (simplify with preserveUVSeams), from a non-empty high mesh',
    });
  const tangents = uvTangents(low);
  const field = typeof high === 'function' ? high : null;
  const grid = field ? null : new HitGrid(high as Mesh);
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
  const hit: Hit = { tri: -1, t: 0, u: 0, v: 0 };
  const col = [0, 0, 0];
  const n = new Float64Array(3);
  const rgb = new Float64Array(3);
  const q: [number, number, number] = [0, 0, 0];
  const h = Math.max(cage * 0.01, 1e-5);
  let covered = 0;
  let hits = 0;
  const attr = (
    a: Float32Array,
    w: number,
    i: readonly number[],
    bc: ArrayLike<number>,
    k: number,
  ) =>
    (a[(i[0] ?? 0) * w + k] ?? 0) * (bc[0] ?? 0) +
    (a[(i[1] ?? 0) * w + k] ?? 0) * (bc[1] ?? 0) +
    (a[(i[2] ?? 0) * w + k] ?? 0) * (bc[2] ?? 0);
  const filled = walkTexels(low, S, tangents, (f) => {
    covered++;
    const idx = [0, 1, 2].map((k) => low.indices[f.tri * 3 + k] ?? 0);
    for (let k = 0; k < 3; k++) {
      n[k] = f.n[k] ?? 0;
      rgb[k] = attr(low.colors, 3, idx, f.w, k);
    }
    const P: Vec3 = [f.p[0] ?? 0, f.p[1] ?? 0, f.p[2] ?? 0];
    const N: Vec3 = [f.n[0] ?? 0, f.n[1] ?? 0, f.n[2] ?? 1];
    if (field) {
      const s = fieldHit(field, P, N, cage);
      if (s !== null) {
        hits++;
        for (let k = 0; k < 3; k++) {
          for (let j = 0; j < 3; j++) q[j] = P[j as 0] + N[j as 0] * s + (j === k ? h : 0);
          const a = field(q);
          q[k] = (q[k] ?? 0) - 2 * h;
          n[k] = a - field(q);
        }
      }
    } else if (
      grid?.nearest(
        P.map((v, k) => v + N[k as 0] * cage),
        N.map((v) => -v),
        cage * 2,
        hit,
      )
    ) {
      hits++;
      const hm = high as Mesh;
      const t = [0, 1, 2].map((k) => hm.indices[hit.tri * 3 + k] ?? 0);
      const hb = [1 - hit.u - hit.v, hit.u, hit.v];
      for (let k = 0; k < 3; k++) n[k] = attr(hm.normals, 3, t, hb, k);
      if (o.albedo) {
        o.albedo(hit.tri, hit.u, hit.v, col);
        rgb.set(col);
      } else for (let k = 0; k < 3; k++) rgb[k] = attr(hm.colors, 3, t, hb, k);
    }
    const nl = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    const dot = (v: Float64Array): number =>
      ((v[0] ?? 0) * (n[0] ?? 0) + (v[1] ?? 0) * (n[1] ?? 0) + (v[2] ?? 0) * (n[2] ?? 0)) / nl;
    const ts = [dot(f.t), dot(f.b), dot(f.n)];
    normal.set([...ts.map((v) => Math.round((v * 0.5 + 0.5) * 255)), 255], f.i * 4);
    albedo.set([...[0, 1, 2].map((k) => Math.round(toSrgb(rgb[k] ?? 0) * 255)), 255], f.i * 4);
  });
  const pad = o.padding ?? 4;
  rest(normal, filled, S, pad, [128, 128, 255]);
  rest(albedo, filled, S, pad, [128, 128, 128]);
  return { size: S, normal, albedo, tangents, hitRate: covered ? hits / covered : 0 };
}

/** Dilate `pad` texels from the covered ones; whatever is still empty gets `fill`. */
function rest(
  img: Uint8Array,
  covered: Uint8Array,
  S: number,
  pad: number,
  fill: readonly number[],
) {
  const filled = new Uint8Array(covered);
  dilateTexels(img, 4, filled, S, pad);
  for (let t = 0; t < S * S; t++) if (!filled[t]) img.set([...fill, 255], t * 4);
}
