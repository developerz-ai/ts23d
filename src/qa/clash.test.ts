import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { clashes } from './clash.ts';
import { floatingParts } from './floating.ts';

const c: [number, number, number] = [1, 1, 1];
const cart = (fenderZ: number, clearOf?: string[]) =>
  defineAsset({
    name: 'cart',
    kind: 'vehicle',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('wheel', cylinder({ radius: 0.5, length: 0.2, segments: 32, axis: 'y', color: c }), {
        at: [0, 0, 0.5],
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
        ...(clearOf ? { clearOf } : {}),
      });
      ctx.part('fender', box({ size: [1.2, 0.3, 0.05], at: [0, 0, fenderZ], color: c }));
    },
  });

describe('clashes gate', () => {
  it('fails a fender inside the wheel sweep', () => {
    expect(clashes(compile(cart(0.9))).map((f) => f.part)).toEqual(['fender']);
  });

  it('passes with running clearance', () => {
    expect(clashes(compile(cart(1.05)))).toEqual([]);
  });

  it('respects clearOf for intended interlocks', () => {
    expect(clashes(compile(cart(0.9, ['fender'])))).toEqual([]);
  });
});

describe('floating gate (surface contact)', () => {
  it('fails a part whose surface is 5 cm away', () => {
    const a = defineAsset({
      name: 'gap',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build(ctx) {
        ctx.part('base', box({ size: [1, 1, 1], color: c }));
        ctx.part('lid', box({ size: [1, 1, 0.1], color: c }), { at: [0, 0, 1.05] });
      },
    });
    expect(floatingParts(compile(a)).map((f) => f.part)).toEqual(['lid']);
  });
});
