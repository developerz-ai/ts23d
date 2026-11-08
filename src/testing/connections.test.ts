import { describe, expect, it } from 'bun:test';
import { defineAsset, type Mesh, merge, Ts23dError } from '../core/index.ts';
import { box, lathe, sd, sdf } from '../primitives/index.ts';
import { assertConnected, assertGrown } from './connections.ts';

const grey: [number, number, number] = [0.5, 0.5, 0.5];
const ball = (): Mesh =>
  sdf({
    field: sd.sphere([0, 0, 0.3], 0.3),
    bounds: [
      [-0.35, -0.35, -0.05],
      [0.35, 0.35, 0.65],
    ],
    resolution: 0.02,
    color: grey,
  });
const horn = (sink: number): Mesh =>
  lathe({
    profile: [
      [0.06, -sink],
      [0, 0.25 - sink],
    ],
    segments: 24,
    caps: true,
    color: grey,
    at: [0, 0, 0.6],
  });

const beast = (sink: number) =>
  defineAsset({
    name: 'beast',
    kind: 'prop',
    budget: { triangles: [99999, 99999, 99999] },
    build: (ctx) => {
      ctx.part('body', ball());
      ctx.part('horn', horn(sink));
    },
  });

const code = (f: () => void): string => {
  try {
    f();
    return 'passed';
  } catch (e) {
    return e instanceof Ts23dError ? e.code : 'other';
  }
};

describe('assertConnected', () => {
  it('fails a hidden loose shell, passes a solid block', () => {
    const loose = defineAsset({
      name: 'loose',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build: (ctx) =>
        ctx.part(
          'hull',
          merge([
            box({ size: [1, 1, 0.5], color: grey }),
            box({ size: [0.1, 0.1, 0.1], at: [0, 0, 0.7], color: grey }),
          ]),
        ),
    });
    expect(code(() => assertConnected(loose))).toBe('T3D_QA_FAILED');
    const block = defineAsset({
      name: 'block',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build: (ctx) => ctx.part('hull', box({ size: [1, 1, 0.5], color: grey })),
    });
    expect(code(() => assertConnected(block))).toBe('passed');
  });
});

describe('assertGrown', () => {
  it('fails a horn set on the surface and a missing part, on any kind', () => {
    expect(code(() => assertGrown(beast(0), 'horn'))).toBe('T3D_QA_FAILED');
    expect(code(() => assertGrown(beast(0.04), 'tusk_*'))).toBe('T3D_QA_FAILED');
  });

  it('passes a horn whose root is buried and blended', () => {
    const blended = defineAsset({
      name: 'blended',
      kind: 'prop',
      budget: { triangles: [99999, 99999, 99999] },
      build: (ctx) => {
        ctx.part('body', ball());
        ctx.part(
          'horn',
          lathe({
            profile: [
              [0.16, -0.05],
              [0.11, -0.02],
              [0.08, 0.01],
              [0.065, 0.05],
              [0, 0.28],
            ],
            segments: 24,
            caps: true,
            color: grey,
            at: [0, 0, 0.6],
          }),
        );
      },
    });
    expect(code(() => assertGrown(blended, 'horn'))).toBe('passed');
  });
});
