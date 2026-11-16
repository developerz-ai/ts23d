// Next-event estimation: one light sample per vertex from the sun + sky pair treated as a single
// light with mixture pdf (pSun · disc + (1 − pSun) · sky table), a shadow ray through the BVH (the
// floor plane blocks everything below the horizon), and the power-heuristic MIS weight against the
// BSDF's own pdf. `escaped` is the other half: radiance a BSDF-sampled ray finds in the sky.

import { evalBsdf, type Lobes } from './bsdf.ts';
import { evalHair } from './hair.ts';
import { inDisc, type Sky, sampleSky, sampleSun, skyAt, skyPdf, sunPdf } from './sky.ts';
import { origin, type Surf } from './surf.ts';
import { floorT, type World } from './world.ts';

const wi = new Float64Array(3);
const f = new Float64Array(3);
const org = new Float64Array(3);

/** Pdf of the light mixture toward unit `d`. */
export const lightPdf = (s: Sky, d: ArrayLike<number>): number =>
  s.pSun * sunPdf(s, d) + (1 - s.pSun) * skyPdf(s, d[2] ?? 0);

/** Sky + sun radiance toward `d`, channel k. */
export const lightLe = (s: Sky, d: ArrayLike<number>, k: number): number =>
  skyAt(s, d[2] ?? 0, k) + (inDisc(s, d) ? (s.sunL[k] ?? 0) : 0);

/** f·cos and pdf of the vertex's scattering toward `dir` (hair or a lobe set). */
export function scatter(
  s: Surf,
  l: Lobes,
  hair: boolean,
  wo: ArrayLike<number>,
  dir: ArrayLike<number>,
  out: Float64Array,
): number {
  return hair ? evalHair(s.t, s.n, s.albedo, s.rough, wo, dir, out) : evalBsdf(s, l, wo, dir, out);
}

/** Power heuristic, β = 2. */
export const mis = (a: number, b: number): number => (a * a) / (a * a + b * b);

/**
 * Adds throughput × direct light at `s` (seen from `wo`) into `acc`, using samples (u0, u1, u2).
 * `vis` (optional) receives [unoccluded, occluded-aware] luminance for the floor's shadow catcher.
 */
export function directLight(
  w: World,
  s: Surf,
  l: Lobes,
  hair: boolean,
  wo: ArrayLike<number>,
  tp: ArrayLike<number>,
  u0: number,
  u1: number,
  u2: number,
  acc: Float64Array,
  vis?: Float64Array,
): void {
  const sky = w.sky;
  if (u0 < sky.pSun) sampleSun(sky, u1, u2, wi);
  else sampleSky(sky, u1, u2, wi);
  const pl = lightPdf(sky, wi);
  if (!(pl > 0)) return;
  const pb = scatter(s, l, hair, wo, wi, f);
  if (!(f[0] || f[1] || f[2])) return;
  origin(w, s, wi, org);
  const weight = mis(pl, pb) / pl;
  let un = 0;
  for (let k = 0; k < 3; k++) un += (f[k] ?? 0) * lightLe(sky, wi, k) * weight;
  if (vis) vis[0] = (vis[0] ?? 0) + un;
  const blocked = floorT(w, org, wi) < Infinity || w.bvh.occluded(org, wi, Infinity, w.shadowHit);
  if (blocked) return;
  if (vis) vis[1] = (vis[1] ?? 0) + un;
  for (let k = 0; k < 3; k++)
    acc[k] = (acc[k] ?? 0) + (tp[k] ?? 0) * (f[k] ?? 0) * lightLe(sky, wi, k) * weight;
}
