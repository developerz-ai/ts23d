// T-34/76 medium tank, blockout. Real dimensions: hull 6.68 × 3.0 × ~1.5 m, 5 road wheels/side.
// Shows: tracked running gear, a turret group that can traverse, a gun that elevates.

import { box, cylinder, defineAsset, hex, trackRun } from '@developerz-ai/ts23d';

const green = hex('#4b5320');
const dark = hex('#2a2d22');

export const t34 = defineAsset({
  name: 't34',
  kind: 'vehicle',
  description: 'T-34/76 medium tank — tracked running gear, traversing turret',
  tags: ['military', 'tracked', 'ww2'],
  budget: { triangles: [6000, 2500, 800] },
  build(ctx) {
    for (const side of ['l', 'r'] as const) {
      const y = side === 'l' ? 1.22 : -1.22;
      trackRun(ctx, {
        side,
        y,
        length: 5.6,
        wheels: 5,
        radius: 0.41,
        width: 0.5,
        color: dark,
        track: dark,
      });
    }
    ctx.part(
      'hull_lower',
      box({ size: [6.0, 1.9, 0.6], at: [0, 0, 0.35], color: green, strip: 'iron' }),
    );
    ctx.part(
      'hull_upper',
      box({ size: [5.6, 3.0, 0.55], at: [0, 0, 0.95], color: green, strip: 'iron' }),
    );
    ctx.part(
      'glacis',
      box({ size: [0.9, 2.9, 0.4], at: [3.1, 0, 0.75], color: green, strip: 'iron' }),
    );
    ctx.group('turret', { at: [0.6, 0, 1.5] });
    ctx.part('turret_body', box({ size: [2.3, 2.0, 0.75], color: green, strip: 'iron' }), {
      parent: 'turret',
    });
    if (ctx.lod < 2) {
      ctx.part(
        'turret_hatch',
        cylinder({ radius: 0.35, length: 0.1, segments: 16, at: [-0.4, 0, 0.8], color: green }),
        { parent: 'turret' },
      );
    }
    ctx.group('gun', { at: [1.15, 0, 0.4], parent: 'turret' });
    ctx.part(
      'gun_barrel',
      cylinder({
        radius: 0.07,
        length: 2.6,
        segments: [12, 8, 6][ctx.lod] ?? 6,
        axis: 'x',
        at: [1.3, 0, 0],
        color: dark,
      }),
      { parent: 'gun' },
    );
    ctx.part('gun_mantlet', box({ size: [0.35, 0.7, 0.4], at: [0.1, 0, -0.2], color: green }), {
      parent: 'gun',
    });
  },
});
