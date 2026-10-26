// The play terrain as a ts23d asset: one `heightfield` chunk per 50 m square, fewer cells per LOD.
// Worker-only (it imports the library).

import { type Asset, defineAsset, heightfield, type Lod } from '@developerz-ai/ts23d';
import { groundColor } from '../ground-color.ts';
import { CHUNK, dirt, EXTENT, heightAt } from './height.ts';

const CELLS: Record<Lod, number> = { 0: 25, 1: 10, 2: 4 };

export const terrainAsset: Asset = defineAsset({
  name: 'play_terrain',
  kind: 'terrain',
  description: 'Rolling hills, flattened town and rail areas, dirt tracks',
  budget: { triangles: [200_000, 40_000, 8_000] },
  build(ctx) {
    const n = CELLS[ctx.lod];
    for (let cy = -EXTENT; cy < EXTENT; cy += CHUNK) {
      for (let cx = -EXTENT; cx < EXTENT; cx += CHUNK) {
        const ox = cx + CHUNK / 2;
        const oy = cy + CHUNK / 2;
        const h = (x: number, y: number): number => heightAt(x + ox, y + oy);
        ctx.part(
          `chunk_${(cx + EXTENT) / CHUNK}_${(cy + EXTENT) / CHUNK}`,
          heightfield({
            rect: [-CHUNK / 2, -CHUNK / 2, CHUNK / 2, CHUNK / 2],
            cells: [n, n],
            height: h,
            color: (x, y, z) => groundColor(h, x, y, z, dirt(x + ox, y + oy)),
          }),
          { at: [ox, oy, 0] },
        );
      }
    }
  },
});
