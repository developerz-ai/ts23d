// Beauty render: the zero-GPU product shot for READMEs, gallery cards and the review pack.
// Perspective 3/4 hero camera, trim-sheet textures × vertex colour with normal + ORM maps, a key
// sun with soft PCF shadows, sky fill with multi-direction ambient occlusion, a seamless studio
// floor that only shows the shadows, 2× supersampling. Deterministic: same asset → same bytes.

import { type CompiledAsset, encodePng } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { frameOrbit, type PerspectiveCamera, scaled, zoomWindow } from './camera.ts';
import { depthMap } from './depth-map.ts';
import { floorGrid } from './ground.ts';
import { pcfTaps, studioRig } from './lighting.ts';
import { checkBeautyOptions } from './options.ts';
import { resolve } from './resolve.ts';
import { sceneOf } from './scene.ts';
import type { ShadeContext } from './shade.ts';
import { sample, sheetTextures } from './texture.ts';
import { rasteriseVis } from './vis-buffer.ts';

export interface BeautyOptions {
  /** Output size in pixels. Default 1600 × 900. */
  readonly width?: number;
  readonly height?: number;
  /** Camera orbit, degrees: azimuth about Z from the front (+X), −35 = front-left 3/4. */
  readonly azDeg?: number;
  /** Elevation above the horizon, degrees (−10…89). Default 18. */
  readonly elDeg?: number;
  /** Vertical field of view, degrees. Default 30. */
  readonly fovDeg?: number;
  /** Samples per pixel edge (1–4). Default 2 (4 samples per pixel). */
  readonly supersample?: number;
  /** The painted trim sheet; default paints `DEFAULT_SHEET` at 1024² once per process. */
  readonly sheet?: PaintedSheet;
  /** Zoom into the default framing: window centre (0–1, 0–1) of the full shot and a zoom ≥ 1. */
  readonly window?: { readonly x: number; readonly y: number; readonly zoom: number };
  /** Frame with this asset instead (e.g. LOD0's framing for a LOD2 render, so they line up). */
  readonly frameFrom?: CompiledAsset;
}

export interface BeautyRender {
  readonly width: number;
  readonly height: number;
  /** RGBA8, sRGB, opaque. */
  readonly rgba: Uint8Array;
  /** Asset coverage per pixel, 0–255 (the silhouette, antialiased). */
  readonly mask: Uint8Array;
  /** Distinct triangles visible per cell of a 16 × 9 grid — where the detail is. */
  readonly detail: Uint32Array;
}

let defaultSheet: PaintedSheet | undefined;
const sheetOf = (o: BeautyOptions): PaintedSheet => {
  if (o.sheet) return o.sheet;
  defaultSheet ??= paintTrimSheet({ ...DEFAULT_SHEET, size: 1024 });
  return defaultSheet;
};

export function cameraFor(asset: CompiledAsset, o: BeautyOptions = {}): PerspectiveCamera {
  const v = checkBeautyOptions(o);
  const cam = frameOrbit(
    sceneOf(o.frameFrom ?? asset).positions,
    { azDeg: v.azDeg, elDeg: v.elDeg, fovDeg: v.fovDeg, fill: 0.8 },
    v.width,
    v.height,
  );
  return o.window ? zoomWindow(cam, o.window.x, o.window.y, o.window.zoom) : cam;
}

export function renderBeauty(asset: CompiledAsset, o: BeautyOptions = {}): BeautyRender {
  const v = checkBeautyOptions(o);
  const ss = v.supersample;
  const scene = sceneOf(asset);
  const tex = sheetTextures(sheetOf(o));
  const rig = studioRig(v.azDeg);
  const texel = new Float32Array(4);
  const alpha = (t: number, b1: number, b2: number, mip = 2): boolean => {
    const I = scene.indices;
    const U = scene.uvs;
    const b0 = 1 - b1 - b2;
    const a = (I[t * 3] ?? 0) * 2;
    const b = (I[t * 3 + 1] ?? 0) * 2;
    const c = (I[t * 3 + 2] ?? 0) * 2;
    const u = (U[a] ?? 0) * b0 + (U[b] ?? 0) * b1 + (U[c] ?? 0) * b2;
    const w = (U[a + 1] ?? 0) * b0 + (U[b + 1] ?? 0) * b1 + (U[c + 1] ?? 0) * b2;
    sample(tex.albedo, mip, u, w, texel);
    return (texel[3] ?? 1) >= 0.5;
  };
  const cam = scaled(cameraFor(asset, o), ss);
  const vis = rasteriseVis(scene, cam, tex.size, alpha);
  const extent = Math.max(...scene.max.map((m, k) => m - (scene.min[k] ?? 0)));
  // Map resolutions follow the output: full quality at hero sizes, cheap for thumbnails/tests.
  const px = Math.max(v.width, v.height) * ss;
  const res = (lo: number, hi: number, f: number): number =>
    Math.max(lo, Math.min(hi, Math.round(px * f)));
  const sunMap = depthMap(scene, rig.sun, res(256, 2048, 1), undefined, alpha);
  const ctx: ShadeContext = {
    scene,
    cam,
    tex,
    rig,
    sunMap,
    aoMaps: rig.skyDirs.map((d) => depthMap(scene, d, res(96, 384, 0.25), undefined, alpha)),
    // Penumbra ~0.4% of the asset's size: soft enough to read as a studio key, never mushy.
    pcf: pcfTaps(Math.max(1.2, 0.004 * extent * sunMap.k)),
    reach: 0.12 * extent,
  };
  const floor = floorGrid(ctx, res(96, 512, 0.25));
  return resolve(ctx, vis, floor, v.width, v.height, ss);
}

/** The beauty render as PNG bytes. */
export function beauty(asset: CompiledAsset, o: BeautyOptions = {}): Uint8Array {
  const r = renderBeauty(asset, o);
  return encodePng(r.width, r.height, r.rgba);
}
