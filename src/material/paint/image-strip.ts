// Paint a strip from a CC0 texture set: decode the cached PNGs, box-filter them onto the strip's
// texel grid at true scale (the set's `metres`, snapped so a whole number of repeats spans the
// strip's U length — it still tiles), V flipped so the image's top is world up. Albedo stays sRGB
// colour (tint with NATURAL); the OpenGL normal's green is flipped to the sheet's +Y = −V; `arm`
// fills occlusion / roughness / metalness, else greyscale `roughness` / `occlusion` maps (ambientCG)
// over the recipe's constants.

import type { TextureFile, TextureSource } from '../texture-source.ts';
import { textureBytes } from '../texture-source.ts';
import type { Canvas } from './canvas.ts';
import { decodePng, type Rgba } from './decode-png.ts';
import type { StripRecipe } from './types.ts';

const decoded = new Map<string, Rgba>();
function image(f: TextureFile, where: string): Rgba {
  const hit = decoded.get(f.sha256);
  if (hit) return hit;
  const img = decodePng(textureBytes(f, where));
  decoded.set(f.sha256, img);
  return img;
}

/** Average of `img` over the canvas texel footprint, per channel, into out[0..3]. */
function resample(
  c: Canvas,
  t: TextureSource,
  img: Rgba,
  fn: (i: number, px: Float32Array) => void,
) {
  const reps = Math.max(1, Math.round(c.metresU / (t.metres[0] ?? 1)));
  const su = c.metresU / reps;
  const sv = t.metres[1] ?? 1;
  const W = img.width;
  const H = img.height;
  const px = new Float32Array(4);
  for (let y = 0; y < c.h; y++) {
    const v0 = ((y * c.metresV) / c.h / sv) * H;
    const v1 = (((y + 1) * c.metresV) / c.h / sv) * H;
    for (let x = 0; x < c.w; x++) {
      const u0 = ((x * c.metresU) / c.w / su) * W;
      const u1 = (((x + 1) * c.metresU) / c.w / su) * W;
      px.fill(0);
      let n = 0;
      for (let sy = Math.floor(v0); sy < Math.max(Math.floor(v0) + 1, Math.ceil(v1)); sy++) {
        const row = H - 1 - (((sy % H) + H) % H);
        for (let sx = Math.floor(u0); sx < Math.max(Math.floor(u0) + 1, Math.ceil(u1)); sx++) {
          const o = (row * W + (((sx % W) + W) % W)) * 4;
          for (let k = 0; k < 4; k++) px[k] = (px[k] ?? 0) + (img.data[o + k] ?? 0);
          n++;
        }
      }
      for (let k = 0; k < 4; k++) px[k] = (px[k] ?? 0) / n;
      fn(y * c.w + x, px);
    }
  }
}

export function paintImageStrip(c: Canvas, r: StripRecipe, t: TextureSource, where: string): void {
  const albedo = new Uint8Array(c.w * c.h * 4);
  resample(c, t, image(t.maps.albedo, where), (i, p) => {
    albedo.set([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, 255], i * 4);
  });
  c.rgba = albedo;
  c.height.fill(0);
  if (t.maps.normal) {
    const nrm = new Uint8Array(c.w * c.h * 4);
    resample(c, t, image(t.maps.normal, where), (i, p) => {
      const x = (p[0] ?? 128) / 127.5 - 1;
      const y = -((p[1] ?? 128) / 127.5 - 1);
      const z = (p[2] ?? 255) / 127.5 - 1;
      const l = Math.hypot(x, y, z) || 1;
      nrm.set(
        [(x / l) * 127.5 + 127.5, (y / l) * 127.5 + 127.5, (z / l) * 127.5 + 127.5, 255],
        i * 4,
      );
    });
    c.normalRgba = nrm;
  }
  if (t.maps.arm) {
    resample(c, t, image(t.maps.arm, where), (i, p) => {
      c.occl[i] = (p[0] ?? 255) / 255;
      c.rough[i] = (p[1] ?? 204) / 255;
      c.metal[i] = (p[2] ?? 0) / 255;
    });
  } else {
    c.rough.fill(r.roughness);
    c.metal.fill(r.metalness ?? 0);
    const { roughness, occlusion } = t.maps;
    if (roughness)
      resample(c, t, image(roughness, where), (i, p) => {
        c.rough[i] = (p[0] ?? 204) / 255;
      });
    if (occlusion)
      resample(c, t, image(occlusion, where), (i, p) => {
        c.occl[i] = (p[0] ?? 255) / 255;
      });
  }
}
