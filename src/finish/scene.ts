// The finish layer's view of an asset: every part with geometry in world space (finishable parts
// as their atlas meshes: same triangles, atlas UVs), plus a surface lookup — position, normal,
// atlas UV, base colour and trim ORM at a barycentric point — shared by the control maps and the
// texel bake, so both read the asset identically.

import type { CompiledAsset, Mesh } from '../core/index.ts';
import { worldMesh, worldTransforms } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { type Atlas, buildAtlas } from './atlas.ts';
import { baseColour, sampleMap } from './colour.ts';

export interface FinishScene {
  readonly asset: CompiledAsset;
  readonly atlas: Atlas;
  readonly names: readonly string[];
  readonly finishable: readonly boolean[];
  /** World-space mesh per part (null for empty nodes). */
  readonly world: readonly (Mesh | null)[];
  /** Trim-sheet UV per vertex of `world[i]`. */
  readonly trimUv: readonly (Float32Array | null)[];
  readonly sheet?: PaintedSheet;
  /** Axis-aligned bounds of everything drawn. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function finishScene(
  asset: CompiledAsset,
  atlasSize: number,
  sheet?: PaintedSheet,
): FinishScene {
  const atlas = buildAtlas(asset, atlasSize);
  const xf = worldTransforms(asset.parts);
  const names: string[] = [];
  const finishable: boolean[] = [];
  const world: (Mesh | null)[] = [];
  const trimUv: (Float32Array | null)[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of asset.parts) {
    const t = xf.get(p.name);
    if (!p.mesh || !t || p.mesh.indices.length === 0) continue;
    const a = atlas.parts.get(p.name);
    const w = worldMesh(a ? a.mesh : p.mesh, t);
    names.push(p.name);
    finishable.push(a !== undefined);
    world.push(w);
    trimUv.push(a ? a.trimUv : p.mesh.uvs);
    for (let i = 0; i < w.positions.length; i++) {
      const k = i % 3;
      const v = w.positions[i] ?? 0;
      if (v < (min[k] ?? 0)) min[k] = v;
      if (v > (max[k] ?? 0)) max[k] = v;
    }
  }
  return { asset, atlas, names, finishable, world, trimUv, ...(sheet ? { sheet } : {}), min, max };
}

/** Everything the finish reads at one surface point. Arrays are reused: copy what you keep. */
export interface SurfacePoint {
  readonly p: Float32Array;
  readonly n: Float32Array;
  readonly uv: Float32Array;
  /** Base colour sRGB 0..255. */
  readonly rgb: Float32Array;
  /** Trim ORM 0..255 (occlusion, roughness, metal); defaults without a sheet. */
  readonly orm: Float32Array;
}

export const newPoint = (): SurfacePoint => ({
  p: new Float32Array(3),
  n: new Float32Array(3),
  uv: new Float32Array(2),
  rgb: new Float32Array(3),
  orm: new Float32Array(3),
});

const tmp = new Float32Array(4);

export function surfaceAt(
  s: FinishScene,
  part: number,
  t: number,
  b1: number,
  b2: number,
  out: SurfacePoint,
): void {
  const m = s.world[part];
  const tuv = s.trimUv[part];
  if (!m || !tuv) return;
  const b0 = 1 - b1 - b2;
  const a = m.indices[t * 3] ?? 0;
  const b = m.indices[t * 3 + 1] ?? 0;
  const c = m.indices[t * 3 + 2] ?? 0;
  const lerp = (arr: Float32Array, k: number, i: number): number =>
    (arr[a * k + i] ?? 0) * b0 + (arr[b * k + i] ?? 0) * b1 + (arr[c * k + i] ?? 0) * b2;
  for (let i = 0; i < 3; i++) {
    out.p[i] = lerp(m.positions, 3, i);
    out.n[i] = lerp(m.normals, 3, i);
  }
  const nl = Math.hypot(out.n[0] ?? 0, out.n[1] ?? 0, out.n[2] ?? 1) || 1;
  for (let i = 0; i < 3; i++) out.n[i] = (out.n[i] ?? 0) / nl;
  const fin = s.finishable[part] === true;
  out.uv[0] = fin ? lerp(m.uvs, 2, 0) : -1;
  out.uv[1] = fin ? lerp(m.uvs, 2, 1) : -1;
  const tu = lerp(tuv, 2, 0);
  const tv = lerp(tuv, 2, 1);
  const vc: [number, number, number] = [
    lerp(m.colors, 3, 0),
    lerp(m.colors, 3, 1),
    lerp(m.colors, 3, 2),
  ];
  out.rgb.set(baseColour(vc, s.sheet, tu, tv, tmp));
  if (s.sheet) {
    sampleMap(s.sheet.orm, s.sheet.size, tu, tv, tmp);
    out.orm.set([tmp[0] ?? 255, tmp[1] ?? 204, tmp[2] ?? 0]);
  } else out.orm.set([255, 204, 0]);
}
