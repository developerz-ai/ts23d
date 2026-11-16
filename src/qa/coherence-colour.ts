// Colour science for set coherence: linear RGB (vertex colours) → CIE L*a*b* (D65) and the
// CIEDE2000 colour difference (Sharma, Wu & Dalal 2005, "The CIEDE2000 Color-Difference Formula:
// Implementation Notes"), the perceptual distance a palette-membership check needs; plain
// Euclidean Lab (CIE76) over-weights saturated colours.

import type { Vec3 } from '../core/index.ts';

export type Lab = readonly [number, number, number];

const toSrgb = (c: number): number => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};

/** Linear RGB 0..1 → CIE L*a*b* (D65 white). */
export function labOfLinear(rgb: Vec3): Lab {
  const [r, g, b] = rgb.map((c) => Math.min(1, Math.max(0, c))) as unknown as Vec3;
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116;
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** sRGB-encoded relative value 0..1 of a linear colour (the greyscale value an artist judges). */
export const lightnessOf = (rgb: Vec3): number => labOfLinear(rgb)[0] / 100;

/** sRGB hex of a linear colour, for messages. */
export const hexOf = (rgb: Vec3): string =>
  `#${rgb
    .map((c) =>
      Math.round(toSrgb(c) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const RAD = Math.PI / 180;

/** CIEDE2000 ΔE between two Lab colours (kC = kH = 1; kL = 2 is the textile weighting that
 *  forgives lightness, so a palette colour's shade ramp still belongs to it). */
export function ciede2000(a: Lab, b: Lab, kL = 1): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (x: number, y: number): number => {
    if (x === 0 && y === 0) return 0;
    const h = Math.atan2(y, x) / RAD;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * RAD) +
    0.24 * Math.cos(2 * hpm * RAD) +
    0.32 * Math.cos((3 * hpm + 6) * RAD) -
    0.2 * Math.cos((4 * hpm - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * RAD) * Rc;
  return Math.sqrt(
    (dLp / (kL * Sl)) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}
