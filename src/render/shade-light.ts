// Lighting one reconstructed surface sample with the glTF reference BRDF: sun (GGX D + height-
// correlated Smith V + Schlick F, anisotropic when the look asks), studio environment through
// Karis' split-sum fit with multiple-scattering compensation, energy-conserving diffuse, and the
// KHR_materials_* layers: specular, iridescence (thin film), sheen (Charlie), clearcoat (second
// GGX lobe on the geometric normal) and transmission (tint + Beer–Lambert + refraction offset).

import {
  charlieD,
  envBrdf,
  ggxAnisoD,
  ggxD,
  refract,
  schlick,
  sheenAlbedo,
  sheenV,
  smithV,
  thinFilm,
} from './brdf.ts';
import type { PerspectiveCamera } from './camera.ts';
import { project } from './camera.ts';
import { envRadiance, type Rig } from './lighting.ts';
import type { Look } from './looks.ts';

/** A reconstructed sample: filled by shade.ts, read here. Unit vectors unless noted. */
export interface Surf {
  readonly pos: number[];
  /** Shading normal (normal-mapped). */
  readonly n: number[];
  /** Interpolated geometric normal (clearcoat uses it). */
  readonly geo: number[];
  /** Towards the eye. */
  readonly v: number[];
  /** Tangent / bitangent of the triangle; t[0..2] all zero = no frame. */
  readonly t: number[];
  readonly b: number[];
  readonly albedo: number[];
  occ: number;
  rough: number;
  metal: number;
  /** Sun visibility × n·l (0 in shadow), sky openness. */
  lit: number;
  open: number;
}

/** Smallest α the sun lobe uses: a studio key is a soft box, not a point. */
const SUN_ALPHA = 0.03;
const ab = new Float64Array(2);
const abc = new Float64Array(2);
const tr = [0, 0, 0];
const dot = (a: readonly number[], b: readonly number[]): number =>
  (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

/**
 * Radiance of `s` lit by `r` into out[0..2]. For a see-through look, `through` receives the
 * transmitted tint per channel and the screen offset (px) of what shows behind: [r, g, b, dx, dy].
 */
export function lightSurf(
  s: Surf,
  look: Look,
  r: Rig,
  cam: PerspectiveCamera,
  out: Float32Array,
  through?: Float32Array,
): void {
  const { n, v, geo, albedo } = s;
  const L = r.sun;
  const ndv = Math.max(1e-4, dot(n, v));
  const ndl = Math.max(0, dot(n, L));
  let hx = L[0] + (v[0] ?? 0);
  let hy = L[1] + (v[1] ?? 0);
  let hz = L[2] + (v[2] ?? 0);
  const hl = Math.hypot(hx, hy, hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const h = [hx, hy, hz];
  const ndh = Math.max(0, dot(n, h));
  const vdh = Math.max(0, dot(v, h));
  const rough = s.rough;
  const a = Math.max(rough * rough, SUN_ALPHA);
  // Anisotropy: tangent rotated in the surface plane, α stretched along it (glTF: mix(α, 1, s²)).
  const aniso = look.anisotropy > 0 && (s.t[0] !== 0 || s.t[1] !== 0 || s.t[2] !== 0);
  let D: number;
  let bent = n;
  if (aniso) {
    const c = Math.cos(look.anisotropyRotation);
    const sn = Math.sin(look.anisotropyRotation);
    const td = [0, 1, 2].map((k) => c * (s.t[k] ?? 0) + sn * (s.b[k] ?? 0));
    const tn = dot(td, n);
    const tt = td.map((x, k) => x - tn * (n[k] ?? 0));
    const tl = Math.hypot(tt[0] ?? 0, tt[1] ?? 0, tt[2] ?? 0) || 1;
    const T = tt.map((x) => x / tl);
    const B = [
      (n[1] ?? 0) * (T[2] ?? 0) - (n[2] ?? 0) * (T[1] ?? 0),
      (n[2] ?? 0) * (T[0] ?? 0) - (n[0] ?? 0) * (T[2] ?? 0),
      (n[0] ?? 0) * (T[1] ?? 0) - (n[1] ?? 0) * (T[0] ?? 0),
    ];
    const at = Math.max(a, a + (1 - a) * look.anisotropy * look.anisotropy);
    D = ggxAnisoD(ndh, dot(T, h), dot(B, h), at, a);
    // Filament's bent reflection normal: highlights stretch across the brushing direction.
    const ax = [
      (B[1] ?? 0) * (v[2] ?? 0) - (B[2] ?? 0) * (v[1] ?? 0),
      (B[2] ?? 0) * (v[0] ?? 0) - (B[0] ?? 0) * (v[2] ?? 0),
      (B[0] ?? 0) * (v[1] ?? 0) - (B[1] ?? 0) * (v[0] ?? 0),
    ];
    const an = [
      (ax[1] ?? 0) * (B[2] ?? 0) - (ax[2] ?? 0) * (B[1] ?? 0),
      (ax[2] ?? 0) * (B[0] ?? 0) - (ax[0] ?? 0) * (B[2] ?? 0),
      (ax[0] ?? 0) * (B[1] ?? 0) - (ax[1] ?? 0) * (B[0] ?? 0),
    ];
    const w = look.anisotropy * (1 - rough * 0.5);
    const mixed = n.map((x, k) => x + ((an[k] ?? 0) - x) * w);
    const ml = Math.hypot(mixed[0] ?? 0, mixed[1] ?? 0, mixed[2] ?? 0) || 1;
    bent = mixed.map((x) => x / ml);
  } else D = ggxD(ndh, a);
  const V = smithV(ndl, ndv, a);
  const bdv = Math.max(1e-4, dot(bent, v));
  const rz = 2 * bdv * (bent[2] ?? 0) - (v[2] ?? 0);
  envBrdf(rough, ndv, ab);
  const A = ab[0] ?? 1;
  const Bb = ab[1] ?? 0;
  const metal = s.metal;
  const trans = look.transmission * (1 - metal);
  const f0i = ((look.ior - 1) / (look.ior + 1)) ** 2;
  const f90 = look.specular + (1 - look.specular) * metal;
  const hemi = 0.5 + 0.5 * (n[2] ?? 0);
  const amb = s.open * (0.35 + 0.65 * s.occ);
  const specOcc = s.open * (0.4 + 0.6 * s.occ);
  const sheenMax = Math.max(look.sheen[0], look.sheen[1], look.sheen[2]);
  const sr = look.sheenRoughness;
  const sheenD = sheenMax > 0 ? charlieD(ndh, Math.max(0.07, sr * sr)) * sheenV(ndl, ndv) : 0;
  const sheenScale = 1 - sheenMax * sheenAlbedo(ndv, sr);
  // Clearcoat: its own lobe on the geometric normal, F0 0.04, dimming everything under it.
  const cc = look.clearcoat;
  const gdv = Math.max(1e-4, dot(geo, v));
  const gdh = Math.max(0, dot(geo, h));
  const gdl = Math.max(0, dot(geo, L));
  const ccr = look.clearcoatRoughness;
  const ca = Math.max(ccr * ccr, SUN_ALPHA * 0.5);
  const fc = cc > 0 ? cc * schlick(0.04, 1, gdv) : 0;
  envBrdf(ccr, gdv, abc);
  const grz = 2 * gdv * (geo[2] ?? 0) - (v[2] ?? 0);
  const ccSun = cc > 0 ? ggxD(gdh, ca) * smithV(gdl, gdv, ca) * Math.PI * (s.lit > 0 ? gdl : 0) : 0;
  const ccEnvW = cc * (0.04 * (abc[0] ?? 1) + (abc[1] ?? 0)) * specOcc;
  const sunSpec = D * V * Math.PI * s.lit;
  for (let k = 0; k < 3; k++) {
    const al = albedo[k] ?? 0;
    const f0d = Math.min(1, f0i * (look.specularColour[k] ?? 1)) * look.specular;
    let f0 = f0d + (al - f0d) * metal;
    if (look.iridescence > 0) {
      const film = thinFilm(k, look.iridescenceIor, look.iridescenceThickness, f0, ndv);
      f0 += (film - f0) * look.iridescence;
    }
    const Fs = schlick(f0, f90, vdh);
    const sun = r.sunColor[k] ?? 0;
    const sky = (r.bounce[k] ?? 0) * (1 - hemi) + (r.sky[k] ?? 0) * hemi;
    const eSpec = f0 * A + f90 * Bb;
    const ms = 1 + f0 * (1 / Math.max(1e-3, A + Bb) - 1);
    const diffuse = al * (1 - metal) * (1 - trans) * (1 - eSpec) * (sun * s.lit + sky * amb);
    const spec = Fs * sunSpec * sun;
    const env = envRadiance(rz, rough, k) * eSpec * ms * specOcc;
    const sheen =
      (look.sheen[k] ?? 0) * (sheenD * Math.PI * s.lit * sun + sheenAlbedo(ndv, sr) * sky * amb);
    const base = (diffuse + spec + env) * sheenScale + sheen;
    const coat = cc > 0 ? cc * 0.04 * ccSun * sun + ccEnvW * envRadiance(grz, ccr, k) : 0;
    out[k] = (base * (1 - fc) + coat) * r.exposure;
    // Transmitted share: base colour tint × Beer–Lambert over the volume, minus what reflects.
    tr[k] = trans * (1 - eSpec) * (1 - fc) * al * Math.exp(-(look.absorb[k] ?? 0) * look.thickness);
  }
  if (!through) return;
  through[0] = tr[0] ?? 0;
  through[1] = tr[1] ?? 0;
  through[2] = tr[2] ?? 0;
  through[3] = 0;
  through[4] = 0;
  if (trans <= 0 || look.thickness <= 0) return;
  // Screen-space refraction: where the bent view ray leaves a slab of the look's thickness.
  const i = [-(v[0] ?? 0), -(v[1] ?? 0), -(v[2] ?? 0)];
  const t: number[] = [0, 0, 0];
  if (!refract(i, n, 1 / look.ior, t)) return;
  const p = s.pos;
  const d = look.thickness;
  const a0 = project(cam, p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
  const a1 = project(
    cam,
    (p[0] ?? 0) + ((t[0] ?? 0) - (i[0] ?? 0)) * d,
    (p[1] ?? 0) + ((t[1] ?? 0) - (i[1] ?? 0)) * d,
    (p[2] ?? 0) + ((t[2] ?? 0) - (i[2] ?? 0)) * d,
  );
  through[3] = a1[0] - a0[0];
  through[4] = a1[1] - a0[1];
}
