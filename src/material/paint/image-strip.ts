// Paint a strip from a CC0 texture set: decode the cached PNGs, box-filter them onto the strip's
// texel grid at true scale (the set's `metres`, snapped so a whole number of repeats spans the
// strip's U length — it still tiles), V flipped so the image's top is world up. Albedo is averaged
// in linear light and re-encoded to sRGB (tint with NATURAL); normal and ORM data are averaged as
// stored, never linearised. Normals decode with 128 = 0 (a flat map stays flat), the OpenGL green
// flipped to the sheet's +Y = −V; `arm` fills occlusion / roughness / metalness, else greyscale
// `roughness` / `occlusion` maps (ambientCG) over the recipe's constants. Every byte is rounded.

import type { TextureFile, TextureSource } from '../texture-source.ts';
import { textureBytes } from '../texture-source.ts';
import type { Canvas } from './canvas.ts';
import { decodePng, type Rgba } from './decode-png.ts';
import { linearToSrgbByte, SRGB_TO_LINEAR } from './srgb.ts';
import type { StripRecipe } from './types.ts';

const decoded = new Map<string, Rgba>();
function image(f: TextureFile, where: string): Rgba {
  const hit = decoded.get(f.sha256);
  if (hit) return hit;
  const img = decodePng(textureBytes(f, where));
  decoded.set(f.sha256, img);
  return img;
}

/**
 * Average of `img` over each canvas texel footprint, per channel, into px[0..3]. `srgb`: RGB are
 * colour bytes, averaged in linear light (px[0..2] linear 0..1); else raw byte averages.
 */
function resample(
  c: Canvas,
  t: TextureSource,
  img: Rgba,
  fn: (i: number, px: Float64Array) => void,
  srgb = false,
) {
  const reps = Math.max(1, Math.round(c.metresU / (t.metres[0] ?? 1)));
  const su = c.metresU / reps;
  const sv = t.metres[1] ?? 1;
  const W = img.width;
  const H = img.height;
  const px = new Float64Array(4);
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
          for (let k = 0; k < 4; k++) {
            const b = img.data[o + k] ?? 0;
            px[k] = (px[k] ?? 0) + (srgb && k < 3 ? (SRGB_TO_LINEAR[b] ?? 0) : b);
          }
          n++;
        }
      }
      for (let k = 0; k < 4; k++) px[k] = (px[k] ?? 0) / n;
      fn(y * c.w + x, px);
    }
  }
}

/** Normal byte → −1..1 with 128 = 0 (so the flat [128, 128, 255] decodes to exactly +Z). */
const unpackN = (b: number): number => (b >= 128 ? (b - 128) / 127 : (b - 128) / 128);
const packN = (v: number): number => Math.round(128 + v * (v < 0 ? 128 : 127));

export function paintImageStrip(c: Canvas, r: StripRecipe, t: TextureSource, where: string): void {
  const albedo = new Uint8Array(c.w * c.h * 4);
  resample(
    c,
    t,
    image(t.maps.albedo, where),
    (i, p) => {
      const e = (k: number): number => linearToSrgbByte(p[k] ?? 0);
      albedo.set([e(0), e(1), e(2), 255], i * 4);
    },
    true,
  );
  c.rgba = albedo;
  c.height.fill(0);
  if (t.maps.normal) {
    const nrm = new Uint8Array(c.w * c.h * 4);
    resample(c, t, image(t.maps.normal, where), (i, p) => {
      const x = unpackN(p[0] ?? 128);
      const y = -unpackN(p[1] ?? 128);
      const z = unpackN(p[2] ?? 255);
      const l = Math.hypot(x, y, z) || 1;
      nrm.set([packN(x / l), packN(y / l), packN(z / l), 255], i * 4);
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
