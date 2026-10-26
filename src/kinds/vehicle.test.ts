import { expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset } from '../core/index.ts';
import { propeller } from './vehicle.ts';

it('spreads propeller blades evenly around the hub', () => {
  const a = defineAsset({
    name: 'prop',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build: (ctx) =>
      propeller(ctx, { name: 'prop', at: [0, 0, 2], radius: 1, blades: 3, color: [1, 1, 1] }),
  });
  const blades = compile(a).parts.filter((p) => p.name.startsWith('prop_blade_'));
  const tips = blades.map((p) => (p.mesh ? boundsOf(p.mesh) : null));
  // Blade 0 points up; blades 1 and 2 reach below the hub (120° apart).
  expect(tips[0]?.max[2]).toBeCloseTo(1, 1);
  expect(tips[1]?.min[2]).toBeLessThan(-0.4);
  expect(tips[2]?.min[2]).toBeLessThan(-0.4);
});
