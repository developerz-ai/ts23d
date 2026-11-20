import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, dmath, encodePng, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { type Fingerprint, fingerprint } from './ref-fingerprint.ts';
import {
  checkRefFile,
  encodeRefMask,
  modelOutline,
  type RefFile,
  type RefView,
  refFindings,
  refFingerprint,
  refSilhouette,
  silhouetteIoU,
} from './ref-gate.ts';

const grey = (
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  rgb = (_x: number, _y: number) => [110, 100, 90],
): Uint8Array => {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (inside(x, y)) px.set([...rgb(x, y), 255], (y * w + x) * 4);
  return px;
};
const hash = (x: number, y: number): number => {
  const h = Math.imul(((x * 374761393 + y * 668265263) >>> 0) ^ 0x5bd1e995, 1274126177) >>> 0;
  return (h ^ (h >>> 15)) & 255;
};
const ellipse = (x: number, y: number): boolean =>
  dmath.pow((x - 64) / 60, 2) + dmath.pow((y - 64) / 30, 2) <= 1;

const viewOf = (f: Fingerprint): RefView => ({
  mask: encodeRefMask(f.mask128),
  lab: f.lab,
  spectrum: f.spectrum,
  edges: f.edges,
  camera: null,
  source: {
    url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
    sha256: 'a'.repeat(64),
    licence: 'CC BY-SA 4.0',
  },
});

const slab = defineAsset({
  name: 'slab',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build(ctx) {
    ctx.part('body', box({ size: [2, 0.5, 1], at: [0, 0, 0.5], color: [0.5, 0.5, 0.5] }));
  },
});

describe('checkRefFile', () => {
  it('refuses a malformed file with the regenerate fix', () => {
    expect(() => checkRefFile({})).toThrow(/views/);
    expect(() => checkRefFile({ views: { side: { mask: 'x', lab: [1] } } })).toThrow(
      /lab must be 48/,
    );
    expect(() => checkRefFile({ views: { back: {} } })).toThrow(/unknown view/);
  });

  it('refuses a null view and a file with no view at all as T3D_RECIPE_INVALID', () => {
    const code = (json: unknown): string => {
      try {
        checkRefFile(json);
      } catch (e) {
        return e instanceof Ts23dError ? `${e.code} ${e.message} ${e.fix}` : `bare ${String(e)}`;
      }
      return 'accepted';
    };
    expect(code({ views: { side: null } })).toMatch(/^T3D_RECIPE_INVALID .*view 'side' must be/);
    expect(code({ views: { side: 7 } })).toMatch(/^T3D_RECIPE_INVALID /);
    // An empty file used to validate, and every reference check then passed with nothing compared.
    expect(code({ views: {} })).toMatch(/^T3D_RECIPE_INVALID .*`views` is empty.*Photos per view/);
  });

  it('accepts a generated view', () => {
    const v = viewOf(fingerprint(grey(128, 128, ellipse), 128, 128));
    expect(
      checkRefFile(JSON.parse(JSON.stringify({ views: { side: v } }))).views.side?.lab,
    ).toHaveLength(48);
  });
});

describe('refFindings', () => {
  const flat = fingerprint(grey(128, 128, ellipse), 128, 128);
  const ref: RefFile = { views: { side: viewOf(flat) } };

  it('fires T3D_REF_SILHOUETTE when the outline differs', () => {
    const square = fingerprint(
      grey(128, 128, (x, y) => x > 20 && x < 108 && y > 20 && y < 108),
      128,
      128,
    );
    const codes = refFindings({ side: square }, ref).map((f) => f.code);
    expect(codes).toContain('T3D_REF_SILHOUETTE');
  });

  it('fires T3D_REF_DETAIL for a flat render against a detailed photo', () => {
    const detailed: RefFile = {
      views: {
        side: viewOf(
          fingerprint(
            grey(128, 128, ellipse, (x, y) => [hash(x, y), hash(x, y), hash(x, y)]),
            128,
            128,
          ),
        ),
      },
    };
    const f = refFindings({ side: flat }, detailed);
    expect(f.map((x) => x.code)).toContain('T3D_REF_DETAIL');
    expect(f.every((x) => x.message.includes('side view') && x.fix.length > 0)).toBe(true);
  });

  it('fires T3D_REF_VALUE for a far lighter model', () => {
    const light = fingerprint(
      grey(128, 128, ellipse, () => [235, 235, 235]),
      128,
      128,
    );
    expect(refFindings({ side: light }, ref).map((f) => f.code)).toEqual(['T3D_REF_VALUE']);
  });

  it('passes a match and skips views without a model', () => {
    expect(refFindings({ side: flat }, ref)).toEqual([]);
    expect(refFindings({ front: flat }, ref)).toEqual([]);
  });

  it('round-trips the committed mask', () => {
    expect(refFingerprint(viewOf(flat)).mask128).toEqual(flat.mask128);
  });
});

describe('silhouetteIoU / refSilhouette', () => {
  const asset = compile(slab);
  const side = modelOutline(asset, 'side');

  it('matches the asset against its own outline and fails a wrong one', () => {
    const own = new Uint8Array(128 * 128 * 4);
    side.mask128.forEach((v, i) => {
      own.set(v ? [0, 0, 0, 255] : [255, 255, 255, 0], i * 4);
    });
    expect(silhouetteIoU(asset, encodePng(128, 128, own))).toBeGreaterThan(0.99);
    const tall = grey(128, 128, (x, y) => x > 54 && x < 74 && y > 4 && y < 124);
    expect(silhouetteIoU(asset, encodePng(128, 128, tall))).toBeLessThan(0.5);
  });

  it('gates LOD0 only', () => {
    const wrong: RefFile = {
      views: {
        side: viewOf(
          fingerprint(
            grey(128, 128, (x) => x > 60 && x < 68),
            128,
            128,
          ),
        ),
      },
    };
    expect(refSilhouette(wrong)(asset).map((f) => f.code)).toEqual(['T3D_REF_SILHOUETTE']);
    expect(refSilhouette({ views: { side: viewOf(side) } })(asset)).toEqual([]);
    expect(refSilhouette(wrong)(compile(slab, { lod: 2 }))).toEqual([]);
  });
});
