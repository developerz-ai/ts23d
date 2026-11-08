// The before/after strip an agent Reads after tuning: one row per state (defaults, tuned); per
// silhouette objective an overlay of model vs reference (grey both, orange model only, blue
// reference only), then a beauty render framed on the "before" model so the two rows line up.

import { type Asset, type CompiledAsset, compile, encodePng } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { renderBeauty } from '../render/index.ts';
import { fitMask, modelMask } from './mask.ts';
import type { FittedMasks } from './objectives.ts';
import type { TuneResult } from './tune.ts';
import type { TunedValues } from './types.ts';

const BOTH = [70, 74, 82] as const;
const MODEL = [235, 140, 40] as const;
const REF = [60, 130, 230] as const;
const EMPTY = [246, 246, 244] as const;

export interface StripOptions {
  /** Panel edge in pixels. Default 256. */
  readonly panel?: number;
  readonly sheet?: PaintedSheet;
}

export function tuneStrip(
  asset: Asset,
  r: TuneResult,
  masks: FittedMasks,
  o: StripOptions = {},
): Uint8Array {
  const P = o.panel ?? 256;
  const sil = (asset.tune?.objectives ?? []).flatMap((ob, i) =>
    ob.kind === 'silhouette' ? [{ i, view: ob.view, lod: ob.lod ?? 0 }] : [],
  );
  const cols = sil.length + 1;
  const W = cols * P;
  const H = 2 * P;
  const px = new Uint8Array(W * H * 4).fill(255);
  const put = (x: number, y: number, c: readonly number[]): void => {
    px.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], (y * W + x) * 4);
  };
  const compiled = (values: TunedValues, lod: 0 | 1 | 2): CompiledAsset =>
    compile(asset, { lod, tuned: values });
  const frame = compiled(r.before.values, 0);
  [r.before.values, r.after.values].forEach((values, row) => {
    sil.forEach((s, col) => {
      const ref = masks.get(s.i);
      const n = Math.round(Math.sqrt(ref?.length ?? 0));
      if (!ref || n === 0) return;
      const model = fitMask(modelMask(compiled(values, s.lod), s.view), n);
      for (let y = 2; y < P - 2; y++)
        for (let x = 2; x < P - 2; x++) {
          const k = Math.floor((y * n) / P) * n + Math.floor((x * n) / P);
          const a = model[k] ?? 0;
          const b = ref[k] ?? 0;
          put(col * P + x, row * P + y, a && b ? BOTH : a ? MODEL : b ? REF : EMPTY);
        }
    });
    const look = renderBeauty(compiled(values, 0), {
      width: P - 4,
      height: P - 4,
      supersample: 1,
      frameFrom: frame,
      ...(o.sheet ? { sheet: o.sheet } : {}),
    });
    for (let y = 0; y < P - 4; y++)
      for (let x = 0; x < P - 4; x++) {
        const q = (y * (P - 4) + x) * 4;
        put(sil.length * P + 2 + x, row * P + 2 + y, [
          look.rgba[q] ?? 0,
          look.rgba[q + 1] ?? 0,
          look.rgba[q + 2] ?? 0,
        ]);
      }
  });
  return encodePng(W, H, px);
}
