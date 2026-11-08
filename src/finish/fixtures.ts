// Test fixtures for /finish: tiny assets that make each failure mode easy to provoke — two
// coplanar slabs of different colours (part-mask leaks), a cube (projection recovery), and a cart
// with pivots, motion and a joint (identity of everything the code built). Not exported publicly.

import { compile, defineAsset, encodePng } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import type { ControlView, FinishModel, FinishRequest } from './types.ts';

const BIG = { triangles: [99999, 99999, 99999] as [number, number, number] };

/** Two slabs side by side, flush and coplanar: red left, blue right. */
export const slabs = defineAsset({
  name: 'slabs',
  kind: 'prop',
  budget: BIG,
  build(ctx) {
    ctx.part('left', box({ size: [0.5, 1, 0.3], at: [0, -0.25, 0], color: [0.8, 0.05, 0.05] }));
    ctx.part('right', box({ size: [0.5, 1, 0.3], at: [0, 0.25, 0], color: [0.05, 0.05, 0.8] }));
  },
});

export const cube = defineAsset({
  name: 'cube',
  kind: 'prop',
  budget: BIG,
  build(ctx) {
    ctx.part('cube', box({ size: [1, 1, 1], color: [0.6, 0.6, 0.6] }));
  },
});

/** Bed + two spinning wheels under a pivot group, glass lamp (never finished). */
export const cart = defineAsset({
  name: 'cart',
  kind: 'prop',
  budget: BIG,
  build(ctx) {
    ctx.part('bed', box({ size: [2, 1, 0.4], at: [0, 0, 0.45], color: [0.5, 0.3, 0.15] }));
    ctx.group('axle', { at: [0, 0, 0.4] });
    for (const s of [-1, 1])
      ctx.part(
        `wheel_${s < 0 ? 'l' : 'r'}`,
        cylinder({
          radius: 0.4,
          length: 0.1,
          segments: ctx.pick([24, 12, 8]),
          axis: 'y',
          color: [0.2, 0.2, 0.2],
        }),
        { parent: 'axle', at: [0, s * 0.55, 0], motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 } },
      );
    ctx.part('lamp', box({ size: [0.1, 0.1, 0.1], at: [1.05, 0, 0.6], color: [1, 1, 0.8] }), {
      surface: 'glass',
    });
  },
});

export const lod0 = (a: typeof cart) => compile(a, { lod: 0 });

/** A "model" painting each pixel with f(world position): what a perfect bake must recover. */
export const gradient = (p: readonly number[]): [number, number, number] => [
  128 + 100 * Math.sin(2.1 * (p[0] ?? 0)),
  128 + 100 * Math.sin(2.3 * (p[1] ?? 0)),
  128 + 100 * Math.sin(1.9 * (p[2] ?? 0)),
];

export function paintModel(
  id: string,
  paint: (v: ControlView, i: number) => [number, number, number] | undefined,
): FinishModel & { calls: number } {
  const m = {
    id,
    calls: 0,
    run(req: FinishRequest): Promise<Uint8Array[]> {
      m.calls++;
      return Promise.resolve(
        req.views.views.map((v) => {
          const out = new Uint8Array(v.width * v.height * 4);
          for (let i = 0; i < v.width * v.height; i++) {
            const c = paint(v, i);
            if (c) out.set([...c.map((x) => Math.round(x)), 255], i * 4);
          }
          return encodePng(v.width, v.height, out);
        }),
      );
    },
  };
  return m;
}

export const worldGradient = paintModel('gradient', (v, i) =>
  (v.part[i] ?? -1) < 0
    ? undefined
    : gradient([v.position[i * 3] ?? 0, v.position[i * 3 + 1] ?? 0, v.position[i * 3 + 2] ?? 0]),
);

/** Copies the control albedo shifted `dx` pixels right: a model that ignored the alignment. */
export const shifted = (dx: number) =>
  paintModel(`shifted-${dx}`, (v, i) => {
    const x = i % v.width;
    const j = i - dx;
    if (x < dx || (v.part[j] ?? -1) < 0) return undefined;
    return [v.albedo[j * 4] ?? 0, v.albedo[j * 4 + 1] ?? 0, v.albedo[j * 4 + 2] ?? 0];
  });

/** Repaints everything bright green. */
export const repaint = paintModel('repaint', (v, i) =>
  (v.part[i] ?? -1) < 0 ? undefined : [40, 220, 40],
);
