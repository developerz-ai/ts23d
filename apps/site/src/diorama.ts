// The viewer's diorama base: a small heightfield mound under the model that falls away at its rim,
// so the asset reads as a presentation piece rather than a floating model.

import { type Asset, defineAsset, heightfield } from '@developerz-ai/ts23d';
import { groundColor, type Height } from './ground-color.ts';
import { fbm, smoothstep } from './noise.ts';

/** A model's ground footprint in authoring space (Z-up): centre and half extents, metres. */
export interface Footprint {
  readonly cx: number;
  readonly cy: number;
  readonly hx: number;
  readonly hy: number;
}

/** Build a base sized to a model's footprint. Pure: runs in the compile worker. */
export function dioramaFor(name: string, { cx, cy, hx, hy }: Footprint): Asset {
  const size = { x: hx * 2, z: hy * 2 };
  const R = Math.max(hx, hy) * 1.3 + 1.2;
  const height: Height = (x, y) => {
    const r = Math.hypot(x - cx, y - cy);
    // 0 under the footprint, gentle mounds around it, then a drop at the rim.
    const ex = Math.max(0, Math.abs(x - cx) - hx) / (R - hx);
    const ey = Math.max(0, Math.abs(y - cy) - hy) / (R - hy);
    const out = Math.min(1, Math.hypot(ex, ey) * 1.6);
    const mounds = (fbm(x / 2.5, y / 2.5, 5, 3) * 0.5 + 0.35) * Math.max(0.4, R / 6) * 0.35;
    return out * mounds - 0.02 - smoothstep(R * 0.82, R, r) * (0.35 + R * 0.04);
  };
  const tracks = (x: number, y: number): number =>
    // Wear ruts continuing the model's long axis, as if it drove onto the base.
    size.x >= size.z
      ? (1 - smoothstep(0.15, 0.6, Math.abs(Math.abs(y - cy) - hy * 0.8))) * 0.7
      : (1 - smoothstep(0.15, 0.6, Math.abs(Math.abs(x - cx) - hx * 0.8))) * 0.7;
  const cells = Math.min(96, Math.max(32, Math.round(R * 6)));
  return defineAsset({
    name: `diorama_${name}`,
    kind: 'terrain',
    budget: { triangles: [cells * cells * 2, cells * cells * 2, cells * cells * 2] },
    build(ctx) {
      ctx.part(
        'ground',
        heightfield({
          rect: [cx - R, cy - R, cx + R, cy + R],
          cells: [cells, cells],
          height,
          color: (x, y, z) => groundColor(height, x, y, z, tracks(x, y), 0.6),
        }),
      );
    },
  });
}
