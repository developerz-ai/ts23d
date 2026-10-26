import { expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { mergeToPivots } from './merge-pivots.ts';

const c: [number, number, number] = [1, 1, 1];

it('merges static parts into their pivot and keeps pivots by name', () => {
  const tank = defineAsset({
    name: 'tank',
    kind: 'vehicle',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('hull_a', box({ size: [2, 1, 1], color: c }));
      ctx.part('hull_b', box({ size: [1, 1, 0.5], color: c }), { at: [0, 0, 1] });
      ctx.group('turret', { at: [0, 0, 1.5], yaw: 0.3 });
      ctx.part('turret_body', box({ size: [1, 1, 0.5], color: c }), { parent: 'turret' });
      ctx.part('hatch', box({ size: [0.3, 0.3, 0.1], color: c }), {
        parent: 'turret',
        at: [0, 0, 0.5],
      });
    },
  });
  const merged = mergeToPivots(compile(tank));
  expect(merged.parts.map((p) => p.name)).toEqual(['body', 'turret']);
  const turret = merged.parts[1];
  // Turret-local: the hatch sits on top of the body, both still in the turret's own frame.
  expect(turret?.mesh && boundsOf(turret.mesh).max[2]).toBeCloseTo(0.6, 5);
});
