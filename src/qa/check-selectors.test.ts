// check-selectors: a recipe check whose selector names no part at any LOD is a typo, not a pass.

import { describe, expect, it } from 'bun:test';
import { type Check, compile, defineAsset, type Lod } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { checkSelectors } from './check-selectors.ts';
import { clear, noOverlap, touches } from './checks.ts';

const c: [number, number, number] = [1, 1, 1];
const lamp = (checks: readonly Check[]) =>
  defineAsset({
    name: 'lamp',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    checks,
    build(ctx) {
      ctx.part('pole', box({ size: [0.1, 0.1, 2], color: c }));
      ctx.part('lantern', box({ size: [0.3, 0.3, 0.2], at: [0, 0, 2], color: c }));
      // LOD-gated detail: only the near LOD has the finial.
      if (ctx.lod === 0)
        ctx.part('finial', box({ size: [0.05, 0.05, 0.1], at: [0, 0, 2.2], color: c }));
    },
  });
const lods = (checks: readonly Check[]) =>
  ([0, 1, 2] as const).map((lod: Lod) => compile(lamp(checks), { lod }));

describe('checkSelectors', () => {
  it('fails a typo in touches and a glob in clear that match no part at any LOD, naming close parts', () => {
    const found = checkSelectors(lods([touches('lanturn', 'pole'), clear('sign_*', 'nothing_*')]));
    expect(found.map((f) => f.code)).toEqual(['T3D_QA_CHECK', 'T3D_QA_CHECK', 'T3D_QA_CHECK']);
    expect(found.map((f) => f.gate)).toEqual(['check', 'check', 'check']);
    expect(found[0]?.message).toContain("'lanturn' matches no part at any LOD");
    expect(found[0]?.fix).toContain("'lantern'");
    expect(found.map((f) => f.message).join('\n')).toContain("'sign_*'");
    expect(found.map((f) => f.message).join('\n')).toContain("'nothing_*'");
  });

  it('fails a noOverlap selector that matches nothing', () => {
    expect(checkSelectors(lods([noOverlap('wheel_*')])).length).toBe(1);
  });

  it('keeps the silent skip for a part that exists at only some LODs, and passes good selectors', () => {
    expect(checkSelectors(lods([touches('finial', 'lantern'), clear('pole', 'lantern')]))).toEqual(
      [],
    );
    // One LOD alone (a `--lod 2` build) has no finial: still no finding without the others.
    const far = lods([touches('finial', 'lantern')]).slice(2);
    expect(checkSelectors(far)).toEqual([]);
  });

  it('ignores hand-written checks, whose selectors it cannot see', () => {
    expect(checkSelectors(lods([() => []]))).toEqual([]);
  });
});
