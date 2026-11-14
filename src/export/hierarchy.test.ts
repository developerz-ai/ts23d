import { expect, it } from 'bun:test';
import { compile, defineAsset, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { BinWriter } from './bin-writer.ts';
import { newDoc, writeHierarchy } from './hierarchy.ts';

const asset = compile(
  defineAsset({
    name: 'lid_box',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.group('lid', { at: [0, 0, 1] });
      ctx.part('lid_plate', box({ size: [1, 1, 0.1], color: [1, 1, 1] }), { parent: 'lid' });
    },
  }),
);
const options = { materialOf: () => 0, withSheet: false, animations: false };

it('throws T3D_PART_UNKNOWN on a parent with no node instead of hanging it off the root', () => {
  const dangling = { ...asset, parts: asset.parts.map((p) => ({ ...p, parent: 'ghost' })) };
  const write = (): number => writeHierarchy(newDoc(new BinWriter()), dangling, 'root', options);
  expect(write).toThrow(Ts23dError);
  expect(write).toThrow(/T3D_PART_UNKNOWN.*'ghost'/);
});

it('hangs a child under its parent node', () => {
  const doc = newDoc(new BinWriter());
  const root = writeHierarchy(doc, asset, 'root', options);
  expect(doc.nodes[root]?.['children']).toEqual([1]);
  expect(doc.nodes[1]?.['children']).toEqual([2]);
});
