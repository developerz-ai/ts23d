// White shark proportions: every length a recipe module shares. Numbers and sources: README.md.
// t is the fraction of natural total length from the snout (0) to the upper caudal tip (1).

import { dmath, hex, type Vec3 } from '@developerz.ai/ts23d';
import { clamp, fbm, gauss, noise, profile, smooth, spow, TAU } from '../_lib/body-plan-kit.ts';

export const L = 4.5;
/** Height of the body axis: the lowest fin tip clears the sheet's ground plane. */
export const Z0 = 0.72;
export const X0 = L / 2;
export const xOf = (t: number): number => X0 - t * L;
export const tOf = (x: number): number => (X0 - x) / L;

/** Precaudal pit: where the trunk gives way to the tail fin. */
export const T_CAUDAL = 0.86;
export const T_DORSAL = 0.389;
export const T_PECTORAL = 0.295;
export const T_EYE = 0.104;
export const GILLS: readonly number[] = [0.165, 0.19, 0.215, 0.24, 0.265];

export const COLOUR = {
  back: hex('#5d666b'),
  backDark: hex('#454d53'),
  bronze: hex('#68685f'),
  belly: hex('#ecebe4'),
  scar: hex('#b49a98'),
  copepod: hex('#8a6434'),
  lid: hex('#6b747a'),
  iris: hex('#3e5062'),
  pupilRing: hex('#8d9aa6'),
  mouth: hex('#6e2f35'),
  gum: hex('#c98488'),
  gumDeep: hex('#8e464c'),
  palate: hex('#74343b'),
  tooth: hex('#f1ecdc'),
  eye: hex('#07080a'),
  slit: hex('#1b1c20'),
  tip: hex('#17191c'),
} as const;

const halfWidth = profile([
  [0, 0],
  [0.006, 0.046],
  [0.02, 0.126],
  [0.05, 0.21],
  [0.09, 0.272],
  [0.14, 0.315],
  [0.2, 0.37],
  [0.28, 0.41],
  [0.35, 0.42],
  [0.46, 0.39],
  [0.58, 0.31],
  [0.7, 0.2],
  [0.78, 0.122],
  [0.83, 0.078],
  [0.875, 0.05],
  [0.905, 0.012],
]);
const halfTop = profile([
  [0, 0],
  [0.006, 0.032],
  [0.02, 0.084],
  [0.05, 0.148],
  [0.09, 0.205],
  [0.14, 0.26],
  [0.2, 0.335],
  [0.28, 0.405],
  [0.35, 0.44],
  [0.46, 0.42],
  [0.58, 0.345],
  [0.7, 0.235],
  [0.78, 0.15],
  [0.83, 0.102],
  [0.875, 0.07],
  [0.905, 0.02],
]);
const halfBelow = profile([
  [0, 0],
  [0.006, 0.02],
  [0.02, 0.05],
  [0.05, 0.09],
  [0.09, 0.135],
  [0.14, 0.215],
  [0.2, 0.31],
  [0.28, 0.4],
  [0.35, 0.44],
  [0.46, 0.4],
  [0.58, 0.305],
  [0.7, 0.195],
  [0.78, 0.118],
  [0.83, 0.08],
  [0.875, 0.05],
  [0.905, 0.016],
]);
const axisLift = profile([
  [0, 0.075],
  [0.09, 0.05],
  [0.2, 0.012],
  [0.35, 0],
  [0.6, 0.02],
  [0.78, 0.075],
  [0.875, 0.12],
]);

export const axisZ = (t: number): number => Z0 + axisLift(t);

/** Mouth: the arc's front at y = 0, its depth back to the corners, half-width at the corners. */
export const MOUTH = { tFront: 0.056, depth: 0.25, half: 0.272, pocket: 0.1, rear: 0.06 } as const;
export const X_MOUTH = xOf(MOUTH.tFront);
export const X_HINGE = X_MOUTH - MOUTH.depth - MOUTH.rear;
export const arcX = (y: number): number => X_MOUTH - MOUTH.depth * dmath.pow(y / MOUTH.half, 2);

const EXP = 2 / 2.3;

/** Skin of the plain trunk (no grooves, no mouth) at t, angle a from the top toward +Y. */
export function plainPoint(t: number, a: number): Vec3 {
  const [s, c] = [dmath.sin(a), dmath.cos(a)];
  const h = c >= 0 ? halfTop(t) : halfBelow(t);
  return [xOf(t), halfWidth(t) * spow(s, EXP), axisZ(t) + h * spow(c, EXP)];
}

/** Underside height of the plain trunk at (x, y). */
export function undersideZ(x: number, y: number): number {
  const t = tOf(x);
  const s = dmath.pow(clamp(Math.abs(y) / Math.max(1e-4, halfWidth(t))), 1 / EXP);
  return axisZ(t) - halfBelow(t) * dmath.pow(Math.sqrt(Math.max(0, 1 - s * s)), EXP);
}

export const topZ = (t: number): number => axisZ(t) + halfTop(t);
export const widthAt = (t: number): number => halfWidth(t);

/** 1 inside the mouth pocket cut under the head, where the jaws sit. */
export function pocketMask(x: number, y: number): number {
  return (
    smooth(-0.002, 0.018, arcX(y) - x) *
    smooth(0, 0.03, x - X_HINGE) *
    smooth(0, 0.03, MOUTH.half + 0.02 - Math.abs(y))
  );
}

/** Angle of the flank band the gill slits run over, as an offset from the side. */
const slitBand = (a: number): number => {
  const side = Math.abs(dmath.atan2(dmath.sin(a), dmath.cos(a)));
  return smooth(0.82, 1.0, side) * (1 - smooth(2.0, 2.26, side));
};

/** Gill slit strength at (t, a): 1 on a slit's line, signed flap on its front lip. */
export function gillField(t: number, a: number): { slit: number; lip: number } {
  const side = Math.abs(dmath.atan2(dmath.sin(a), dmath.cos(a)));
  const band = slitBand(a);
  let [slit, lip] = [0, 0];
  if (band <= 0) return { slit, lip };
  GILLS.forEach((g, i) => {
    // Slits lean back toward the belly; the last ones reach lowest.
    const reach = 1 - 0.05 * (GILLS.length - 1 - i) * smooth(1.6, 2.2, side);
    const dx = (t - g - 0.0075 * (side - Math.PI / 2)) * L;
    slit = Math.max(slit, gauss(dx, 0.011) * band * reach);
    lip = Math.max(lip, gauss(dx + 0.022, 0.016) * band * reach);
  });
  return { slit, lip };
}

/** Where the dark back gives way to the white belly, as height share (-1 belly .. 1 back). */
const shadeBase = profile([
  [0, -0.3],
  [0.05, -0.36],
  [0.1, -0.2],
  [0.16, -0.04],
  [0.26, -0.06],
  [0.34, -0.26],
  [0.5, -0.3],
  [0.62, -0.38],
  [0.74, -0.34],
  [0.86, -0.26],
]);

/** The boundary at t on one side: climbs in tongues between the gill slits, frays everywhere. */
export function shadeLine(t: number, side: 1 | -1): number {
  const seed = side > 0 ? 3 : 23;
  const tongues = GILLS.reduce((s, g) => s + gauss((t - g - 0.0125) * L, 0.03), 0);
  const fray = (fbm(t * 26, 0.5, seed) - 0.5) * 0.2 + (noise(t * 120, 0.5, seed + 2) - 0.5) * 0.07;
  return shadeBase(t) + 0.2 * tongues * smooth(0.14, 0.17, t) + fray;
}

/** Trunk angle (0 top .. PI bottom) where the height share equals `h`. */
export function angleOfShare(t: number, h: number): number {
  const c = h >= 0 ? clamp(h) : clamp((-h * halfTop(t)) / Math.max(1e-3, halfBelow(t)));
  const a = dmath.acos(clamp(dmath.pow(c, 1 / EXP)));
  return clamp(h >= 0 ? a : Math.PI - a, 0.7, 2.95);
}

export const rad = (deg: number): number => (deg / 360) * TAU;
