// Reference-photo gaps for the critique vector: when a recipe commits ref.json (slice 02,
// `scripts/ref.ts`), the asset's LOD0 outline per reference view and its VECTOR_RENDER beauty image
// are compared with the photo fingerprints (`compareFingerprints`). Without ref.json the gaps are
// imputed neutral by the calibration (critique-calibrate.ts), so they move nothing.

import type { CompiledAsset } from '../core/index.ts';
import type { VectorImage } from './critique-vector.ts';
import { compareFingerprints, type FingerprintDistance, fingerprint } from './ref-fingerprint.ts';
import {
  modelOutline,
  REF_VIEWS,
  type RefFile,
  type RefViewName,
  refFingerprint,
} from './ref-gate.ts';

export type RefGaps = FingerprintDistance;
export const REF_METRICS = ['iou', 'valueEmd', 'spectrumGap', 'edgeGap'] as const;

/** Views a photo may show mirrored (the same set ref-gate uses). */
const MIRROR: ReadonlySet<RefViewName> = new Set(['side', 'threeQuarter']);

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/**
 * Gaps of one asset against its reference views, or undefined when ref.json has none. IoU: the
 * orthographic outline per view (mean over views). Value / spectrum / edges: the 3/4 beauty image
 * against the threeQuarter photo when there is one, else the mean over every view.
 */
export function refGaps(
  lod0: CompiledAsset,
  image: VectorImage,
  ref: RefFile,
): RefGaps | undefined {
  const views = REF_VIEWS.flatMap((name) => {
    const v = ref.views[name];
    return v ? [{ name, fp: refFingerprint(v) }] : [];
  });
  if (!views.length) return undefined;
  const iou = mean(
    views.map(
      (v) =>
        compareFingerprints(modelOutline(lod0, v.name), v.fp, { mirror: MIRROR.has(v.name) }).iou,
    ),
  );
  const rgba = Uint8Array.from(image.rgba);
  for (let p = 0; p < image.mask.length; p++) rgba[p * 4 + 3] = image.mask[p] ?? 0;
  const beauty = fingerprint(rgba, image.width, image.height);
  const tq = views.filter((v) => v.name === 'threeQuarter');
  const ds = (tq.length ? tq : views).map((v) =>
    compareFingerprints(beauty, v.fp, { mirror: true }),
  );
  return {
    iou: r4(iou),
    valueEmd: r4(mean(ds.map((d) => d.valueEmd))),
    spectrumGap: r4(mean(ds.map((d) => d.spectrumGap))),
    edgeGap: r4(mean(ds.map((d) => d.edgeGap))),
  };
}
