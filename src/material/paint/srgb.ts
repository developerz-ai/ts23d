// Exact sRGB byte ↔ linear conversion for image data (photo strips, toned stamped images): a
// 256-entry decode table and a rounded encoder, so decode → encode returns the same byte.

/** sRGB byte → linear 0..1. */
export const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, b) => {
  const s = b / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

/** Linear 0..1 (clamped) → rounded sRGB byte. */
export function linearToSrgbByte(l: number): number {
  if (!(l > 0)) return 0;
  if (l >= 1) return 255;
  return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
}
