import { describe, expect, it } from 'bun:test';
import { compile } from './asset.ts';
import { defineFamily } from './family.ts';

const crate = defineFamily({
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  defaults: { slats: 3, lid: true },
  build(ctx, p) {
    for (let i = 0; i < p.slats; i++) ctx.group(`slat_${i}`);
    if (p.lid) ctx.group('lid');
  },
});

describe('defineFamily', () => {
  it('makes variants that differ by one key', () => {
    const open = compile(crate.variant({ name: 'crate_open', params: { lid: false } }));
    expect(open.parts.map((p) => p.name)).toEqual(['slat_0', 'slat_1', 'slat_2']);
    expect(compile(crate.variant({ name: 'crate_big', params: { slats: 5 } })).parts).toHaveLength(
      6,
    );
  });

  it('extends a family, adding params and wrapping the base build', () => {
    const military = crate.extend({
      defaults: { stencil: 'WH' },
      build(ctx, p, base) {
        base();
        ctx.group(`stencil_${p.stencil.toLowerCase()}`);
      },
    });
    const names = compile(military.variant({ name: 'ammo_box' })).parts.map((p) => p.name);
    expect(names).toContain('lid');
    expect(names).toContain('stencil_wh');
  });
});
