import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type TuneSpec } from '../../src/core/index.ts';
import { toGlb } from '../../src/export/index.ts';
import { loadMasks, scoreValues, spaceOf } from '../../src/tune/index.ts';
import saved from './tune.json';
import { tune_demo } from './tune_demo.ts';

const spec = tune_demo.tune as TuneSpec;
const values = saved.tune_demo.values;
const masks = loadMasks(spec, import.meta.dir);

describe('tune_demo', () => {
  it('the hand-set defaults do not match the drawing', () => {
    const s = scoreValues(tune_demo, spaceOf(spec).defaults, masks);
    expect(1 - s.total).toBeLessThan(0.7);
  });

  it('the committed tune.json does (front IoU ≥ 0.93)', () => {
    const s = scoreValues(tune_demo, values, masks);
    expect(1 - s.total).toBeGreaterThanOrEqual(0.93);
  });

  it('compiles identically from tune.json and from the same values passed in', () => {
    const { saved: _, ...bare } = spec;
    const without = defineAsset({ ...tune_demo, tune: bare });
    for (const lod of [0, 1, 2] as const)
      expect(toGlb(compile(tune_demo, { lod }))).toEqual(
        toGlb(compile(without, { lod, tuned: values })),
      );
    // …and differently without them: the file is what changes the model.
    expect(toGlb(compile(without))).not.toEqual(toGlb(compile(tune_demo)));
  });
});
