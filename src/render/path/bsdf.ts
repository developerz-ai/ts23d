// The path tracer's surface BSDF: the glTF reference model from brdf.ts (GGX D, height-correlated
// Smith V, Schlick F; the lobe's own tabulated split-sum albedo (ggx-table.ts) for the diffuse /
// specular energy split and multiple-scatter compensation) plus a clearcoat GGX lobe, as one-sample MIS over lobes: sample one (VNDF for the
// GGX lobes, cosine for diffuse), evaluate all, weight = f·cos ÷ mixture pdf. Two-sided foliage
// (diffuse reflection + diffuse transmission) lives here too; hair is hair.ts.

import { ggxD, schlick, smithV } from '../brdf.ts';
import { basis, dot3, fromLocal, toLocal } from './frame.ts';
import { ggxAlbedo } from './ggx-table.ts';
import type { Surf } from './surf.ts';

export const MODE = { pbr: 0, lambert: 1, spec: 2, foliage: 3 } as const;

/** Per-vertex lobe set, prepared from the surface and the outgoing direction. */
export interface Lobes {
  mode: number;
  readonly kd: Float64Array;
  readonly f0: Float64Array;
  readonly ms: Float64Array;
  f90: number;
  a: number;
  cc: number;
  ca: number;
  /** Lobe pick probabilities: clearcoat, specular (diffuse = rest). */
  pc: number;
  ps: number;
  /** Diffuse transmission share (foliage). */
  kt: number;
}

export const newLobes = (): Lobes => ({
  mode: 0,
  kd: new Float64Array(3),
  f0: new Float64Array(3),
  ms: new Float64Array(3),
  f90: 1,
  a: 0.5,
  cc: 0,
  ca: 0.03,
  pc: 0,
  ps: 0,
  kt: 0,
});

const ab = new Float64Array(2);

/** Plain Lambert lobes with the surface's albedo (floor, skin exit points). */
export function lambertLobes(s: Surf, l: Lobes): void {
  l.mode = MODE.lambert;
  l.kd.set(s.albedo);
  l.ms.fill(0);
  l.ps = 0;
  l.pc = 0;
  l.cc = 0;
  l.kt = 0;
}
const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Fill `l` for surface `s` seen from `wo`; `trans` = the share a see-through surface passes. */
export function prepare(s: Surf, wo: ArrayLike<number>, mode: number, trans: number, l: Lobes) {
  const look = s.look;
  const ndv = Math.max(1e-4, dot3(s.n, wo));
  const metal = s.metal;
  l.mode = mode;
  l.a = Math.max(s.rough * s.rough, 1e-3);
  l.f90 = look.specular + (1 - look.specular) * metal;
  l.cc = mode === MODE.lambert || mode === MODE.foliage ? 0 : look.clearcoat;
  l.ca = Math.max(look.clearcoatRoughness ** 2, 1e-3);
  l.kt = 0;
  ggxAlbedo(s.rough, ndv, ab);
  const A = ab[0] ?? 1;
  const B = ab[1] ?? 0;
  const fc = l.cc * schlick(0.04, 1, ndv);
  const f0i = ((look.ior - 1) / (look.ior + 1)) ** 2;
  let es = 0;
  let ed = 0;
  for (let k = 0; k < 3; k++) {
    const al = s.albedo[k] ?? 0;
    const f0d = Math.min(1, f0i * (look.specularColour[k] ?? 1)) * look.specular;
    const f0 = f0d + (al - f0d) * metal;
    const eSpec = f0 * A + l.f90 * B;
    l.f0[k] = f0;
    l.ms[k] = (1 + f0 * (1 / Math.max(1e-3, A + B) - 1)) * (1 - fc);
    if (mode === MODE.lambert || mode === MODE.foliage) {
      l.kd[k] = al;
      l.ms[k] = 0;
    } else
      l.kd[k] = mode === MODE.spec ? 0 : al * (1 - metal) * (1 - trans) * (1 - eSpec) * (1 - fc);
  }
  if (mode === MODE.foliage) l.kt = 0.3;
  es = l.ms[0] === 0 ? 0 : lum(l.f0[0] ?? 0, l.f0[1] ?? 0, l.f0[2] ?? 0) * A + l.f90 * B;
  ed = lum(l.kd[0] ?? 0, l.kd[1] ?? 0, l.kd[2] ?? 0);
  const ec = fc;
  const sum = es + ed + ec;
  l.pc = sum > 0 ? ec / sum : 0;
  l.ps = sum > 0 ? es / sum : 0;
  if (ed > 0 && l.ps + l.pc > 0.9) {
    const k = 0.9 / (l.ps + l.pc);
    l.ps *= k;
    l.pc *= k;
  }
}

/** GGX VNDF lobe value (f·cos, scalar part without F) and its sampling pdf. */
function ggx(ndl: number, ndv: number, ndh: number, a: number, out: Float64Array): void {
  const D = ggxD(ndh, a);
  out[0] = D * smithV(ndl, ndv, a) * ndl;
  const g1 = (2 * ndv) / (ndv + Math.sqrt(a * a + (1 - a * a) * ndv * ndv));
  out[1] = (D * g1) / (4 * ndv);
}

const lob = new Float64Array(2);
const h = new Float64Array(3);

/** f·|cos| into `f` for wo → wi; returns the mixture pdf (solid angle). */
export function evalBsdf(
  s: Surf,
  l: Lobes,
  wo: ArrayLike<number>,
  wi: ArrayLike<number>,
  f: Float64Array,
) {
  const ndl = dot3(s.n, wi);
  const ndv = Math.max(1e-4, dot3(s.n, wo));
  const pd = 1 - l.ps - l.pc;
  f.fill(0);
  if (l.mode === MODE.foliage) {
    const c = Math.abs(ndl) / Math.PI;
    const w = ndl > 0 ? 1 - l.kt : l.kt;
    for (let k = 0; k < 3; k++) f[k] = (l.kd[k] ?? 0) * w * c;
    return (ndl > 0 ? 1 - l.kt : l.kt) * c;
  }
  if (ndl <= 0 || dot3(s.ng, wi) <= 0) return 0;
  const cosPdf = ndl / Math.PI;
  for (let k = 0; k < 3; k++) f[k] = (l.kd[k] ?? 0) * cosPdf;
  let pdf = pd * cosPdf;
  if (l.ps <= 0 && l.pc <= 0) return pdf;
  for (let k = 0; k < 3; k++) h[k] = (wo[k] ?? 0) + (wi[k] ?? 0);
  const hl = Math.hypot(h[0] ?? 0, h[1] ?? 0, h[2] ?? 0) || 1;
  const ndh = Math.max(0, dot3(s.n, h) / hl);
  const vdh = Math.max(0, dot3(wo, h) / hl);
  if (l.ps > 0) {
    ggx(ndl, ndv, ndh, l.a, lob);
    for (let k = 0; k < 3; k++)
      f[k] = (f[k] ?? 0) + (lob[0] ?? 0) * schlick(l.f0[k] ?? 0, l.f90, vdh) * (l.ms[k] ?? 0);
    pdf += l.ps * (lob[1] ?? 0);
  }
  if (l.pc > 0) {
    ggx(ndl, ndv, ndh, l.ca, lob);
    const c = (lob[0] ?? 0) * l.cc * schlick(0.04, 1, vdh);
    for (let k = 0; k < 3; k++) f[k] = (f[k] ?? 0) + c;
    pdf += l.pc * (lob[1] ?? 0);
  }
  return pdf;
}

const loc = new Float64Array(3);
const m = new Float64Array(3);

/** Heitz 2018 visible-normal sample (local frame, z = normal) into `m`. */
function vndf(vx: number, vy: number, vz: number, a: number, u1: number, u2: number): void {
  let hx = a * vx;
  let hy = a * vy;
  let hz = vz;
  const hl = Math.hypot(hx, hy, hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const len = hx * hx + hy * hy;
  const t1x = len > 0 ? -hy / Math.sqrt(len) : 1;
  const t1y = len > 0 ? hx / Math.sqrt(len) : 0;
  const t2x = -hz * t1y;
  const t2y = hz * t1x;
  const t2z = hx * t1y - hy * t1x;
  const r = Math.sqrt(u1);
  const phi = 2 * Math.PI * u2;
  const p1 = r * Math.cos(phi);
  const s = 0.5 * (1 + hz);
  const p2 = (1 - s) * Math.sqrt(1 - p1 * p1) + s * r * Math.sin(phi);
  const p3 = Math.sqrt(Math.max(0, 1 - p1 * p1 - p2 * p2));
  const nx = p1 * t1x + p2 * t2x + p3 * hx;
  const ny = p1 * t1y + p2 * t2y + p3 * hy;
  const nz = p2 * t2z + p3 * hz;
  const x = a * nx;
  const y = a * ny;
  const z = Math.max(1e-6, nz);
  const l = Math.hypot(x, y, z);
  m[0] = x / l;
  m[1] = y / l;
  m[2] = z / l;
}

/** Sample wi with (u0, u1, u2); `w` = f·cos ÷ pdf. Returns the pdf (0 = no sample). */
export function sampleBsdf(
  s: Surf,
  l: Lobes,
  wo: ArrayLike<number>,
  u0: number,
  u1: number,
  u2: number,
  wi: Float64Array,
  w: Float64Array,
): number {
  basis(s.n);
  if (l.mode === MODE.foliage) {
    const r = Math.sqrt(u1);
    loc[0] = r * Math.cos(2 * Math.PI * u2);
    loc[1] = r * Math.sin(2 * Math.PI * u2);
    loc[2] = Math.sqrt(Math.max(0, 1 - u1)) * (u0 < l.kt ? -1 : 1);
    fromLocal(loc, wi);
  } else {
    toLocal(wo, loc);
    if (u0 < l.pc + l.ps) {
      vndf(loc[0] ?? 0, loc[1] ?? 0, Math.max(1e-4, loc[2] ?? 0), u0 < l.pc ? l.ca : l.a, u1, u2);
      const d =
        2 *
        ((loc[0] ?? 0) * (m[0] ?? 0) + (loc[1] ?? 0) * (m[1] ?? 0) + (loc[2] ?? 0) * (m[2] ?? 0));
      for (let k = 0; k < 3; k++) loc[k] = d * (m[k] ?? 0) - (loc[k] ?? 0);
    } else {
      const r = Math.sqrt(u1);
      loc[0] = r * Math.cos(2 * Math.PI * u2);
      loc[1] = r * Math.sin(2 * Math.PI * u2);
      loc[2] = Math.sqrt(Math.max(0, 1 - u1));
    }
    fromLocal(loc, wi);
  }
  const pdf = evalBsdf(s, l, wo, wi, w);
  if (!(pdf > 1e-9)) return 0;
  for (let k = 0; k < 3; k++) w[k] = (w[k] ?? 0) / pdf;
  return pdf;
}
