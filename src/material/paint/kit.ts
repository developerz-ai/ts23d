// The helper kit a project painter (`defineMaterial({ paint })`) receives, and the post-check that
// its layers stayed finite: a NaN written by user code fails loudly instead of corrupting a sheet.

import { Ts23dError } from '../../core/index.ts';
import { type Canvas, noiseAt, smooth } from './canvas.ts';
import { hash2 } from './noise.ts';
import type { PaintKit } from './types.ts';

export function paintKit(c: Canvas, seed: number): PaintKit {
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  return {
    seed,
    noise: (xm, ym, sizeU, sizeV, salt = 0, octaves = 4) =>
      noiseAt(c, xm, ym, sizeU, sizeV, seed + salt * 7919, octaves),
    hash: (a, b, salt = 0) => hash2(a, b, seed + salt),
    smooth,
    each(fn) {
      for (let y = 0; y < c.h; y++) {
        const ym = (y + 0.5) * pv;
        for (let x = 0; x < c.w; x++) fn(y * c.w + x, (x + 0.5) * pu, ym);
      }
    },
  };
}

/** Throw T3D_MATERIAL_INVALID if any layer holds a non-finite value. */
export function checkFinite(c: Canvas, where: string): void {
  const layers = { height: c.height, tone: c.tone, rough: c.rough, metal: c.metal, mix: c.mix };
  for (const [name, a] of Object.entries(layers))
    for (let i = 0; i < a.length; i++)
      if (!Number.isFinite(a[i] ?? 0))
        throw new Ts23dError('T3D_MATERIAL_INVALID', {
          cause: `${where}: the painter wrote ${a[i]} into '${name}' at texel ${i}`,
          fix: 'write finite numbers only (guard divisions; clamp with Math.min/Math.max)',
        });
}
