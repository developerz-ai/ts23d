// The far door's rust blocks share one plane 1 mm off the leaf, so they must tile it: no two
// overlap (an overlap z-fights) and none hangs off the leaf. Failure first: the bands overlapped
// each other and the lowest hinge's 42 cm run, which started 17 cm below the door's foot.
import { describe, expect, it } from 'bun:test';
import { farRust } from './weather_demo.ts';

type Rect = { y0: number; y1: number; z0: number; z1: number };

describe('weather_demo far rust', () => {
  const rects = farRust((y, z, w, h): Rect => ({ y0: y - w / 2, y1: y + w / 2, z0: z, z1: z + h }));
  it('stays on the 0.91 × 2.03 m leaf', () => {
    for (const r of rects) {
      expect(r.z0).toBeGreaterThanOrEqual(0);
      expect(r.z1).toBeLessThanOrEqual(2.03);
      expect(r.y0).toBeGreaterThanOrEqual(-0.455 - 1e-9);
      expect(r.y1).toBeLessThanOrEqual(0.455 + 1e-9);
    }
  });
  it('no two blocks overlap', () => {
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i], rects[j]];
        if (!a || !b) continue;
        const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        expect({ i, j, overlap: dy > 1e-9 && dz > 1e-9 }).toEqual({ i, j, overlap: false });
      }
  });
  it('each hinge run ends at its hinge', () => {
    const tops = rects.filter((r) => r.y1 - r.y0 < 0.1).map((r) => r.z1);
    expect(tops).toEqual([0.25, 1.0, 1.75]);
  });
});
