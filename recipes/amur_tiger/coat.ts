// Coat colour zones on the body and tail (world space): the orange ground deepening along the
// spine, the white underside reaching up the lower flank, the throat, chest and inner legs, then
// the stripes (stripes.ts) and the value grade (darker toward the feet). Pure functions of
// position: the same point always gets the same colour.

import type { Vec3 } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep } from '../_lib/creature/curve.ts';
import { valueNoise } from './fur.ts';
import { C } from './palette.ts';
import { bodyStripe, legStripe, tailStripe } from './stripes.ts';
import { dorsalOf, whiteOf } from './zones.ts';

/** Value gradient feet → head (and slightly darker to the rear). */
export function heightGrade(c: Vec3, p: Vec3): Vec3 {
  const h = smoothstep(0, 0.95, p[2] + 0.06 * p[0]);
  const v = 0.8 + 0.24 * h;
  return [Math.min(1, c[0] * v), Math.min(1, c[1] * v), Math.min(1, c[2] * v)];
}

export function bodyPaint(lod: number): (p: Vec3, c: Vec3) => Vec3 {
  return (p, c) => {
    let col = mixRgb(c, C.back, dorsalOf(p) * 0.7);
    // Coat variation: broad patches where the fur lies paler (golden) or deeper (rust), so the
    // flank is not one flat orange.
    const patch = valueNoise(p[0] / 0.16, p[1] / 0.16, p[2] / 0.12, 21) - 0.5;
    col = mixRgb(col, patch > 0 ? C.orangePale : C.back, Math.abs(patch) * 0.55);
    const w = whiteOf(p);
    // Orange pales toward the white edge before it turns.
    col = mixRgb(
      col,
      C.orangePale,
      Math.max(smoothstep(0, 0.5, w) * 0.6, smoothstep(0.38, 0.1, p[2]) * 0.55),
    );
    col = mixRgb(col, C.white, smoothstep(0.35, 1, w));
    const s = Math.max(bodyStripe(p, lod), legStripe(p, lod));
    if (s > 0) col = mixRgb(col, w > 0.5 ? C.stripeBrown : C.stripe, s);
    // Pads on the sole.
    if (p[2] < 0.007) col = mixRgb(col, C.pad, smoothstep(0.007, 0.002, p[2]));
    return heightGrade(col, p);
  };
}

export function tailPaint(lod: number): (p: Vec3, c: Vec3) => Vec3 {
  return (p, c) => {
    const s = tailStripe(p, lod);
    const col = mixRgb(mixRgb(c, C.orangePale, 0.25), C.stripe, s);
    return heightGrade(col, p);
  };
}
