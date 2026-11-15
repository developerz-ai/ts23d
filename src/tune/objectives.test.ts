import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { encodeRefMask, fingerprint, type RefView } from '../qa/index.ts';
import { type PhotoCamera, photoView } from '../render/index.ts';
import { photoError } from './objectives.ts';

const asset = compile(
  defineAsset({
    name: 'post',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build(ctx) {
      ctx.part('base', box({ size: [1.2, 0.3, 0.2], at: [0, 0, 0.1], color: [0.3, 0.3, 0.3] }));
      ctx.part(
        'pole',
        box({ size: [0.15, 0.15, 1.4], at: [0.45, 0, 0.9], color: [0.5, 0.4, 0.3] }),
      );
    },
  }),
);
const CAM: PhotoCamera = { eye: [0.4, -4, 1], target: [0, 0, 0.6], fovDeg: 30 };

function viewFrom(camera: PhotoCamera, saved: PhotoCamera | null): RefView {
  const { rgba } = photoView(asset, camera, 384, 256);
  const f = fingerprint(rgba, 384, 256);
  return {
    mask: encodeRefMask(f.mask128),
    lab: f.lab,
    spectrum: f.spectrum,
    edges: f.edges,
    camera: saved,
    source: {
      url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      sha256: 'a'.repeat(64),
      licence: 'CC0',
    },
  };
}

describe('photoError', () => {
  it('refuses a view without a solved camera, or no view', () => {
    expect(() => photoError(asset, viewFrom(CAM, null))).toThrow(/no solved camera/);
    expect(() => photoError(asset, undefined)).toThrow(/no such reference view/);
  });

  it('is ~0 from the matching camera and grows when the reference differs', () => {
    expect(photoError(asset, viewFrom(CAM, CAM))).toBeLessThan(0.05);
    const other = viewFrom({ eye: [-4, 0.5, 1], target: [0, 0, 0.6], fovDeg: 30 }, CAM);
    expect(photoError(asset, other)).toBeGreaterThan(0.2);
  });
});
