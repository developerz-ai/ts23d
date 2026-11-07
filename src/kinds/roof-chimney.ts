// A chimney stack for `roofMesh`: brick shaft from the wall plate (hidden in the attic, so it
// always meets the roof) to a set height above where it leaves the slope, with an oversailing
// cap course (LOD0/1) and clay pots (LOD0). Building-regs rule of thumb: ≥ 0.9 m above the
// highest point where it passes through the roof.

import { type Lod, type Mesh, MeshBuilder, merge, type Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { box, lathe } from '../primitives/index.ts';
import { emitFace } from './faces.ts';

export interface RoofChimney {
  /** Centre offset from the roof's `at`, world X/Y metres. */
  readonly at: readonly [number, number];
  /** Stack width (X) and depth (Y). Default [0.9, 0.6]. */
  readonly size?: readonly [number, number];
  /** Height above the highest roof point it touches. Default 0.9. */
  readonly height?: number;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Clay pots on top (LOD0). Default: one per 0.4 m of width. */
  readonly pots?: number;
  readonly potColor?: Vec3;
}

export function chimney(
  c: RoofChimney,
  heightAt: (x: number, y: number) => number,
  at: Vec3,
  lod: Lod,
): Mesh {
  const [w, d] = c.size ?? [0.9, 0.6];
  const cx = at[0] + c.at[0];
  const cy = at[1] + c.at[1];
  const corners: [number, number][] = [
    [cx - w / 2, cy - d / 2],
    [cx + w / 2, cy - d / 2],
    [cx + w / 2, cy + d / 2],
    [cx - w / 2, cy + d / 2],
  ];
  const exit = Math.max(...corners.map(([x, y]) => heightAt(x, y)));
  const top = exit + (c.height ?? 0.9);
  const z0 = at[2];
  const strip = c.strip ?? 'brick';
  const b = new MeshBuilder();
  corners.forEach(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % 4] ?? [x0, y0];
    emitFace(b, {
      points: [
        [x0, y0, z0],
        [x1, y1, z0],
        [x1, y1, top],
        [x0, y0, top],
      ],
      normal: [y1 - y0, -(x1 - x0), 0],
      up: [0, 0, 1],
      vOrigin: [0, 0, z0],
      color: c.color,
      strip,
      banded: lod < 2,
    });
  });
  emitFace(b, {
    points: corners.map(([x, y]) => [x, y, top] as Vec3),
    normal: [0, 0, 1],
    up: [0, 1, 0],
    vOrigin: [cx, cy, top],
    color: c.color,
    strip: 'plain',
    banded: false,
  });
  const parts = [b.build()];
  if (lod < 2) {
    const k = 0.06;
    const cap: Vec3 = [c.color[0] * 0.85, c.color[1] * 0.85, c.color[2] * 0.85];
    parts.push(box({ size: [w + 2 * k, d + 2 * k, 0.1], at: [cx, cy, top - 0.22], color: cap }));
    parts.push(box({ size: [w + k, d + k, 0.07], at: [cx, cy, top - 0.07], color: cap }));
  }
  if (lod === 0) {
    const n = c.pots ?? Math.max(1, Math.round(w / 0.4));
    const pot = c.potColor ?? [0.62, 0.32, 0.2];
    for (let i = 0; i < n; i++) {
      const x = cx - w / 2 + (w * (i + 0.5)) / n;
      parts.push(
        lathe({
          profile: [
            [0.13, 0],
            [0.1, 0.36],
            [0.125, 0.4],
            [0.125, 0.46],
          ],
          segments: 8,
          caps: true,
          at: [x, cy, top - 0.02],
          color: pot,
        }),
      );
    }
  }
  return merge(parts);
}
