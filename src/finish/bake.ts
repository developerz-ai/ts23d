// Project finished view images back onto the atlas. Texel-driven: every atlas texel projects into
// every view; it takes colour only where it is visible (depth test against the control depth) and
// — part masking — only from pixels whose part id is its own part, bilinear over same-part taps.
// Views blend by (n·v)², so seams between views fade instead of cutting. Unseen texels are filled
// by fill.ts. Mask leak is measured: weight that came from another part's pixels (0 when masked).

import { Ts23dError } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { toScreen } from './raster.ts';
import type { Texels } from './texels.ts';
import type { ControlViews } from './types.ts';

export interface BakeOptions {
  /** Part masking (default true). Off only to measure what masking prevents. */
  readonly mask?: boolean;
}

export interface Projection {
  /** Weighted mean colour, RGB floats 0..255 per texel; `weight` 0 = unseen. */
  readonly rgb: Float32Array;
  readonly weight: Float32Array;
  /** Share of all projected weight that came from pixels of another part. */
  readonly leak: number;
  /** Leaked share per scene part index. */
  readonly leakByPart: Float32Array;
}

const bad = (cause: string): never => {
  throw new Ts23dError('T3D_FINISH_MODEL', {
    cause,
    fix: 'the model must return one PNG per control view, same width × height, pixel-aligned with the control maps',
  });
};

export function decodeViews(cv: ControlViews, images: readonly Uint8Array[]): Uint8Array[] {
  if (images.length !== cv.views.length)
    bad(`got ${images.length} images for ${cv.views.length} views`);
  return cv.views.map((v, k) => {
    const img = decodePng(images[k] ?? new Uint8Array(), (c) => bad(`view ${v.name}: ${c}`));
    if (img.width !== v.width || img.height !== v.height)
      bad(
        `view ${v.name}: image is ${img.width}×${img.height}, control maps are ${v.width}×${v.height}`,
      );
    return img.data;
  });
}

export function project(
  t: Texels,
  cv: ControlViews,
  rgba: readonly Uint8Array[],
  o: BakeOptions = {},
): Projection {
  const N = t.size;
  const masked = o.mask !== false;
  const rgb = new Float32Array(N * N * 3);
  const weight = new Float32Array(N * N);
  const leakW = new Float32Array(cv.parts.length);
  const allW = new Float32Array(cv.parts.length);
  cv.views.forEach((v, k) => {
    const img = rgba[k] ?? new Uint8Array();
    const W = v.width;
    const H = v.height;
    const [ex, ey, ez] = v.camera.eye;
    for (let i = 0; i < N * N; i++) {
      const part = t.part[i] ?? -1;
      if (part < 0) continue;
      const px = t.position[i * 3] ?? 0;
      const py = t.position[i * 3 + 1] ?? 0;
      const pz = t.position[i * 3 + 2] ?? 0;
      const [sx, sy, q] = toScreen(v.camera, px, py, pz);
      if (q <= 0 || sx < 0.5 || sy < 0.5 || sx >= W - 0.5 || sy >= H - 0.5) continue;
      const dx = ex - px;
      const dy = ey - py;
      const dz = ez - pz;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const cos =
        ((t.normal[i * 3] ?? 0) * dx +
          (t.normal[i * 3 + 1] ?? 0) * dy +
          (t.normal[i * 3 + 2] ?? 0) * dz) /
        dl;
      if (cos < 0.08) continue;
      const depth = 1 / q;
      // Depth tolerance: 1 % of the distance plus two pixel footprints (grazing angles).
      const tol = 0.01 * depth + (2 * depth) / v.camera.focal / Math.max(cos, 0.2);
      const fx = sx - 0.5;
      const fy = sy - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      let sw = 0;
      let leak = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let tap = 0; tap < 4; tap++) {
        const x = x0 + (tap & 1);
        const y = y0 + (tap >> 1);
        const j = y * W + x;
        const wp = (tap & 1 ? fx - x0 : 1 - (fx - x0)) * (tap >> 1 ? fy - y0 : 1 - (fy - y0));
        const pp = v.part[j] ?? -1;
        if (pp < 0 || Math.abs((v.depth[j] ?? Infinity) - depth) > tol) continue;
        if (pp !== part) {
          if (masked) continue;
          leak += wp;
        }
        sw += wp;
        r += wp * (img[j * 4] ?? 0);
        g += wp * (img[j * 4 + 1] ?? 0);
        b += wp * (img[j * 4 + 2] ?? 0);
      }
      if (sw < 0.25) continue;
      const w = cos * cos;
      rgb[i * 3] = (rgb[i * 3] ?? 0) + (w * r) / sw;
      rgb[i * 3 + 1] = (rgb[i * 3 + 1] ?? 0) + (w * g) / sw;
      rgb[i * 3 + 2] = (rgb[i * 3 + 2] ?? 0) + (w * b) / sw;
      weight[i] = (weight[i] ?? 0) + w;
      allW[part] = (allW[part] ?? 0) + w;
      leakW[part] = (leakW[part] ?? 0) + (w * leak) / sw;
    }
  });
  for (let i = 0; i < N * N; i++) {
    const w = weight[i] ?? 0;
    if (w > 0) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = (rgb[i * 3 + c] ?? 0) / w;
  }
  const total = allW.reduce((s, x) => s + x, 0);
  const leaked = leakW.reduce((s, x) => s + x, 0);
  return {
    rgb,
    weight,
    leak: total > 0 ? leaked / total : 0,
    leakByPart: leakW.map((x, p) => ((allW[p] ?? 0) > 0 ? x / (allW[p] ?? 1) : 0)),
  };
}
