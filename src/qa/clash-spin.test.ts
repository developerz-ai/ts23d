// Spin sweeps (clash-sweep.ts): exact per-centimetre slabs, so a wheelset without an axle mesh
// sweeps two discs and a pipe beside a flange is judged against the tyre under it.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, merge } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { clashes } from './clash.ts';

const c: [number, number, number] = [1, 1, 1];

// A LOD2 wheelset: two 0.76 m discs 1.4 m apart with no axle mesh between them, and a frame
// rail between the wheels inside their radius (loco_440's leading truck). Nothing spins there.
const wheelset = (railY: number) =>
  defineAsset({
    name: 'wheelset',
    kind: 'vehicle',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('axle', merge([]), {
        at: [0, 0, 0.38],
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
      });
      for (const s of [1, -1])
        ctx.part(
          `wheel_${s > 0 ? 'l' : 'r'}`,
          cylinder({
            radius: 0.38,
            length: 0.14,
            segments: 6,
            axis: 'y',
            at: [0, s * 0.75, 0],
            color: c,
          }),
          { parent: 'axle' },
        );
      ctx.part('rail', box({ size: [0.6, 0.05, 0.1], at: [0, railY, 0.55], color: c }));
    },
  });

describe('clashes gate: two wheels with nothing between them sweep two discs, not a drum', () => {
  it('passes a frame rail between the wheels, inside their radius', () => {
    expect(clashes(compile(wheelset(0.45)))).toEqual([]);
  });

  it('still fails the rail where a wheel turns', () => {
    expect(clashes(compile(wheelset(0.75))).map((f) => f.part)).toEqual(['rail']);
  });
});

// loco_440's driver: a 0.13 m tyre with a 2.8 cm flange on its inboard side, crank-pin collars
// out to ±1.07 m (so a slice of the 2.1 m span is 9 cm). A feed pipe runs 1.4 cm over the tyre,
// 3 cm outboard of the flange: a 9 cm slice holding both read the flange's radius over the pipe.
const driver = (pipeY: number) =>
  defineAsset({
    name: 'driver',
    kind: 'vehicle',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      const disc = (x: number, y: number, r: number, w: number) =>
        cylinder({ radius: r, length: w, segments: 48, axis: 'y', at: [x, y, 0], color: c });
      ctx.part(
        'wheelset',
        merge([
          ...[1, -1].flatMap((s) => [
            disc(0, s * 0.7825, 0.813, 0.13),
            disc(0, s * 0.7035, 0.841, 0.028),
            disc(0.3, s * 1.05, 0.07, 0.035),
          ]),
          disc(0, 0, 0.07, 1.5),
        ]),
        { at: [0, 0, 1.1], motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 } },
      );
      ctx.part('pipe', box({ size: [1, 0.04, 0.04], at: [0, pipeY, 1.1 + 0.827], color: c }));
    },
  });

describe('clashes gate: spin slices resolve centimetres along the axle', () => {
  it('passes a pipe 1.4 cm over the tyre, outboard of the flange', () => {
    expect(clashes(compile(driver(0.77)))).toEqual([]);
  });

  it('fails the same pipe over the flange', () => {
    expect(clashes(compile(driver(0.7035))).map((f) => f.part)).toEqual(['pipe']);
  });
});
