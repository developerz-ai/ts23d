import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb } from './glb.ts';

const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    ctx.part('body', box({ size: [1, 1, 1], color: [0.5, 0.4, 0.3] }));
    ctx.part('lid', box({ size: [1, 1, 0.1], color: [0.5, 0.4, 0.3] }), {
      at: [0, 0, 1],
      motion: { kind: 'spin', axis: [0, 0, 1], rps: 0.5 },
    });
  },
});

describe('toGlb', () => {
  it('writes a valid GLB header and JSON chunk', () => {
    const glb = toGlb(compile(crate));
    const dv = new DataView(glb.buffer);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))),
    );
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual(['crate', 'body', 'lid']);
    expect(json.animations[0].channels).toHaveLength(1);
  });

  it('is byte-deterministic', () => {
    expect(Bun.hash(toGlb(compile(crate)))).toBe(Bun.hash(toGlb(compile(crate))));
  });
});
