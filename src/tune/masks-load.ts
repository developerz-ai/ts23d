// Resolve each silhouette objective's `mask` — inline `<svg>` markup, or a .svg / .png file beside
// the recipe — into a fitted reference mask, once per tuning run. File reads are injectable so the
// same code runs where there is no file system (pass `read`).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { fitMask, maskOfPng } from './mask.ts';
import { maskOfSvg } from './mask-svg.ts';
import type { FittedMasks } from './objectives.ts';
import type { TuneSpec } from './types.ts';

export type ReadFile = (path: string) => Uint8Array;

const readDisk: ReadFile = (path) => new Uint8Array(readFileSync(path));

export function loadMasks(
  spec: TuneSpec,
  dir?: string,
  read: ReadFile = readDisk,
  n = 128,
): FittedMasks {
  const out = new Map<number, Uint8Array>();
  spec.objectives.forEach((o, i) => {
    if (o.kind !== 'silhouette') return;
    const m = o.mask.trim();
    if (m.startsWith('<')) {
      out.set(i, fitMask(maskOfSvg(m), n));
      return;
    }
    if (!/\.(svg|png)$/i.test(m) || dir === undefined)
      throw new Ts23dError('T3D_TUNE_INVALID', {
        cause: `silhouette ${o.view} mask '${m.slice(0, 40)}' is neither <svg> markup nor a .svg/.png file${dir === undefined ? ' (and no recipe folder to read it from)' : ''}`,
        fix: "pass inline '<svg …>…</svg>' or a file name beside the recipe: mask: 'front.svg'",
      });
    let bytes: Uint8Array;
    try {
      bytes = read(join(dir, m));
    } catch (e) {
      throw new Ts23dError('T3D_TUNE_INVALID', {
        cause: `cannot read silhouette mask ${join(dir, m)}: ${e instanceof Error ? e.message : String(e)}`,
        fix: 'put the mask file beside the recipe, named as in the objective',
      });
    }
    const mask = /\.png$/i.test(m) ? maskOfPng(bytes) : maskOfSvg(new TextDecoder().decode(bytes));
    out.set(i, fitMask(mask, n));
  });
  return out;
}
