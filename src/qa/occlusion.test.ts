import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Mesh } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { hiddenParts, zFighting } from './occlusion.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const two = (a: Mesh, b: Mesh) =>
  compile(
    defineAsset({
      name: 'two',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build: (ctx) => {
        ctx.part('outer', a);
        ctx.part('inner', b);
      },
    }),
  );
const outer = box({ size: [1, 1, 1], color: c });

describe('occlusion gates', () => {
  it('flag coplanar same-facing faces and a part sealed inside another', () => {
    const flush = two(outer, box({ size: [0.4, 0.4, 1], color: c }));
    expect(zFighting(flush).map((f) => f.part)).toContain('inner');
    const sealed = two(outer, box({ size: [0.3, 0.3, 0.3], at: [0, 0, 0.3], color: c }));
    expect(hiddenParts(sealed).map((f) => f.part)).toEqual(['inner']);
  });

  it('pass a part standing proud and a part seated on top', () => {
    const proud = two(outer, box({ size: [0.4, 0.4, 1.01], at: [0, 0, -0.005], color: c }));
    expect(zFighting(proud)).toEqual([]);
    const seated = two(outer, box({ size: [0.3, 0.3, 0.3], at: [0, 0, 1], color: c }));
    expect(hiddenParts(seated)).toEqual([]);
    expect(zFighting(seated)).toEqual([]);
  });
});
