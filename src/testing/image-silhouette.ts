// Silhouette assertions: the asset's outline from one view matches a reference mask (a traced
// photo, a previous render), framing-agnostic — both masks are cropped to their own bounding box
// and fitted, aspect kept, into the same square before IoU — and no see-through holes inside the
// outline from any axis view (background pixels the silhouette fully encloses).
//   it('matches the side photo', () => assertSilhouetteMatches(t34, '-Y', sidePng, 0.8));
//   it('body has no holes', () => assertNoHoles(car, { views: ['+X', '-Y', '+Z'] }));

import type { Asset } from '../core/index.ts';
import { maskIoU, silhouette } from '../render/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';
import { type Image, imageOf } from './image-png.ts';
import { ALL_AXIS_VIEWS, type AxisView, type View, viewOf } from './image-views.ts';

/** Mask of an image: alpha < 128 or near-white = empty, otherwise covered. */
export function maskOfImage(img: Image): Uint8Array {
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0; i < m.length; i++) {
    const o = i * 4;
    const lum = ((img.data[o] ?? 0) + (img.data[o + 1] ?? 0) + (img.data[o + 2] ?? 0)) / 3;
    m[i] = (img.data[o + 3] ?? 0) >= 128 && lum < 200 ? 1 : 0;
  }
  return m;
}

/** Crop a mask to its bounding box and fit it (aspect kept, centred) into an n×n mask. */
export function normaliseMask(mask: Uint8Array, w: number, h: number, n = 128): Uint8Array {
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x])
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const out = new Uint8Array(n * n);
  if (x1 < 0) return out;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const s = Math.max(bw, bh) / n;
  const ox = (n - bw / s) / 2;
  const oy = (n - bh / s) / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx = Math.floor((x - ox + 0.5) * s) + x0;
      const sy = Math.floor((y - oy + 0.5) * s) + y0;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out[y * n + x] = mask[sy * w + sx] ?? 0;
    }
  return out;
}

/** The asset's outline from `view` matches `mask` (PNG: dark/opaque = asset) at IoU ≥ minIoU. */
export function assertSilhouetteMatches(
  asset: Asset,
  view: AxisView | View,
  mask: Uint8Array | Image,
  minIoU = 0.8,
  o: { lod?: 0 | 1 | 2; size?: number } = {},
): number {
  const [c] = compileLods(asset, { lods: [o.lod ?? 0] });
  const ref = imageOf(mask);
  const size = o.size ?? 256;
  const sil = c ? silhouette(c, viewOf(view), size) : { size, mask: new Uint8Array(size * size) };
  const iou = maskIoU(
    normaliseMask(sil.mask, size, size),
    normaliseMask(maskOfImage(ref), ref.width, ref.height),
  );
  const name = typeof view === 'string' ? view : view.label;
  failOn(
    `${asset.name} silhouette`,
    iou >= minIoU
      ? []
      : [
          {
            finding: {
              gate: 'silhouette',
              code: 'T3D_QA_SILHOUETTE',
              message: `outline from ${name} matches the reference mask at IoU ${iou.toFixed(3)} < ${minIoU}`,
              fix: 'compare the two outlines (t3d shot / review): fix proportions first (length, height, where masses sit), then shape',
            },
          },
        ],
  );
  return iou;
}

/** Background pixels not reachable from the image border through background (enclosed holes). */
export function enclosedHoles(mask: Uint8Array, size: number): number {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (!mask[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let k = 0; k < size; k++) {
    push(k);
    push((size - 1) * size + k);
    push(k * size);
    push(k * size + size - 1);
  }
  while (stack.length) {
    const i = stack.pop() ?? 0;
    const x = i % size;
    if (x > 0) push(i - 1);
    if (x < size - 1) push(i + 1);
    if (i >= size) push(i - size);
    if (i < size * (size - 1)) push(i + size);
  }
  let holes = 0;
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !seen[i]) holes++;
  return holes;
}

export interface HoleOptions extends LodOptions {
  readonly views?: readonly AxisView[];
  readonly size?: number;
  /** Enclosed see-through pixels allowed, as a fraction of the silhouette. Default 0.001. */
  readonly maxFraction?: number;
}

/** No light shows through the asset from any checked view. Returns the worst hole fraction. */
export function assertNoHoles(asset: Asset, o: HoleOptions = {}): number {
  const size = o.size ?? 192;
  let worst = 0;
  failOn(
    `${asset.name} holes`,
    compileLods(asset, { lods: [0], ...o }).flatMap((c) =>
      (o.views ?? ALL_AXIS_VIEWS).flatMap((v) => {
        const s = silhouette(c, viewOf(v), size);
        const filled = s.mask.reduce((n, x) => n + x, 0);
        const frac = filled ? enclosedHoles(s.mask, size) / filled : 0;
        worst = Math.max(worst, frac);
        return frac <= (o.maxFraction ?? 0.001)
          ? []
          : [
              {
                lod: c.lod,
                finding: {
                  gate: 'holes',
                  code: 'T3D_QA_HOLES',
                  message: `seen from ${v}, ${(frac * 100).toFixed(2)}% of the outline is see-through (enclosed background)`,
                  fix: 'close the surface there (a missing face, a panel short of its frame); if it is a real opening (a window, a lattice) narrow `views` or raise `maxFraction`',
                },
              },
            ];
      }),
    ),
  );
  return worst;
}
