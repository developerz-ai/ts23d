// Everything the path tracer reads, built once per render: the packed scene, its BVH, the trim
// sheet's mip chains, each triangle's class (classes.ts) and texture mip (its footprint in the
// camera, as the raster's visibility buffer picks it), the analytic studio floor, ray epsilons,
// and the alpha-test filters: cutout cards drop out where their texel is under the cut (the
// coverage-preserving mips keep thin strands), see-through surfaces let shadow rays pass.

import type { CompiledAsset } from '../../core/index.ts';
import { ALPHA_CUT } from '../alpha-mips.ts';
import { type PerspectiveCamera, project } from '../camera.ts';
import { type Scene, sceneOf } from '../scene.ts';
import { type SheetTextures, sample } from '../texture.ts';
import { setAlpha } from '../texture-sets.ts';
import { footprintMip } from '../vis-buffer.ts';
import { type HitFilter, PathBvh } from './bvh.ts';
import { CLS, triangleClasses } from './classes.ts';
import type { Sky } from './sky.ts';

/** The plain (cloneable, shareable) part of a world: no BVH, no closures. */
export interface WorldData {
  readonly scene: Scene;
  readonly tex: SheetTextures;
  readonly cls: Uint8Array;
  readonly mip: Uint8Array;
  readonly sky: Sky;
  /** Floor plane height (the asset's lowest point); NaN = no floor. */
  readonly floorZ: number;
  readonly floorAlbedo: number;
  /** Ray-origin offset along the geometric normal, metres. */
  readonly eps: number;
  /**
   * Hair and fur cards lie on the skin they grow from: their shadow and bounce rays start this far
   * out along the shading normal so the skin under the card does not shadow it (a raster shadow
   * map's bias does the same). Metres.
   */
  readonly lift: number;
  readonly extent: number;
}

export interface World extends WorldData {
  readonly bvh: PathBvh;
  readonly camHit: HitFilter;
  readonly shadowHit: HitFilter;
}

export interface WorldOptions {
  readonly sky: Sky;
  readonly floor?: boolean;
  readonly floorAlbedo?: number;
}

/** Per-triangle mip from its projected footprint (cutouts anisotropic, like the raster). */
function cameraMips(s: Scene, cam: PerspectiveCamera, size: number, cls: Uint8Array): Uint8Array {
  const out = new Uint8Array(s.triangles).fill(2);
  const P = s.positions;
  const U = s.uvs;
  for (let t = 0; t < s.triangles; t++) {
    const v = [0, 1, 2].map((k) => s.indices[t * 3 + k] ?? 0);
    const q = v.map((i) => project(cam, P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0));
    const [a, b, c] = q;
    if (!a || !b || !c || a[2] <= 1e-4 || b[2] <= 1e-4 || c[2] <= 1e-4) continue;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-12) continue;
    const [i0, i1, i2] = v as [number, number, number];
    const cut = cls[t] === CLS.hair || cls[t] === CLS.foliage;
    out[t] = footprintMip(
      b[0] - a[0],
      b[1] - a[1],
      c[0] - a[0],
      c[1] - a[1],
      (U[i1 * 2] ?? 0) - (U[i0 * 2] ?? 0),
      (U[i1 * 2 + 1] ?? 0) - (U[i0 * 2 + 1] ?? 0),
      (U[i2 * 2] ?? 0) - (U[i0 * 2] ?? 0),
      (U[i2 * 2 + 1] ?? 0) - (U[i0 * 2 + 1] ?? 0),
      s.sets[(s.texSet[t] ?? 0) - 1]?.size ?? size,
      cut,
    );
  }
  return out;
}

/** Scene, classes, mips and constants of a render (what a worker needs to rebuild the world). */
export function worldData(
  asset: CompiledAsset,
  cam: PerspectiveCamera,
  tex: SheetTextures,
  o: WorldOptions,
): WorldData {
  const scene = sceneOf(asset);
  const cls = triangleClasses(asset, scene.triangles);
  const extent = Math.max(...scene.max.map((m, k) => m - (scene.min[k] ?? 0)), 1e-3);
  return {
    scene,
    tex,
    cls,
    mip: cameraMips(scene, cam, tex.size, cls),
    sky: o.sky,
    floorZ: o.floor === false ? Number.NaN : scene.min[2],
    floorAlbedo: o.floorAlbedo ?? 0.35,
    eps: 2e-5 * extent + 1e-6,
    lift: 0.004 * extent,
    extent,
  };
}

/** The world from its data: the BVH and the alpha-test filters. */
export function assemble(d: WorldData): World {
  const { scene, cls, mip, tex } = d;
  const texel = new Float32Array(4);
  const opaqueAt = (t: number, b1: number, b2: number): boolean => {
    const c = cls[t];
    if (c !== CLS.hair && c !== CLS.foliage) return true;
    const I = scene.indices;
    const U = scene.uvs;
    const b0 = 1 - b1 - b2;
    const a = (I[t * 3] ?? 0) * 2;
    const b = (I[t * 3 + 1] ?? 0) * 2;
    const e = (I[t * 3 + 2] ?? 0) * 2;
    const u = (U[a] ?? 0) * b0 + (U[b] ?? 0) * b1 + (U[e] ?? 0) * b2;
    const w = (U[a + 1] ?? 0) * b0 + (U[b + 1] ?? 0) * b1 + (U[e + 1] ?? 0) * b2;
    const set = scene.sets[(scene.texSet[t] ?? 0) - 1];
    if (set) return setAlpha(set, mip[t] ?? 0, u, w) >= ALPHA_CUT;
    sample(tex.albedo, mip[t] ?? 0, u, w, texel);
    return (texel[3] ?? 1) >= ALPHA_CUT;
  };
  return {
    ...d,
    bvh: new PathBvh(scene.positions, scene.indices),
    camHit: opaqueAt,
    shadowHit: (t, b1, b2) => cls[t] !== CLS.thin && opaqueAt(t, b1, b2),
  };
}

export const buildWorld = (
  asset: CompiledAsset,
  cam: PerspectiveCamera,
  tex: SheetTextures,
  o: WorldOptions,
): World => assemble(worldData(asset, cam, tex, o));

/** Distance along (o, d) to the floor plane, Infinity when it is missed or absent. */
export function floorT(w: World, o: ArrayLike<number>, d: ArrayLike<number>): number {
  const dz = d[2] ?? 0;
  if (!(dz < -1e-9)) return Infinity;
  const t = (w.floorZ - (o[2] ?? 0)) / dz;
  return t > 0 ? t : Infinity;
}
