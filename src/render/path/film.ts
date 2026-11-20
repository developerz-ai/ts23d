// The path tracer's film: renders the image tile by tile (32 × 32, fixed row-major order; every
// pixel owns its seed and its slot, so tiles can run anywhere and merge by index), jitters each
// sample inside its pixel with the sampler's first dimensions, and stores two layers per pixel:
// the asset's radiance (with its albedo / normal guides and luminance variance for the denoiser) and the studio floor's
// shadow-catcher ratio with the shares of samples that saw floor and backdrop. compose() puts
// them together: asset + backdrop × (floor share × shadow + backdrop share).

import { dmath } from '../../core/index.ts';
import type { PerspectiveCamera } from '../camera.ts';
import { fromSrgb } from '../lighting.ts';
import { type Accum, type TraceParams, traceSample } from './integrator.ts';
import { pixelSeed, sample4 } from './sampler.ts';
import type { World } from './world.ts';

export const TILE = 32;

export interface Film {
  readonly width: number;
  readonly height: number;
  /** Asset radiance ÷ samples (coverage-weighted), 3 per pixel. */
  readonly color: Float32Array;
  /** Mean albedo and normal of the asset samples (0 where none hit), 3 per pixel. */
  readonly albedo: Float32Array;
  readonly normal: Float32Array;
  /**
   * Variance of the pixel's mean asset luminance (sample variance ÷ samples): how much of what
   * the pixel shows is noise. The denoiser smooths differences below it and keeps those above.
   * An upper bound: the Owen-scrambled Sobol mean moves less than this i.i.d. estimate says.
   */
  readonly variance: Float32Array;
  /** Floor shadow-catcher ratio (1 = unshadowed), and the floor / backdrop sample shares. */
  readonly shadow: Float32Array;
  readonly floor: Float32Array;
  readonly back: Float32Array;
  readonly mask: Uint8Array;
}

/** Studio backdrop (linear) at normalised screen (nx, ny), as the raster's resolve paints it. */
export function backdrop(nx: number, ny: number, out: Float64Array): void {
  const dx = (nx - 0.5) * 1.1;
  const dy = ny - 0.62;
  const fall = Math.min(1, dx * dx + dy * dy * 1.6);
  out[0] = fromSrgb(0.93 - 0.17 * fall);
  out[1] = fromSrgb(0.935 - 0.15 * fall);
  out[2] = fromSrgb(0.94 - 0.12 * fall);
}

export const newFilm = (width: number, height: number): Film => ({
  width,
  height,
  color: new Float32Array(width * height * 3),
  albedo: new Float32Array(width * height * 3),
  normal: new Float32Array(width * height * 3),
  variance: new Float32Array(width * height),
  shadow: new Float32Array(width * height),
  floor: new Float32Array(width * height),
  back: new Float32Array(width * height),
  mask: new Uint8Array(width * height),
});

/** Linear RGB of the finished image from the (denoised) asset layer and shadow ratios. */
export function compose(f: Film, color: Float32Array, shadow: Float32Array): Float32Array {
  const out = new Float32Array(f.width * f.height * 3);
  const bg = new Float64Array(3);
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const i = y * f.width + x;
      backdrop(x / f.width, y / f.height, bg);
      const off = (f.floor[i] ?? 0) * (shadow[i] ?? 1) + (f.back[i] ?? 0);
      for (let k = 0; k < 3; k++) out[i * 3 + k] = (color[i * 3 + k] ?? 0) + (bg[k] ?? 0) * off;
    }
  return out;
}

const lum = (c: Float64Array): number =>
  0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);

const acc: Accum = {
  rad: new Float64Array(3),
  albedo: new Float64Array(3),
  normal: new Float64Array(3),
  floor: new Float64Array(2),
  floorN: 0,
  bgN: 0,
  hitN: 0,
};
const bg = new Float64Array(3);
const dir = new Float64Array(3);
const jit = new Float64Array(4);

/** Render tile number `tile` (row-major over the image) into `film`. */
export function renderTile(
  w: World,
  cam: PerspectiveCamera,
  film: Film,
  tile: number,
  spp: number,
  p: TraceParams,
  salt: number,
): void {
  const across = Math.ceil(film.width / TILE);
  const x0 = (tile % across) * TILE;
  const y0 = Math.floor(tile / across) * TILE;
  for (let y = y0; y < Math.min(film.height, y0 + TILE); y++)
    for (let x = x0; x < Math.min(film.width, x0 + TILE); x++)
      renderPixel(w, cam, film, x, y, spp, p, salt);
}

export const tileCount = (f: Film): number =>
  Math.ceil(f.width / TILE) * Math.ceil(f.height / TILE);

function renderPixel(
  w: World,
  cam: PerspectiveCamera,
  film: Film,
  x: number,
  y: number,
  spp: number,
  p: TraceParams,
  salt: number,
): void {
  acc.rad.fill(0);
  acc.albedo.fill(0);
  acc.normal.fill(0);
  acc.floor.fill(0);
  acc.floorN = 0;
  acc.bgN = 0;
  acc.hitN = 0;
  backdrop(x / film.width, y / film.height, bg);
  const seed = pixelSeed(x, y, film.width, salt);
  let before = 0;
  let m2 = 0;
  for (let i = 0; i < spp; i++) {
    sample4(seed, 0, i, jit);
    const sx = (x + (jit[0] ?? 0.5) - cam.cx) / cam.focal;
    const sy = -(y + (jit[1] ?? 0.5) - cam.cy) / cam.focal;
    for (let k = 0; k < 3; k++)
      dir[k] = (cam.f[k] ?? 0) + (cam.r[k] ?? 0) * sx + (cam.u[k] ?? 0) * sy;
    const l = dmath.hypot(dir[0] ?? 0, dir[1] ?? 0, dir[2] ?? 0);
    for (let k = 0; k < 3; k++) dir[k] = (dir[k] ?? 0) / l;
    traceSample(w, cam.eye, dir, seed, i, p, bg, acc);
    const after = lum(acc.rad);
    m2 += (after - before) * (after - before);
    before = after;
  }
  const i = y * film.width + x;
  film.shadow[i] =
    (acc.floor[0] ?? 0) > 0 ? Math.min(1, (acc.floor[1] ?? 0) / (acc.floor[0] ?? 1)) : 1;
  film.floor[i] = acc.floorN / spp;
  film.back[i] = acc.bgN / spp;
  const hits = Math.max(1, acc.hitN);
  for (let k = 0; k < 3; k++) {
    film.color[i * 3 + k] = (acc.rad[k] ?? 0) / spp;
    film.albedo[i * 3 + k] = (acc.albedo[k] ?? 0) / hits;
    film.normal[i * 3 + k] = (acc.normal[k] ?? 0) / hits;
  }
  const mean = before / spp;
  film.variance[i] = spp > 1 ? Math.max(0, (m2 - spp * mean * mean) / (spp - 1)) / spp : 0;
  film.mask[i] = Math.round((acc.hitN / spp) * 255);
}
