// Render assertions on plain RGBA images (PNG bytes or decoded): something was drawn in a region,
// and an image matches its committed golden — on a mismatch `<golden>.diff.png` is written (red =
// pixels off by more than the tolerance over a faded copy of the golden) so the agent can Read it.
//   it('hero is not blank', () => assertNotEmpty(heroPng));
//   it('sheet unchanged', () => expectImageClose(sheetPng, 'test/golden/t34-sheet.png'));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePng, Ts23dError } from '../core/index.ts';
import { failOn } from './compiled.ts';
import { type Image, imageOf } from './image-png.ts';

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NotEmptyOptions {
  /** Background colour; default the image's top-left pixel. */
  readonly background?: readonly [number, number, number];
  /** Fraction of the region that must differ from the background. Default 0.01. */
  readonly minFraction?: number;
}

/** Fraction of `region` (default the whole image) not background (alpha 0 counts as background). */
export function coverage(img: Image, region?: Region, o: NotEmptyOptions = {}): number {
  const r = region ?? { x: 0, y: 0, width: img.width, height: img.height };
  const bg = o.background ?? [img.data[0] ?? 0, img.data[1] ?? 0, img.data[2] ?? 0];
  let n = 0;
  let total = 0;
  for (let y = Math.max(0, r.y); y < Math.min(img.height, r.y + r.height); y++)
    for (let x = Math.max(0, r.x); x < Math.min(img.width, r.x + r.width); x++) {
      const i = (y * img.width + x) * 4;
      total++;
      if ((img.data[i + 3] ?? 0) === 0) continue;
      const d = Math.max(...[0, 1, 2].map((k) => Math.abs((img.data[i + k] ?? 0) - (bg[k] ?? 0))));
      if (d > 8) n++;
    }
  return total ? n / total : 0;
}

/** At least `minFraction` of the region shows something other than the background. */
export function assertNotEmpty(
  render: Uint8Array | Image,
  region?: Region,
  o: NotEmptyOptions = {},
): number {
  const img = imageOf(render);
  const c = coverage(img, region, o);
  const min = o.minFraction ?? 0.01;
  const where = region
    ? `region ${region.width}×${region.height} at (${region.x}, ${region.y})`
    : `the ${img.width}×${img.height} image`;
  failOn(
    'render',
    c >= min
      ? []
      : [
          {
            finding: {
              gate: 'not-empty',
              message: `${where} is ${(c * 100).toFixed(2)}% drawn, want ≥ ${(min * 100).toFixed(2)}%`,
              fix: 'the asset is missing from the frame: check it compiled with geometry, sits near the origin, and the camera/region frames it',
            },
          },
        ],
  );
  return c;
}

export interface ImageCloseOptions {
  /** Per-channel difference (0–255) a pixel may have before it counts as off. Default 8. */
  readonly tolerance?: number;
  /** Fraction of pixels allowed off. Default 0.001. */
  readonly maxOff?: number;
  /** Rewrite the golden instead of comparing. Default: env T3D_UPDATE_GOLDEN=1. */
  readonly update?: boolean;
}

/**
 * Compare with the golden PNG at `goldenPath`. A missing golden is written (first run) and
 * passes; a mismatch writes `<golden>.diff.png` and throws T3D_QA_FAILED. Returns the off fraction.
 */
export function expectImageClose(
  actual: Uint8Array | Image,
  goldenPath: string,
  o: ImageCloseOptions = {},
): number {
  const img = imageOf(actual);
  const update = o.update ?? process.env['T3D_UPDATE_GOLDEN'] === '1';
  if (update || !existsSync(goldenPath)) {
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, encodePng(img.width, img.height, img.data));
    return 0;
  }
  const gold = imageOf(new Uint8Array(readFileSync(goldenPath)));
  if (gold.width !== img.width || gold.height !== img.height)
    throw new Ts23dError('T3D_QA_FAILED', {
      cause: `image is ${img.width}×${img.height}, golden ${goldenPath} is ${gold.width}×${gold.height}`,
      fix: 'render at the golden size, or accept the new size with T3D_UPDATE_GOLDEN=1 after reading the image',
    });
  const tol = o.tolerance ?? 8;
  const diff = new Uint8Array(img.data.length);
  let off = 0;
  let worst = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++)
      d = Math.max(d, Math.abs((img.data[i + k] ?? 0) - (gold.data[i + k] ?? 0)));
    worst = Math.max(worst, d);
    const g = Math.round(
      ((gold.data[i] ?? 0) + (gold.data[i + 1] ?? 0) + (gold.data[i + 2] ?? 0)) / 12 + 160,
    );
    diff.set(d > tol ? [255, 0, 0, 255] : [g, g, g, 255], i);
    if (d > tol) off++;
  }
  const frac = off / (img.width * img.height);
  const diffPath = `${goldenPath.replace(/\.png$/i, '')}.diff.png`;
  if (frac > (o.maxOff ?? 0.001)) {
    writeFileSync(diffPath, encodePng(img.width, img.height, diff));
    failOn('image', [
      {
        finding: {
          gate: 'image-close',
          message: `${(frac * 100).toFixed(2)}% of pixels differ from ${goldenPath} by > ${tol} (worst ${worst}); diff written to ${diffPath}`,
          fix: `Read ${diffPath} (red = changed). Fix the regression, or if the change is intended re-run with T3D_UPDATE_GOLDEN=1`,
        },
      },
    ]);
  }
  return frac;
}
