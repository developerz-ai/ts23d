import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { refGaps } from './critique-ref.ts';
import type { VectorImage } from './critique-vector.ts';
import type { Fingerprint } from './ref-fingerprint.ts';
import { encodeRefMask, modelOutline, type RefFile, type RefView } from './ref-gate.ts';

const crate = compile(
  defineAsset({
    name: 'crate',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => ctx.part('body', box({ size: [2, 1, 1], color: [0.5, 0.35, 0.2] })),
  }),
);

const image: VectorImage = (() => {
  const [width, height] = [64, 36];
  const rgba = new Uint8Array(width * height * 4).fill(200);
  const mask = new Uint8Array(width * height);
  for (let y = 10; y < 26; y++) for (let x = 12; x < 52; x++) mask[y * width + x] = 255;
  return { width, height, rgba, mask };
})();

const view = (fp: Fingerprint): RefView => ({
  mask: encodeRefMask(fp.mask128),
  lab: fp.lab,
  spectrum: fp.spectrum,
  edges: fp.edges,
  camera: null,
  source: { url: 'own', sha256: 'a'.repeat(64), licence: 'CC0-1.0' },
});

describe('refGaps', () => {
  it('is undefined when ref.json has no views', () => {
    expect(refGaps(crate, image, { views: {} })).toBeUndefined();
  });

  it("matches the asset's own outline (IoU 1) and misses a wrong one", () => {
    const own: RefFile = { views: { side: view(modelOutline(crate, 'side')) } };
    expect(refGaps(crate, image, own)?.iou).toBeCloseTo(1, 3);
    const blob = modelOutline(crate, 'front');
    const wrong = { ...blob, mask128: blob.mask128.map((_, i) => (i % 128 < 20 ? 1 : 0)) };
    const off = refGaps(crate, image, { views: { side: view(wrong) } });
    expect(off?.iou ?? 1).toBeLessThan(0.6);
    for (const k of ['valueEmd', 'spectrumGap', 'edgeGap'] as const)
      expect(Number.isFinite(off?.[k])).toBe(true);
  });
});
