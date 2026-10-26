import { expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { cylinder } from '../primitives/index.ts';
import { toGlb } from './glb.ts';

const bottle = defineAsset({
  name: 'shampoo',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  build(ctx) {
    ctx.part(
      'body',
      cylinder({
        radius: 0.035,
        length: 0.2,
        segments: 24,
        at: [0, 0, 0.1],
        color: [0.2, 0.5, 0.9],
      }),
      { surface: 'translucent' },
    );
    ctx.part(
      'cap',
      cylinder({ radius: 0.02, length: 0.03, segments: 16, at: [0, 0, 0.215], color: [1, 1, 1] }),
    );
  },
});

it('splits surfaces into shared materials with the transmission extensions declared', () => {
  const glb = toGlb(compile(bottle));
  const dv = new DataView(glb.buffer);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
  expect(json.materials.map((m: { name: string }) => m.name)).toEqual([
    'ts23d_trim',
    'ts23d_translucent',
  ]);
  expect(json.extensionsUsed).toContain('KHR_materials_transmission');
  expect(json.nodes.map((n: { name: string }) => n.name)).toEqual([
    'shampoo',
    'body',
    'body_translucent',
  ]);
});
