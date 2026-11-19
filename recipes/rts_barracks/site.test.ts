// Site dressing rests on what holds it. Failure first: LOD2 dropped the stickers of the timber
// stack but kept their 4 cm, so three layers floated over slits of daylight.

import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh } from '@developerz.ai/ts23d';
import { timberStack } from './site.ts';

/** Heights between the mesh's bottom and top that no triangle spans: horizontal slits of air. */
function slits(m: Mesh): [number, number][] {
  const z = (i: number) => m.positions[i * 3 + 2] ?? 0;
  const spans: [number, number][] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const zs = [0, 1, 2].map((k) => z(m.indices[t + k] ?? 0));
    spans.push([Math.min(...zs), Math.max(...zs)]);
  }
  const levels = [...new Set(spans.flat().map((v) => Math.round(v * 1e5) / 1e5))].sort(
    (a, b) => a - b,
  );
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const [a = 0, b = 0] = [levels[i], levels[i + 1]];
    if (!spans.some(([lo, hi]) => lo <= a + 1e-5 && hi >= b - 1e-5)) out.push([a, b]);
  }
  return out;
}

describe('timberStack', () => {
  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: every layer bears on the one below (no slit between layers)`, () => {
      expect(slits(timberStack(lod, [0, 0, 0], createRng(1)))).toEqual([]);
    });
});
