import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, merge } from '../core/index.ts';
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
    const [f] = floatingParts(compile(a));
    expect(f).toMatchObject({ part: 'lid', code: 'T3D_QA_FLOATING_PARTS', nearest: 'base' });
    expect(f?.gap ?? 0).toBeCloseTo(0.05, 2);
    expect(f?.fix).toContain('`at.z` is the bottom');
  });

  const ground = (at: [number, number, number], size: [number, number, number] = [0.3, 0.3, 0.3]) =>
    compile(
      defineAsset({
        name: 'ground',
        kind: 'prop',
        budget: { triangles: [99, 99, 99] },
        build(ctx) {
          ctx.part('base', box({ size: [1, 1, 1], color: c }));
          ctx.part('post', box({ size, color: c }), { at });
        },
      }),
    );

  it('fails a part wholly below ground (D36), with how far to raise it', () => {
    const found = floatingParts(ground([5, 5, -3]));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ part: 'post', code: 'T3D_QA_FLOATING_PARTS' });
    expect(found[0]?.gap ?? 0).toBeCloseTo(3, 1);
    expect(found[0]?.message).toContain('below ground');
  });

  it('passes a box resting on z = 0 and a post sunk 0.1 m into the ground', () => {
    expect(floatingParts(ground([5, 5, 0]))).toEqual([]);
    expect(floatingParts(ground([5, 5, -0.1], [0.1, 0.1, 1]))).toEqual([]);
  });

  it('reports the ground as the nearest support of a part hanging in the open', () => {
    const [f] = floatingParts(ground([5, 5, 0.4]));
    expect(f?.nearest).toBeUndefined();
    expect(f?.gap ?? 0).toBeCloseTo(0.4, 2);
  });
});

// A 1 m arm pointing +X from a hinge at z = 1, swinging about Y; a post stands at `postX`.
const arm = (motion: { degrees: number; oneWay?: boolean }, postAt: [number, number, number]) =>
  defineAsset({
    name: 'arm',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('arm', box({ size: [1, 0.1, 0.1], at: [0.55, 0, -0.05], color: c }), {
        at: [0, 0, 1],
        motion: { kind: 'sway', axis: [0, 1, 0], hz: 1, ...motion },
      });
      ctx.part('post', box({ size: [0.1, 0.1, 0.4], at: postAt, color: c }));
    },
  });

describe('clashes gate: sway sweeps its sector, not a full turn', () => {
  it('fails a post inside the swing', () => {
    // ±60° about Y: the tip dips to z ≈ 1 − sin 60° ≈ 0.13 at x ≈ 0.5; the post reaches z 0.6.
    expect(clashes(compile(arm({ degrees: 60 }, [0.5, 0, 0.2]))).map((f) => f.part)).toEqual([
      'post',
    ]);
  });

  it('passes a post behind the hinge that only a full revolution would reach', () => {
    expect(clashes(compile(arm({ degrees: 30 }, [-0.6, 0, 0.8])))).toEqual([]);
  });

  it('oneWay swings to one side only', () => {
    // About +Y a positive angle tips +X downward; a post above the arm is never reached one-way.
    expect(clashes(compile(arm({ degrees: 60, oneWay: true }, [0.5, 0, 1.3])))).toEqual([]);
    expect(clashes(compile(arm({ degrees: 60 }, [0.5, 0, 1.3]))).map((f) => f.part)).toEqual([
      'post',
    ]);
  });
});

// A door leaf hung in its opening: hinge axis just outside the post face, leaf 3 mm off the post.
const leaf = (axisZ: 1 | -1) =>
  defineAsset({
    name: 'leaf',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('door', box({ size: [0.06, 1, 1], at: [0.065, -0.503, 0], color: c }), {
        motion: { kind: 'sway', axis: [0, 0, axisZ], degrees: 90, hz: 1, oneWay: true },
      });
      ctx.part('post', box({ size: [0.16, 0.16, 1], at: [0.115, 0.08, 0], color: c }));
    },
  });

describe('clashes gate: a leaf hung flush beside its post', () => {
  it('fails when the leaf swings into the post', () => {
    expect(clashes(compile(leaf(1))).map((f) => f.part)).toEqual(['post']);
  });

  it('passes when it swings away (no slack bin sweeps it backwards into the post)', () => {
    expect(clashes(compile(leaf(-1)))).toEqual([]);
  });
});

// D23: a 1.4 m hood hinged at its front edge (pivot at mid-thickness), lifting its tail end,
// meshed in 14 cm × 10 cm tiles like a real panel. The old 5° bins paired the near-hinge skin's
// steep angles with the tip's radius, so anything a few cm under the closed panel read as swept.
const panel = merge(
  Array.from({ length: 100 }, (_, i) =>
    box({
      size: [0.14, 0.1, 0.02],
      at: [0.07 + 0.14 * (i % 10), -0.45 + 0.1 * Math.floor(i / 10), -0.01],
      color: c,
    }),
  ),
);
const hood = (obstacle: { size: [number, number, number]; at: [number, number, number] }) =>
  defineAsset({
    name: 'hood',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('hood', panel, {
        at: [0, 0, 1],
        motion: { kind: 'sway', axis: [0, -1, 0], degrees: 60, hz: 1, oneWay: true },
      });
      ctx.part('bay', box({ ...obstacle, color: c }));
    },
  });

describe('clashes gate: long hinged panel resolves to millimetres, not 5° bins (D23)', () => {
  it('passes a bay 3 cm below the closed panel', () => {
    // Panel underside at z 0.99; the bay (box `at` = base centre) tops out at 0.96 under it all.
    expect(clashes(compile(hood({ size: [1.2, 0.8, 0.1], at: [0.75, 0, 0.86] })))).toEqual([]);
  });

  it('fails a block inside the swept arc above the panel', () => {
    // 60° up: the panel sweeps x·sin θ above the hinge; a block at x 1.0, z 1.3 is inside it.
    expect(
      clashes(compile(hood({ size: [0.2, 0.4, 0.2], at: [1.0, 0, 1.3] }))).map((f) => f.part),
    ).toEqual(['bay']);
  });

  it('passes a bay 5 mm under the panel, fails one pushed up through it', () => {
    expect(clashes(compile(hood({ size: [1.2, 0.8, 0.1], at: [0.75, 0, 0.885] })))).toEqual([]);
    expect(
      clashes(compile(hood({ size: [1.2, 0.8, 0.1], at: [0.75, 0, 0.92] }))).map((f) => f.part),
    ).toEqual(['bay']);
  });
});

// A 1.4 m × 10 cm rotor spinning about Z through a 0.2 × 3 × 2 m slab (D35): no slab vertex or
// edge lies in its thin swept disc, only the slab's face interiors do.
const rotorThrough = (z: number) =>
  defineAsset({
    name: 'rotor',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('slab', box({ size: [0.2, 3, 2], color: c }));
      ctx.part('rotor', box({ size: [1.4, 0.1, 0.1], at: [0, 0, -0.05], color: c }), {
        at: [0.03, 0.07, z],
        motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 },
      });
    },
  });

describe('clashes gate: thin rotor through a big panel (D35)', () => {
  it('fails at every height through the slab, centre and off-centre', () => {
    const missed = [0.35, 0.6, 1, 1.3, 1.587, 1.6, 1.74].filter(
      (z) => clashes(compile(rotorThrough(z))).length !== 1,
    );
    expect(missed).toEqual([]);
    expect(clashes(compile(rotorThrough(1)))[0]).toMatchObject({
      part: 'slab',
      code: 'T3D_QA_CLASHES',
    });
  });

  it('passes the same rotor spinning above the slab', () => {
    expect(clashes(compile(rotorThrough(2.1)))).toEqual([]);
  });
});
