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

  it('LOD2 profile climbs monotonically at the lowest allowed belly (no folded wall)', () => {
    // Failure first: bellyZ 0.25 put the belly station (0.15 m) after the 0.18 m one.
    const body = compile(tune_demo, { lod: 2, tuned: { ...values, bellyZ: 0.25 } }).parts.find(
      (p) => p.name === 'body',
    )?.mesh;
    expect(body).toBeDefined();
    // Lathe rings in profile order: the outer wall's ring heights, first vertex of each ring.
    const P = body?.positions ?? new Float32Array();
    const zs: number[] = [];
    for (let i = 0; i < P.length / 3; i++) {
      const z = P[i * 3 + 2] ?? 0;
      if (zs.length === 0 || Math.abs(z - (zs[zs.length - 1] ?? 0)) > 1e-6) zs.push(z);
    }
    for (let k = 1; k < zs.length; k++)
      expect(zs[k] ?? 0).toBeGreaterThanOrEqual((zs[k - 1] ?? 0) - 1e-6);
  });
});
