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
    ctx.emitter('chimney_smoke', {
      kind: 'smoke',
      at: [0, 0, 1.1],
      rate: 8,
      life: 3,
      size: [0.2, 1.5],
    });
    ctx.part('lid', box({ size: [1, 1, 0.1], color: [0.5, 0.4, 0.3] }), {
      at: [0, 0, 1],
      motion: { kind: 'spin', axis: [0, 0, 1], rps: 0.5 },
    });
  },
});

describe('toGlb', () => {
  it('writes a valid GLB header and JSON chunk', () => {
    const glb = toGlb(compile(crate), { animations: true });
    const dv = new DataView(glb.buffer);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))),
    );
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual([
      'crate',
      'body',
      'chimney_smoke',
      'lid',
    ]);
    expect(json.nodes[2].extras.ts23d.emitter.kind).toBe('smoke');
    const raw = toGlb(compile(crate), { keepParts: true });
    expect(raw.byteLength).toBeGreaterThan(0);
    expect(json.animations.map((a: { name: string }) => a.name)).toEqual(['rest', 'run']);
    expect(json.animations[1].channels).toHaveLength(1);
  });

  it('ships no animation unless asked (viewers autoplay the first clip)', () => {
    const glb = toGlb(compile(crate));
    const dv = new DataView(glb.buffer);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))),
    );
    expect(json.animations).toBeUndefined();
  });

  it('is byte-deterministic', () => {
    expect(Bun.hash(toGlb(compile(crate)))).toBe(Bun.hash(toGlb(compile(crate))));
  });
});
