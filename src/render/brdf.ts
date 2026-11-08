// The glTF 2.0 reference BRDF pieces (Appendix B) as scalar functions for the beauty render:
// GGX / Trowbridge-Reitz D (isotropic and anisotropic), height-correlated Smith visibility,
// Schlick Fresnel, Karis' analytic split-sum environment fit (no LUT), the Charlie sheen lobe
// with Neubelt visibility, and a two-beam thin-film reflectance for iridescence. Pure maths.

const PI = Math.PI;

/** GGX normal distribution, α = roughness². */
export function ggxD(ndh: number, a: number): number {
  const a2 = a * a;
  const d = ndh * ndh * (a2 - 1) + 1;
  return a2 / (PI * d * d);
}

/** Anisotropic GGX (Burley): tdh/bdh = h·tangent/bitangent, at/ab = α along each. */
export function ggxAnisoD(ndh: number, tdh: number, bdh: number, at: number, ab: number): number {
  const x = tdh / at;
  const y = bdh / ab;
  const d = x * x + y * y + ndh * ndh;
  return 1 / (PI * at * ab * d * d);
}

/** Height-correlated Smith visibility V = G / (4 n·l n·v). */
export function smithV(ndl: number, ndv: number, a: number): number {
  const a2 = a * a;
  const gv = ndl * Math.sqrt(ndv * ndv * (1 - a2) + a2);
  const gl = ndv * Math.sqrt(ndl * ndl * (1 - a2) + a2);
  const s = gv + gl;
  return s > 0 ? 0.5 / s : 0;
}

/** Schlick Fresnel from F0 to F90 at cosine `c`. */
export const schlick = (f0: number, f90: number, c: number): number =>
  f0 + (f90 - f0) * (1 - Math.max(0, Math.min(1, c))) ** 5;

/**
 * Karis' EnvBRDFApprox: the split-sum scale A and bias B for (roughness, n·v), so pre-filtered
 * environment × (F0·A + B) approximates the GGX integral. Writes [A, B] into `out`.
 */
export function envBrdf(rough: number, ndv: number, out: Float64Array): void {
  const rx = rough * -1 + 1;
  const ry = rough * -0.0275 + 0.0425;
  const rz = rough * -0.572 + 1.04;
  const rw = rough * 0.022 - 0.04;
  const a004 = Math.min(rx * rx, 2 ** (-9.28 * ndv)) * rx + ry;
  out[0] = a004 * -1.04 + rz;
  out[1] = a004 * 1.04 + rw;
}

/** Charlie sheen distribution (Estevez & Kulla 2017), α = sheen roughness². */
export function charlieD(ndh: number, a: number): number {
  const inv = 1 / Math.max(a, 1e-3);
  const sin2 = Math.max(0, 1 - ndh * ndh);
  return ((2 + inv) * sin2 ** (0.5 * inv)) / (2 * PI);
}

/** Neubelt-Pettineo sheen visibility. */
export const sheenV = (ndl: number, ndv: number): number =>
  1 / Math.max(1e-4, 4 * (ndl + ndv - ndl * ndv));

/** Directional albedo of the sheen lobe (fit): how much light the fuzz takes from the base. */
export const sheenAlbedo = (ndv: number, rough: number): number =>
  Math.min(1, 0.06 + 0.5 * rough * (1 - ndv) ** 2 + 0.12 * (1 - ndv) ** 4);

/** Wavelengths (nm) the preview evaluates thin films at: R, G, B. */
const LAMBDA = [650, 532, 450];

/**
 * Two-beam thin-film reflectance for channel `k`: a film of index `n` and `thickness` nm over a
 * base whose normal-incidence reflectance is `r2`, seen at cosine `c`. Interference between the
 * top-surface and base reflections gives the heat-tint / oil-slick colour shift.
 */
export function thinFilm(k: number, n: number, thickness: number, r2: number, c: number): number {
  const r1 = ((n - 1) / (n + 1)) ** 2;
  const sin2 = (1 - c * c) / (n * n);
  const ct = Math.sqrt(Math.max(0, 1 - sin2));
  const phase = (4 * PI * n * thickness * ct) / (LAMBDA[k] ?? 550) + PI;
  const t = 1 - r1;
  const amp = r1 + r2 * t * t + 2 * Math.sqrt(r1 * r2) * t * Math.cos(phase);
  return Math.max(0, Math.min(1, amp));
}

/** Refract unit incident `i` (towards the surface) through unit normal `n`, eta = n1/n2. */
export function refract(
  i: readonly number[],
  n: readonly number[],
  eta: number,
  out: number[],
): boolean {
  const ix = i[0] ?? 0;
  const iy = i[1] ?? 0;
  const iz = i[2] ?? 0;
  const nx = n[0] ?? 0;
  const ny = n[1] ?? 0;
  const nz = n[2] ?? 0;
  const d = nx * ix + ny * iy + nz * iz;
  const k = 1 - eta * eta * (1 - d * d);
  if (k < 0) return false;
  const s = eta * d + Math.sqrt(k);
  out[0] = eta * ix - s * nx;
  out[1] = eta * iy - s * ny;
  out[2] = eta * iz - s * nz;
  return true;
}
