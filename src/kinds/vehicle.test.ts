import { expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset } from '../core/index.ts';
import { propeller, whyteAxles } from './vehicle.ts';

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

it('centres a Whyte layout on x = 0 (no spacing counted after the last axle)', () => {
  const o = { leading: 0.4, driving: 0.8, trailing: 0.4, spacing: 0.3 };
  // Equal wheels: the outer rims sit the same distance either side of the centre.
  const six = whyteAxles('0-6-0', o);
  expect(six.map((a) => a.x)).toEqual([1.9, 0, -1.9].map((x) => expect.closeTo(x, 9)));
  for (const arrangement of ['0-6-0', '4-4-0', '2-8-2', '4-6-2']) {
    const axles = whyteAxles(arrangement, o);
    const front = Math.max(...axles.map((a) => a.x + a.radius));
    const rear = Math.min(...axles.map((a) => a.x - a.radius));
    expect(front + rear).toBeCloseTo(0, 9);
  }
  // Front (+X) is the leading end.
  expect(whyteAxles('4-4-0', o)[0]).toMatchObject({ role: 'leading' });
  expect(whyteAxles('4-4-0', o)[0]?.x).toBeGreaterThan(0);
});
