// `pathHero(asset, o)`: the physically based hero shot. Same camera, framing and studio as the
// raster beauty render (beauty.ts: cameraFor, studioRig; backdrop + floor shadow catcher), lit by
// a path tracer instead: sun + sky importance sampled, multiple bounces, skin diffusion, strand
// lobes on fur cards. Then the variance-guided à-trous denoise, the shared tone curve and sRGB. Deterministic:
// same asset + options → same bytes on one thread or many (sampler seeded per pixel, film slots
// owned per pixel, no clocks).

import { type CompiledAsset, encodePng, Ts23dError } from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { checkSheetFor, DEFAULT_SHEET, sheetFor } from '../../material/index.ts';
import { type BeautyOptions, cameraFor } from '../beauty.ts';
import { studioRig, tone, toSrgb8 } from '../lighting.ts';
import { checkBeautyOptions, withHeroView } from '../options.ts';
import { sheetTextures } from '../texture.ts';
import { denoise, denoiseShadow } from './denoise.ts';
import { compose, type Film, newFilm, spatialVariance } from './film.ts';
import { renderThreads, runJob, shareFilm, shareWorld } from './parallel.ts';
import { makeSky, type Sky } from './sky.ts';
import { worldData } from './world.ts';

export interface PathOptions extends Omit<BeautyOptions, 'supersample'> {
  /** Samples per pixel (1–4096). Default 64. */
  readonly spp?: number;
  /** Bounces after the first hit (1–32). Default 6. */
  readonly maxDepth?: number;
  /** Run the à-trous denoise. Default true. */
  readonly denoise?: boolean;
  /** Seed salt: another value gives another (equally valid) noise pattern. Default 0. */
  readonly seed?: number;
  /** Replace the studio sun + sky (tests: a white furnace). */
  readonly sky?: Sky;
  /** Studio floor (bounce light + shadow catcher). Default: true, false for a water asset. */
  readonly floor?: boolean;
}

export interface PathRender {
  readonly width: number;
  readonly height: number;
  /** RGBA8, sRGB, opaque. */
  readonly rgba: Uint8Array;
  /** Asset coverage per pixel, 0–255. */
  readonly mask: Uint8Array;
  /** Linear radiance before tone mapping, 3 per pixel (after denoise when on). */
  readonly linear: Float32Array;
}

/**
 * The committed hero (`bun run shots`) and the critique pack's hero.png: one setting, so the
 * hashes a critique binds to match. 16 spp + denoise keeps the CI shots shard in budget
 * (measurements in scripts/shots.ts).
 */
export const HERO_PATH = { width: 960, height: 540, spp: 16 } as const;

const DEFAULT_2048 = { ...DEFAULT_SHEET, size: 2048 } as const;

function whole(name: string, v: number, lo: number, hi: number, fix: string): number {
  if (!(Number.isInteger(v) && v >= lo && v <= hi))
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `${name} ${v} is not a whole number in ${lo}…${hi}`,
      fix,
    });
  return v;
}

/** Everything a render needs before tracing: validated options, camera, world data, film. */
function setup(asset: CompiledAsset, opts: PathOptions) {
  const o = withHeroView(asset.hero, opts);
  const v = checkBeautyOptions(o);
  const spp = whole('spp', o.spp ?? 64, 1, 4096, 'pass --spp 64 (16 drafts, 256 finals)');
  const maxDepth = whole('maxDepth', o.maxDepth ?? 6, 1, 32, 'use maxDepth: 6');
  const sheet: PaintedSheet = o.sheet ?? sheetFor(asset, DEFAULT_2048);
  checkSheetFor(sheet, asset);
  const cam = cameraFor(asset, o);
  const rig = studioRig(v.azDeg);
  // The raster rig's numbers are irradiance ÷ π (its pixel = albedo × light): × π for radiometry.
  const sunColor = rig.sunColor.map((c) => c * Math.PI) as typeof rig.sunColor;
  const sky = o.sky ?? makeSky({ sun: rig.sun, sunColor });
  const floor = o.floor ?? asset.medium !== 'water';
  const data = worldData(asset, cam, sheetTextures(sheet), { sky, floor });
  const job = {
    data,
    cam,
    film: newFilm(v.width, v.height),
    spp,
    params: { maxDepth, rrDepth: 3 },
    salt: o.seed ?? 0,
  };
  return job;
}

/** Denoise, tone-map and encode the traced film (`spp` samples per pixel). */
function develop(film: Film, o: PathOptions, spp: number): PathRender {
  const on = o.denoise !== false;
  // One sample per pixel measures no variance of its own: a spatial estimate stands in.
  const guide = spp > 1 ? film : { ...film, variance: spatialVariance(film) };
  const color = on ? denoise(guide) : film.color;
  const shadow = on ? denoiseShadow(film.width, film.height, film.shadow, film.floor) : film.shadow;
  const linear = compose(film, color, shadow);
  const n = film.width * film.height;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = toSrgb8(tone(linear[i * 3] ?? 0));
    rgba[i * 4 + 1] = toSrgb8(tone(linear[i * 3 + 1] ?? 0));
    rgba[i * 4 + 2] = toSrgb8(tone(linear[i * 3 + 2] ?? 0));
    rgba[i * 4 + 3] = 255;
  }
  return { width: film.width, height: film.height, rgba, mask: film.mask, linear };
}

/** Path trace on this thread. */
export function renderPath(asset: CompiledAsset, o: PathOptions = {}): PathRender {
  const job = setup(asset, o);
  runJob({ ...job, counter: new Int32Array(1) });
  return develop(job.film, o, job.spp);
}

/** Path trace on `threads` workers (default: the machine's cores, at most 8); same bytes. */
export async function renderPathThreaded(
  asset: CompiledAsset,
  o: PathOptions & { readonly threads?: number } = {},
): Promise<PathRender> {
  const job = setup(asset, o);
  const film = shareFilm(job.film);
  const cores = typeof navigator === 'undefined' ? 1 : (navigator.hardwareConcurrency ?? 1);
  await renderThreads(
    { ...job, data: shareWorld(job.data), film },
    o.threads ?? Math.min(8, cores),
  );
  return develop(film, o, job.spp);
}

/** The path-traced hero as PNG bytes. */
export function pathHero(asset: CompiledAsset, o: PathOptions = {}): Uint8Array {
  const r = renderPath(asset, o);
  return encodePng(r.width, r.height, r.rgba);
}

/** The path-traced hero as PNG bytes, traced on worker threads (the CLI's `--quality path`). */
export async function pathHeroThreaded(
  asset: CompiledAsset,
  o: PathOptions & { readonly threads?: number } = {},
): Promise<Uint8Array> {
  const r = await renderPathThreaded(asset, o);
  return encodePng(r.width, r.height, r.rgba);
}
