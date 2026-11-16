// Secondary maps for the finish atlas, MEASURED rather than guessed from the finished albedo (an
// image model gives colour only):
//   roughness = the trim roughness under the texel (the strip's own height graph made it), plus
//               the height's cavity (crevices hold dirt and read matte) when a height is given
//   metal     = the trim metalness under the texel
//   normal    = the gradient of a world-metre height sampled at each texel's surface point
//               (`graphHeight`: a material's height graph projected triplanar), tangent space
//               with +Y toward decreasing V (as the trim sheet); flat without a height
// Gradients use only texels of the same part, over the true metres between their surface points.

import { Ts23dError } from '../core/index.ts';
import type { MaterialGraph, TexContext } from '../material/index.ts';
import type { Texels } from './texels.ts';

/** Surface relief in metres at a world point with unit normal n. */
export type HeightAt = (
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
) => number;

export interface DeriveOptions {
  /** One relief for every texel, or one per scene part (index = the texel's `part`). */
  readonly height?: HeightAt | readonly (HeightAt | undefined)[];
  /** Roughness (0..255) added per metre⁻¹ of concave height curvature. Default 2. */
  readonly cavityRough?: number;
}

export interface DerivedMaps {
  /** R occlusion (trim), G roughness, B metal: glTF metallicRoughness + occlusion layout. */
  readonly orm: Uint8Array;
  readonly normal: Uint8Array;
}

/**
 * A material graph's height as a world-metre field: evaluated once on a 1 m tile, sampled
 * triplanar (the three axis-plane projections blended by |n|⁴), U wrapping and V mirrored so
 * every plane tiles without a seam. Times the graph's `depth`.
 */
export function graphHeight(g: MaterialGraph, seed = 1, texels = 256): HeightAt {
  if (!(Number.isInteger(texels) && texels >= 8 && texels <= 4096))
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `graphHeight texels is ${texels}`,
      fix: 'use a whole number of texels per metre from 8 to 4096, e.g. 256',
    });
  const ctx = {
    w: texels,
    h: texels,
    metresU: 1,
    metresV: 1,
    wrapU: true,
    seed,
    tileU: 1,
  } satisfies TexContext;
  const h = g.height.eval(ctx);
  const depth = g.depth ?? 0.003;
  const N = texels;
  const at = (u: number, v: number): number => {
    const x = (((Math.floor(u * N) % N) + N) % N) | 0;
    const p = ((Math.floor(v * N) % (2 * N)) + 2 * N) % (2 * N);
    const y = p < N ? p : 2 * N - 1 - p;
    return h[y * N + x] ?? 0;
  };
  return (x, y, z, nx, ny, nz) => {
    const wx = nx ** 4;
    const wy = ny ** 4;
    const wz = nz ** 4;
    const s = wx + wy + wz || 1;
    return ((wx * at(y, z) + wy * at(x, z) + wz * at(x, y)) / s) * depth;
  };
}

export function deriveMaps(t: Texels, albedo: Uint8Array, o: DeriveOptions = {}): DerivedMaps {
  const N = t.size;
  if (albedo.length !== N * N * 4)
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `deriveMaps: albedo is ${albedo.length} bytes for a ${N}² atlas`,
      fix: 'pass the RGBA8 albedo of the same atlas (size² × 4 bytes)',
    });
  const P = t.position;
  const Nm = t.normal;
  const H = new Float32Array(N * N);
  const heightOf = (p: number): HeightAt | undefined =>
    typeof o.height === 'function' ? o.height : o.height?.[p];
  if (o.height)
    for (let i = 0; i < N * N; i++) {
      const at = heightOf(t.part[i] ?? -1);
      if ((t.part[i] ?? -1) >= 0 && at)
        H[i] = at(
          P[i * 3] ?? 0,
          P[i * 3 + 1] ?? 0,
          P[i * 3 + 2] ?? 0,
          Nm[i * 3] ?? 0,
          Nm[i * 3 + 1] ?? 0,
          Nm[i * 3 + 2] ?? 1,
        );
    }
  const orm = new Uint8Array(N * N * 4);
  const normal = new Uint8Array(N * N * 4);
  const cavK = o.cavityRough ?? 2;
  /** Neighbour j of i if it is on the same part, else i itself. */
  const same = (i: number, x: number, y: number): number =>
    x >= 0 && y >= 0 && x < N && y < N && t.part[y * N + x] === t.part[i] ? y * N + x : i;
  const dist = (a: number, b: number): number =>
    Math.hypot(
      (P[a * 3] ?? 0) - (P[b * 3] ?? 0),
      (P[a * 3 + 1] ?? 0) - (P[b * 3 + 1] ?? 0),
      (P[a * 3 + 2] ?? 0) - (P[b * 3 + 2] ?? 0),
    );
  /** dH per metre between neighbours a and b (0 when they are one point). */
  const slope = (a: number, b: number): number => {
    const d = dist(a, b);
    return d > 1e-9 ? ((H[a] ?? 0) - (H[b] ?? 0)) / d : 0;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if ((t.part[i] ?? -1) < 0) {
        orm.set([255, 204, 0, 255], i * 4);
        normal.set([128, 128, 255, 255], i * 4);
        continue;
      }
      const [l, r, u, d] = [
        same(i, x - 1, y),
        same(i, x + 1, y),
        same(i, x, y - 1),
        same(i, x, y + 1),
      ];
      const gx = slope(r, l);
      const gy = slope(u, d);
      // Concave curvature (1/m) of the height: second difference over the neighbour spacing.
      const s = Math.max(1e-9, (dist(l, r) + dist(u, d)) / 4);
      const lap =
        ((H[l] ?? 0) + (H[r] ?? 0) + (H[u] ?? 0) + (H[d] ?? 0) - 4 * (H[i] ?? 0)) / (s * s);
      const rough = (t.orm[i * 4 + 1] ?? 204) + cavK * Math.max(0, lap);
      orm.set(
        [t.orm[i * 4] ?? 255, Math.min(255, Math.round(rough)), t.orm[i * 4 + 2] ?? 0, 255],
        i * 4,
      );
      const len = Math.hypot(gx, gy, 1);
      normal.set(
        [-gx / len, -gy / len, 1 / len].map((c) => Math.round((c * 0.5 + 0.5) * 255)).concat(255),
        i * 4,
      );
    }
  return { orm, normal };
}
