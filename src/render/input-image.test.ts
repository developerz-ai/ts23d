import { describe, expect, it } from 'bun:test';
import { checkInputImage, laplacianVariance, MIN_SHARPNESS } from './input-image.ts';

/** Deterministic texture value 0–1 (a fur-like grain). */
const grain = (x: number, y: number): number =>
  (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) + 1) % 1;

interface Img {
  readonly px: Uint8Array;
  readonly w: number;
  readonly h: number;
}

/** A textured ellipse "animal" (centre, radii) on a plain or cluttered background. */
function scene(
  w: number,
  h: number,
  blobs: readonly [number, number, number, number][],
  clutter = false,
): Img {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inBlob = blobs.some(
        ([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
      );
      const g = grain(x, y);
      // Snow-photo pattern: bright mottled snow, dark tree trunks every 70 px, shadows.
      const bg = clutter ? (x % 70 < 9 ? 40 + 30 * g : 200 + 50 * g - (y > h * 0.7 ? 60 : 0)) : 250;
      const v = inBlob ? 70 + 90 * g : bg;
      px.set([v, v * 0.95, v * 0.9, 255], (y * w + x) * 4);
    }
  return { px, w, h };
}

function boxBlur(img: Img, r: number): Img {
  const out = new Uint8Array(img.px.length);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.min(img.w - 1, Math.max(0, x + dx));
            const yy = Math.min(img.h - 1, Math.max(0, y + dy));
            s += img.px[(yy * img.w + xx) * 4 + c] ?? 0;
            n++;
          }
        out[(y * img.w + x) * 4 + c] = Math.round(s / n);
      }
  return { ...img, px: out };
}

const rules = (i: Img) => checkInputImage(i.px, i.w, i.h).findings.map((f) => f.rule);
const clean = scene(600, 600, [[300, 300, 200, 150]]);

describe('checkInputImage (D55: cluttered photos make broken AI meshes)', () => {
  it('refuses the snow-wolf photo pattern: no plain background, the scene is not one subject', () => {
    const photo = scene(640, 520, [[320, 300, 200, 140]], true);
    expect(rules(photo)).toEqual(expect.arrayContaining(['background', 'subjects']));
  });

  it('passes a clean generated image: one sharp subject on a plain background, ≥ 512 px', () => {
    expect(rules(clean)).toEqual([]);
  });

  it('refuses two animals, a small one, a cropped one and a thumbnail', () => {
    expect(
      rules(
        scene(600, 600, [
          [160, 300, 120, 150],
          [440, 300, 120, 150],
        ]),
      ),
    ).toContain('subjects');
    expect(rules(scene(600, 600, [[300, 300, 90, 70]]))).toEqual(['fill']);
    expect(rules(scene(600, 600, [[300, 300, 320, 150]]))).toContain('cropped');
    expect(rules(scene(300, 300, [[150, 150, 100, 75]]))).toEqual(['resolution']);
    expect(
      checkInputImage(scene(300, 300, [[150, 150, 100, 75]]).px, 300, 300, { minSide: 256 })
        .findings,
    ).toEqual([]);
  });

  it('specks do not count as subjects', () => {
    const specked = scene(600, 600, [
      [300, 300, 200, 150],
      [40, 40, 4, 4],
    ]);
    expect(rules(specked)).toEqual([]);
  });

  it('sharpness floor sits between a sharp texture and a 4 px blur of it (calibration)', () => {
    const sharp = laplacianVariance(clean.px, clean.w, clean.h);
    const blurred = boxBlur(clean, 4);
    expect(sharp).toBeGreaterThan(MIN_SHARPNESS * 10);
    expect(laplacianVariance(blurred.px, blurred.w, blurred.h)).toBeLessThan(MIN_SHARPNESS);
    expect(rules(blurred)).toContain('sharpness');
  });
});
