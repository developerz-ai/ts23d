// Before / after look at a finish: the finished asset rasterised from the hero 3/4 camera, textured
// with the BASE atlas (vertex colour × trim, what the code made) and with the FINISHED atlas, both
// under one simple key + sky light, side by side. Same shader for both halves, so the difference is
// the finish alone. Unfinished parts (glass, painted, glow) show vertex colour. Deterministic.

import { encodePng, worldMeshes } from '../core/index.ts';
import { cameraFor } from '../render/index.ts';
import { linToSrgb, sampleMap, srgbToLin } from './colour.ts';
import type { FinishResult } from './finish.ts';
import { rasteriseParts } from './raster.ts';

export interface PreviewOptions {
  readonly width?: number;
  readonly height?: number;
  readonly azDeg?: number;
  readonly elDeg?: number;
}

const KEY = (() => {
  const v = [0.45, -0.55, 0.7];
  const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((x) => x / l);
})();

/** One half: RGBA8 of the asset textured with `map` (an atlas, RGBA8). */
export function previewImage(r: FinishResult, map: Uint8Array, o: PreviewOptions = {}): Uint8Array {
  const width = o.width ?? 800;
  const height = o.height ?? 600;
  const cam = cameraFor(r.asset, { width, height, azDeg: o.azDeg ?? -35, elDeg: o.elDeg ?? 18 });
  const world = worldMeshes(r.asset.parts);
  const meshes = r.controls.parts.map((p) => world.get(p) ?? null);
  const ras = rasteriseParts(meshes, cam);
  const out = new Uint8Array(width * height * 4);
  const tex = new Float32Array(4);
  for (let i = 0; i < width * height; i++) {
    const y = Math.floor(i / width);
    const bgv = Math.round(236 - (18 * y) / height);
    out.set([bgv, bgv, bgv + 2, 255], i * 4);
    const p = ras.part[i] ?? -1;
    const m = meshes[p];
    if (p < 0 || !m) continue;
    const t = ras.tri[i] ?? 0;
    const b1 = ras.b1[i] ?? 0;
    const b2 = ras.b2[i] ?? 0;
    const b0 = 1 - b1 - b2;
    const [a, b, c] = [m.indices[t * 3] ?? 0, m.indices[t * 3 + 1] ?? 0, m.indices[t * 3 + 2] ?? 0];
    const at = (arr: Float32Array, k: number, j: number): number =>
      (arr[a * k + j] ?? 0) * b0 + (arr[b * k + j] ?? 0) * b1 + (arr[c * k + j] ?? 0) * b2;
    const n = [at(m.normals, 3, 0), at(m.normals, 3, 1), at(m.normals, 3, 2)];
    const nl = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    const ndl = Math.max(
      0,
      n.reduce((s, x, k) => s + (x / nl) * (KEY[k] ?? 0), 0),
    );
    const sky = 0.5 + 0.5 * ((n[2] ?? 0) / nl);
    const light = 0.95 * ndl + 0.38 * sky + 0.08;
    let lin: number[];
    if (r.controls.finishable[p]) {
      sampleMap(map, r.maps.size, at(m.uvs, 2, 0), at(m.uvs, 2, 1), tex);
      lin = [0, 1, 2].map((k) => srgbToLin(tex[k] ?? 0));
    } else lin = [0, 1, 2].map((k) => at(m.colors, 3, k));
    out.set(
      lin.map((x) => linToSrgb(x * light)),
      i * 4,
    );
  }
  return out;
}

/** PNG: before (base atlas) | after (finished atlas), side by side. */
export function finishCompare(r: FinishResult, o: PreviewOptions = {}): Uint8Array {
  const w = o.width ?? 800;
  const h = o.height ?? 600;
  const before = previewImage(r, r.maps.base, o);
  const after = previewImage(r, r.maps.albedo, o);
  const out = new Uint8Array(w * 2 * h * 4);
  for (let y = 0; y < h; y++) {
    out.set(before.subarray(y * w * 4, (y + 1) * w * 4), y * w * 8);
    out.set(after.subarray(y * w * 4, (y + 1) * w * 4), y * w * 8 + w * 4);
  }
  return encodePng(w * 2, h, out);
}
