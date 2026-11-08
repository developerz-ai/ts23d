// Control views: for N cameras (N−1 orbiting at 20° elevation from the front-left 3/4, plus one
// from above) the per-pixel buffers an image model is conditioned on — depth, normals, part ids,
// atlas UVs, unlit base colour, optionally the lit beauty render — and one hash of all of them.
// Same asset + options → same buffers, same hash (the model cache key starts here).

import { createHash } from 'node:crypto';
import { cameraFor, renderBeauty } from '../render/index.ts';
import { rasteriseParts } from './raster.ts';
import { type FinishScene, newPoint, surfaceAt } from './scene.ts';
import type { ControlView, ControlViews } from './types.ts';

export interface ControlOptions {
  /** Number of views (1–24): N−1 orbit + 1 top. Default 8. */
  readonly views?: number;
  /** Square view size in pixels. Default 512. */
  readonly size?: number;
  /** Also render the lit beauty image per view (slower). Default false. */
  readonly beauty?: boolean;
}

/** Camera angles: the first orbit view is the hero 3/4 (−35°); the last view looks down. */
export function viewAngles(n: number): { name: string; azDeg: number; elDeg: number }[] {
  if (n <= 1) return [{ name: 'orbit_0', azDeg: -35, elDeg: 20 }];
  const orbit = Array.from({ length: n - 1 }, (_, i) => ({
    name: `orbit_${i}`,
    azDeg: -35 + (i * 360) / (n - 1),
    elDeg: 20,
  }));
  return [...orbit, { name: 'top', azDeg: -35, elDeg: 89 }];
}

function controlView(
  s: FinishScene,
  a: { name: string; azDeg: number; elDeg: number },
  size: number,
  withBeauty: boolean,
): ControlView {
  const look = { width: size, height: size, azDeg: a.azDeg, elDeg: a.elDeg };
  const camera = cameraFor(s.asset, look);
  const r = rasteriseParts(s.world, camera);
  const n = size * size;
  const depth = new Float32Array(n).fill(Infinity);
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2).fill(-1);
  const albedo = new Uint8Array(n * 4);
  const pt = newPoint();
  for (let i = 0; i < n; i++) {
    const part = r.part[i] ?? -1;
    if (part < 0) continue;
    surfaceAt(s, part, r.tri[i] ?? 0, r.b1[i] ?? 0, r.b2[i] ?? 0, pt);
    depth[i] = 1 / (r.invw[i] ?? 1);
    position.set(pt.p, i * 3);
    normal.set(pt.n, i * 3);
    uv.set(pt.uv, i * 2);
    albedo.set([pt.rgb[0] ?? 0, pt.rgb[1] ?? 0, pt.rgb[2] ?? 0, 255], i * 4);
  }
  const beauty = withBeauty
    ? renderBeauty(s.asset, { ...look, supersample: 1, ...(s.sheet ? { sheet: s.sheet } : {}) })
        .rgba
    : undefined;
  return {
    ...a,
    camera,
    width: size,
    height: size,
    part: r.part,
    tri: r.tri,
    b1: r.b1,
    b2: r.b2,
    depth,
    position,
    normal,
    uv,
    albedo,
    ...(beauty ? { beauty } : {}),
  };
}

export function controlViews(s: FinishScene, o: ControlOptions = {}): ControlViews {
  const n = Math.max(1, Math.min(24, Math.round(o.views ?? 8)));
  const size = Math.max(32, Math.min(2048, Math.round(o.size ?? 512)));
  const views = viewAngles(n).map((a) => controlView(s, a, size, o.beauty === true));
  const h = createHash('sha256');
  h.update(
    JSON.stringify({ asset: s.asset.name, parts: s.names, fin: s.finishable, atlas: s.atlas.size }),
  );
  for (const v of views) {
    h.update(JSON.stringify({ name: v.name, camera: v.camera }));
    h.update(v.albedo);
    h.update(new Uint8Array(v.part.buffer, v.part.byteOffset, v.part.byteLength));
    h.update(new Uint8Array(v.depth.buffer, v.depth.byteOffset, v.depth.byteLength));
  }
  return {
    asset: s.asset.name,
    parts: s.names,
    finishable: s.finishable,
    views,
    hash: h.digest('hex'),
  };
}
