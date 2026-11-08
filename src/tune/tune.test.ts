import { describe, expect, it } from 'bun:test';
import { type Asset, defineAsset, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { maskOfSvg } from './mask-svg.ts';
import { loadMasks } from './masks-load.ts';
import { scoreValues } from './objectives.ts';
import { tuneJson } from './report.ts';
import { tune } from './tune.ts';
import type { TuneSpec } from './types.ts';

const GREY: [number, number, number] = [0.5, 0.5, 0.5];
/** Front view (+X) sees Y × Z: a 2 : 1 slab. */
const SLAB = '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>';

const slab = (objectives: TuneSpec['objectives']): Asset =>
  defineAsset({
    name: 'slab',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    real: {
      length: 0.2,
      width: 2,
      height: 1,
      measures: [{ label: 'width', value: 2, axis: 'y', parts: ['slab'] }],
    },
    sources: ['test fixture'],
    tune: { params: { width: { min: 0.5, max: 4, default: 1, step: 0.001 } }, objectives },
    build(ctx) {
      ctx.part('slab', box({ size: [0.2, ctx.tuned('width'), 1], color: GREY }));
    },
  });

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : 'not a Ts23dError';
  }
  return 'no throw';
};

describe('tune', () => {
  const asset = slab([{ kind: 'silhouette', view: '+X', mask: SLAB }]);
  const spec = asset.tune as TuneSpec;
  const masks = loadMasks(spec);

  it('refuses what it cannot tune, with T3D_TUNE_INVALID', () => {
    const plain = defineAsset({
      name: 'plain',
      kind: 'prop',
      budget: { triangles: [1, 1, 1] },
      build() {},
    });
    expect(code(() => tune(plain))).toBe('T3D_TUNE_INVALID');
    expect(code(() => tune(asset, { masks, evals: 0 }))).toBe('T3D_TUNE_INVALID');
    expect(code(() => tune(asset))).toBe('T3D_TUNE_INVALID'); // silhouette without masks
    expect(
      code(() =>
        loadMasks(
          { ...spec, objectives: [{ kind: 'silhouette', view: '+X', mask: 'front.jpg' }] },
          '.',
        ),
      ),
    ).toBe('T3D_TUNE_INVALID');
    expect(
      code(() =>
        loadMasks(
          { ...spec, objectives: [{ kind: 'silhouette', view: '+X', mask: 'missing.svg' }] },
          '/nonexistent',
        ),
      ),
    ).toBe('T3D_TUNE_INVALID');
  });

  it('moves the param until the outline matches the drawing', () => {
    const r = tune(asset, { masks, evals: 60, seed: 1 });
    expect(r.before.score.total).toBeGreaterThan(0.25); // 1 : 1 vs 2 : 1
    expect(r.after.score.total).toBeLessThan(0.03);
    expect(Math.abs((r.after.values['width'] ?? 0) - 2)).toBeLessThan(0.06);
    expect(r.evals).toBeLessThanOrEqual(60);
  });

  it('coordinate search improves too', () => {
    const r = tune(asset, { masks, evals: 60, method: 'coordinate' });
    expect(r.after.score.total).toBeLessThan(r.before.score.total / 4);
  });

  it('same seed → the same tune.json bytes; another seed is allowed to differ', () => {
    const a = tuneJson({ other: { values: { x: 1 } } }, [
      tune(asset, { masks, evals: 30, seed: 4 }),
    ]);
    const b = tuneJson({ other: { values: { x: 1 } } }, [
      tune(asset, { masks, evals: 30, seed: 4 }),
    ]);
    expect(a).toBe(b);
    expect(Object.keys(JSON.parse(a))).toEqual(['other', 'slab']);
  });
});

describe('objectives', () => {
  it('measures, budget and custom score what they say', () => {
    const asset = slab([
      { kind: 'measures' },
      { kind: 'budget', weight: 0.5 },
      { kind: 'custom', name: 'wide', score: (a) => a.parts.length * 3 },
    ]);
    const s = scoreValues(asset, { width: 1.5 }, new Map());
    expect(s.objectives.map((o) => o.name)).toEqual(['measures', 'budget LOD0', 'wide']);
    expect(s.objectives[0]?.value).toBeCloseTo(0.25, 6); // |1.5 − 2| / 2
    expect(s.objectives[1]?.value).toBeCloseTo(1, 6); // 12 triangles of 12
    expect(s.total).toBeCloseTo(0.25 + 0.5 + 3, 6);
    const noMeasures = defineAsset({
      ...asset,
      name: 'bare',
      real: { length: 1, width: 1, height: 1 },
    });
    expect(code(() => scoreValues(noMeasures, {}, new Map()))).toBe('T3D_TUNE_INVALID');
  });
});

describe('maskOfSvg', () => {
  it('unions overlapping shapes and cuts a fully enclosed one as a hole', () => {
    const m = maskOfSvg(
      '<svg viewBox="0 0 100 100"><rect width="60" height="100"/><rect x="40" width="60" height="100"/><rect x="5" y="40" width="20" height="20"/></svg>',
      100,
    );
    const at = (x: number, y: number): number => m.data[y * m.width + x] ?? -1;
    expect(at(50, 20)).toBe(1); // the overlap stays filled
    expect(at(15, 50)).toBe(0); // inside the inner square: a hole
    expect(at(90, 90)).toBe(1);
  });
});
