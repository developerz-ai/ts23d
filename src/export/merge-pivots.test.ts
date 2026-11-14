import { expect, it } from 'bun:test';
import { boundsOf, compile, defineAsset, worldTransforms } from '../core/index.ts';
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

const spin = { kind: 'spin', axis: [0, 1, 0], rps: 1 } as const;

it('re-parents a pivot past a static chain to the root, at its world transform', () => {
  const asset = compile(
    defineAsset({
      name: 'chain',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.part('frame', box({ size: [1, 1, 1], color: c }), { at: [0, 0, 1], yaw: Math.PI / 2 });
        ctx.part('axle', box({ size: [0.2, 0.2, 0.2], color: c }), {
          parent: 'frame',
          at: [1, 0, 0],
          yaw: Math.PI / 2,
        });
        ctx.part('wheel', box({ size: [0.2, 0.2, 0.2], color: c }), {
          parent: 'axle',
          at: [0.5, 0, 0],
          motion: spin,
        });
      },
    }),
  );
  const wheel = mergeToPivots(asset).parts.find((p) => p.name === 'wheel');
  const qa = worldTransforms(asset.parts).get('wheel');
  expect(wheel?.parent).toBeNull();
  expect(wheel?.yaw).toBeCloseTo(Math.PI, 9);
  for (const k of [0, 1, 2]) expect(wheel?.at[k] ?? 9).toBeCloseTo(qa?.origin[k] ?? 0, 9);
});

it('re-parents to the nearest pivot ancestor and keeps moving-under-moving chains', () => {
  const asset = compile(
    defineAsset({
      name: 'rotor',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.group('turret', { at: [0, 0, 1], yaw: 0.3 });
        ctx.part('mount', box({ size: [0.4, 0.4, 0.4], color: c }), {
          parent: 'turret',
          at: [1, 0, 0],
          yaw: 0.2,
        });
        ctx.part('hub', box({ size: [0.2, 0.2, 0.2], color: c }), {
          parent: 'mount',
          at: [0, 0.5, 0],
          motion: spin,
        });
        ctx.part('blade', box({ size: [0.1, 0.6, 0.02], color: c }), {
          parent: 'hub',
          at: [0, 0, 0.2],
          motion: { kind: 'spin', axis: [0, 0, 1], rps: 2 },
        });
      },
    }),
  );
  const merged = mergeToPivots(asset);
  const hub = merged.parts.find((p) => p.name === 'hub');
  const blade = merged.parts.find((p) => p.name === 'blade');
  expect(hub?.parent).toBe('turret');
  expect(hub?.yaw).toBeCloseTo(0.2, 9);
  // Turret-local: the mount's 0.2 rad yaw turns the hub's [0, 0.5, 0] offset.
  expect(hub?.at[0] ?? 9).toBeCloseTo(1 - 0.5 * Math.sin(0.2), 9);
  expect(hub?.at[1] ?? 9).toBeCloseTo(0.5 * Math.cos(0.2), 9);
  expect(blade?.parent).toBe('hub');
  expect(blade?.at).toEqual([0, 0, 0.2]);
});
