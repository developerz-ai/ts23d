// Unidirectional path tracing of one camera sample: closest hit (cutout cards alpha-tested), the
// studio floor as a Lambert plane for bounce light and as a shadow catcher for camera rays, next-
// event estimation + MIS at every vertex (nee.ts), lobe sampling by surface class (glTF PBR, hair,
// foliage, skin with Burley diffusion), Russian roulette from a fixed depth with the sampler's own
// dimension. A thin see-through surface splits: its reflected sun and sky are added at every
// crossing, and only the path's way on (through or off) is a coin toss. `glow` parts emit. Every
// random number comes from sampler.ts: same pixel, same bytes.

import { dmath } from '../../core/index.ts';
import { lambertLobes, MODE, newLobes, prepare, sampleBsdf } from './bsdf.ts';
import { type Hit, newHit } from './bvh.ts';
import { CLS } from './classes.ts';
import { sampleSphere } from './hair.ts';
import { directLight, escapedLight, lightLe, lightPdf, mis, scatter } from './nee.ts';
import { sample4 } from './sampler.ts';
import { probeExit } from './sss.ts';
import { newSurf, origin, type Surf, surfAt } from './surf.ts';
import { floorT, type World } from './world.ts';

/** One pixel's accumulators across its samples. */
export interface Accum {
  /** Radiance carried by paths that hit the asset (or see through it). */
  readonly rad: Float64Array;
  /** First-hit albedo and normal (denoiser guides), summed. */
  readonly albedo: Float64Array;
  readonly normal: Float64Array;
  /** Shadow catcher: [unoccluded, visible] direct light at camera-seen floor points. */
  readonly floor: Float64Array;
  /** Samples that saw the floor, the backdrop, the asset. */
  floorN: number;
  bgN: number;
  hitN: number;
}

export interface TraceParams {
  readonly maxDepth: number;
  readonly rrDepth: number;
}

const hit: Hit = newHit();
const exitHit: Hit = newHit();
const s: Surf = newSurf();
const lobes = newLobes();
const o = new Float64Array(3);
const d = new Float64Array(3);
const wo = new Float64Array(3);
const tp = new Float64Array(3);
const wt = new Float64Array(3);
const u = new Float64Array(4);
const v = new Float64Array(4);
const q = new Float64Array(4);
const po = new Float64Array(3);
const pd = new Float64Array(3);
const sw = new Float64Array(3);
const vis = new Float64Array(2);
const add = new Float64Array(3);
const rd = new Float64Array(3);

/** thinVertex's answer when the path goes straight on through the surface. */
const THROUGH = -1;

/**
 * Indirect light is clamped to this luminance per sample: a rare BSDF-sampled path into the sun
 * (a firefly) would otherwise survive the denoise as a white speck. Direct light is never clamped.
 */
const CLAMP = 4;

function addClamped(acc: Float64Array, c: Float64Array, depth: number): void {
  const l = 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  const k = depth > 0 && l > CLAMP ? CLAMP / l : 1;
  for (let i = 0; i < 3; i++) acc[i] = (acc[i] ?? 0) + (c[i] ?? 0) * k;
}

function floorSurf(w: World, t: number): void {
  for (let k = 0; k < 3; k++) s.p[k] = (o[k] ?? 0) + (d[k] ?? 0) * t;
  s.ng.set([0, 0, 1]);
  s.n.set([0, 0, 1]);
  s.t.fill(0);
  s.albedo.fill(w.floorAlbedo);
  s.cls = CLS.pbr;
  s.tri = -1;
}

/** Trace camera ray (eye, dir) for sample `index` of pixel `seed`; adds into `a`. */
export function traceSample(
  w: World,
  eye: ArrayLike<number>,
  dir: ArrayLike<number>,
  seed: number,
  index: number,
  p: TraceParams,
  bg: ArrayLike<number>,
  a: Accum,
): void {
  o.set(eye as Float64Array);
  d.set(dir as Float64Array);
  tp.fill(1);
  let prevPdf = 0;
  // Still on the camera's straight line (only see-through surfaces so far): shows the backdrop.
  let primary = true;
  // The last scattering was a thin surface's reflection, which added its own sun and sky.
  let counted = false;
  for (let depth = 0; depth <= p.maxDepth; depth++) {
    const g = 1 + depth * 3;
    const tf = floorT(w, o, d);
    const any = w.bvh.closest(o, d, tf, hit, w.camHit);
    for (let k = 0; k < 3; k++) wo[k] = -(d[k] ?? 0);
    if (!any && tf === Infinity) {
      if (depth === 0) a.bgN++;
      else if (primary)
        for (let k = 0; k < 3; k++) a.rad[k] = (a.rad[k] ?? 0) + (tp[k] ?? 0) * (bg[k] ?? 0);
      else if (!counted) {
        const wgt = prevPdf > 0 ? mis(prevPdf, lightPdf(w.sky, d)) : 1;
        for (let k = 0; k < 3; k++) add[k] = (tp[k] ?? 0) * lightLe(w.sky, d, k) * wgt;
        addClamped(a.rad, add, depth);
      }
      return;
    }
    sample4(seed, g, index, u);
    if (!any) {
      floorSurf(w, tf);
      lambertLobes(s, lobes);
      if (depth === 0) {
        a.floorN++;
        directLight(w, s, lobes, false, wo, tp, u[0] ?? 0, u[1] ?? 0, u[2] ?? 0, wt, a.floor);
        return;
      }
      if (primary) {
        vis.fill(0);
        directLight(w, s, lobes, false, wo, tp, u[0] ?? 0, u[1] ?? 0, u[2] ?? 0, wt, vis);
        const ratio = (vis[0] ?? 0) > 0 ? (vis[1] ?? 0) / (vis[0] ?? 1) : 1;
        for (let k = 0; k < 3; k++)
          a.rad[k] = (a.rad[k] ?? 0) + (tp[k] ?? 0) * (bg[k] ?? 0) * ratio;
        return;
      }
    } else {
      surfAt(w, hit, o, d, s);
      // A `glow` part emits: seen directly, through see-through surfaces (tinted by `tp`), and as
      // a light for its neighbours when a bounce lands on it (BSDF sampled, clamped like any
      // indirect light; the sun and sky stay the only lights sampled directly).
      const lit = ((w.scene.glow[hit.tri] ?? 0) - 1) * 3;
      if (lit >= 0) {
        for (let k = 0; k < 3; k++) add[k] = (tp[k] ?? 0) * (w.scene.glows[lit + k] ?? 0);
        addClamped(a.rad, add, primary ? 0 : depth);
      }
      if (depth === 0) {
        a.hitN++;
        for (let k = 0; k < 3; k++) {
          a.albedo[k] = (a.albedo[k] ?? 0) + (s.albedo[k] ?? 0);
          a.normal[k] = (a.normal[k] ?? 0) + (s.n[k] ?? 0);
        }
      }
      sample4(seed, g + 2, index, q);
      shapeVertex(w, q);
    }
    sample4(seed, g + 1, index, v);
    const thin = any && s.cls === CLS.thin;
    const hair = s.cls === CLS.hair && lobes.mode !== MODE.lambert;
    let pdf = 0;
    if (thin) {
      pdf = thinVertex(w, a.rad, depth);
      // Straight on: the light sampled at the vertex before still owns this direction (prevPdf).
      if (pdf === THROUGH) continue;
    } else {
      add.fill(0);
      directLight(w, s, lobes, hair, wo, tp, u[0] ?? 0, u[1] ?? 0, u[2] ?? 0, add);
      addClamped(a.rad, add, depth);
    }
    primary = false;
    counted = thin;
    if (thin) d.set(rd);
    else if (hair) {
      pdf = sampleSphere(v[1] ?? 0, v[2] ?? 0, d);
      scatter(s, lobes, true, wo, d, wt);
      for (let k = 0; k < 3; k++) wt[k] = (wt[k] ?? 0) / pdf;
    } else pdf = sampleBsdf(s, lobes, wo, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, d, wt);
    if (!(pdf > 0)) return;
    let peak = 0;
    for (let k = 0; k < 3; k++) {
      tp[k] = (tp[k] ?? 0) * (wt[k] ?? 0);
      peak = Math.max(peak, tp[k] ?? 0);
    }
    if (depth >= p.rrDepth) {
      const keep = Math.min(0.95, peak);
      if ((v[3] ?? 0) >= keep) return;
      for (let k = 0; k < 3; k++) tp[k] = (tp[k] ?? 0) / keep;
    }
    origin(w, s, d, o);
    prevPdf = pdf;
  }
}

/**
 * A thin see-through surface (glass, liquid, ice…), split in two. Its reflected sun and sky are
 * added here at every crossing, by a light sample and a lobe sample, each weighted by the
 * surface's own Fresnel term: choosing the reflection lobe by chance instead (4 % of samples
 * face-on, weighted × 25) returned the key light's mirror image as lone white pixels (D401). Only
 * the way on is chosen: THROUGH (throughput tinted, `d` unchanged, `o` behind the surface), or off
 * the surface along `rd` with weight `wt` (the pdf is returned; 0 ends the path).
 */
function thinVertex(w: World, rad: Float64Array, depth: number): number {
  const look = s.look;
  const trans = look.transmission * (1 - s.metal);
  prepare(s, wo, MODE.pbr, trans, lobes);
  const rIor = (look.ior - 1) / (look.ior + 1);
  const f0 = rIor * rIor;
  const c = Math.max(
    0,
    Math.min(
      1,
      (s.n[0] ?? 0) * (wo[0] ?? 0) + (s.n[1] ?? 0) * (wo[1] ?? 0) + (s.n[2] ?? 0) * (wo[2] ?? 0),
    ),
  );
  const m2 = (1 - c) * (1 - c);
  const pT = trans * (1 - (f0 + (1 - f0) * (m2 * m2 * (1 - c))));
  add.fill(0);
  directLight(w, s, lobes, false, wo, tp, u[0] ?? 0, u[1] ?? 0, u[2] ?? 0, add);
  const pdf = sampleBsdf(s, lobes, wo, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, rd, wt);
  if (pdf > 0) escapedLight(w, s, rd, wt, pdf, tp, add);
  addClamped(rad, add, depth);
  if ((q[0] ?? 0) < pT) {
    for (let k = 0; k < 3; k++) {
      tp[k] =
        (tp[k] ?? 0) * (s.albedo[k] ?? 0) * dmath.exp(-(look.absorb[k] ?? 0) * look.thickness);
      o[k] = (s.p[k] ?? 0) - (s.ng[k] ?? 0) * w.eps;
    }
    return THROUGH;
  }
  for (let k = 0; k < 3; k++) wt[k] = (wt[k] ?? 0) / (1 - pT);
  return pdf;
}

/**
 * Pick the vertex's lobes by surface class (random numbers `r`); thin surfaces are thinVertex's.
 * Skin may move `s` to its exit point.
 */
function shapeVertex(w: World, r: Float64Array): void {
  if (s.cls === CLS.thin) return;
  if (s.cls === CLS.hair) {
    lobes.mode = MODE.pbr;
    return;
  }
  if (s.cls === CLS.foliage) {
    prepare(s, wo, MODE.foliage, 0, lobes);
    return;
  }
  prepare(s, wo, MODE.pbr, 0, lobes);
  if (s.cls !== CLS.skin) return;
  // Skin: the specular lobes at the entry point, or Burley diffusion to an exit point.
  const pSpec = lobes.ps + lobes.pc;
  if ((r[0] ?? 0) < pSpec) {
    prepare(s, wo, MODE.spec, 0, lobes);
    for (let k = 0; k < 3; k++) tp[k] = (tp[k] ?? 0) / pSpec;
    return;
  }
  const keep = 1 - pSpec;
  for (let k = 0; k < 3; k++) {
    const al = s.albedo[k] ?? 0;
    // kd = albedo·(1 − E_spec): the diffuse share left after the specular reflection.
    wt[k] = al > 1e-6 ? (lobes.kd[k] ?? 0) / al : 0;
  }
  const r1 = (r[1] ?? 0) * 3;
  const ch = Math.floor(r1);
  const side = probeExit(w, s, (ch + 0.5) / 3, r1 - ch, r[2] ?? 0, r[3] ?? 0, exitHit, po, pd, sw);
  if (side !== 0) {
    for (let k = 0; k < 3; k++) tp[k] = ((tp[k] ?? 0) * (wt[k] ?? 0) * (sw[k] ?? 0)) / keep;
    surfAt(w, exitHit, po, pd, s);
    // The far face of a thin part: surfAt turned its normals to the probe (inward); out again.
    if (side < 0)
      for (let k = 0; k < 3; k++) {
        s.n[k] = -(s.n[k] ?? 0);
        s.ng[k] = -(s.ng[k] ?? 0);
      }
    for (let k = 0; k < 3; k++) wo[k] = s.n[k] ?? 0;
  } else
    for (let k = 0; k < 3; k++) tp[k] = ((tp[k] ?? 0) * (wt[k] ?? 0) * (s.albedo[k] ?? 0)) / keep;
  s.albedo.fill(1);
  lambertLobes(s, lobes);
}
