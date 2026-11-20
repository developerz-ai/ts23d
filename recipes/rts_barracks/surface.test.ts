// The team chevron is painted flag by flag: every piece lies on one flag, inside its joints, so
// the paint breaks at each joint like real paint on flagstones. Failure first: an emblem cut
// against a coarser grid than the floor it lies on bridges the 4 cm joints.

import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh } from '@developerz.ai/ts23d';
import { BROKEN_PLINTH, rectInside } from './plan.ts';
import { emblem, floor } from './surface.ts';

/** Connected pieces of a mesh (by shared vertex positions), as plan bounds. */
function pieces(m: Mesh): { x0: number; x1: number; y0: number; y1: number }[] {
  const n = m.positions.length / 3;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] ?? r;
    return r;
  };
  for (let t = 0; t < m.indices.length; t += 3)
    for (const k of [1, 2]) parent[find(m.indices[t + k] ?? 0)] = find(m.indices[t] ?? 0);
  const out = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const x = m.positions[i * 3] ?? 0;
    const y = m.positions[i * 3 + 1] ?? 0;
    const b = out.get(r) ?? { x0: x, x1: x, y0: y, y1: y };
    out.set(r, {
      x0: Math.min(b.x0, x),
      x1: Math.max(b.x1, x),
      y0: Math.min(b.y0, y),
      y1: Math.max(b.y1, y),
    });
  }
  return [...out.values()];
}

const SIZE = { len: 4.4, span: 6.2, arm: 1.7 };

describe('painted floor emblem', () => {
  const f = floor(0, createRng(1), []);
  const onOneFlag = (m: Mesh): boolean =>
    pieces(m).every((p) =>
      f.cells.some(
        (c) => p.x0 > c.x0 + 0.02 && p.x1 < c.x1 - 0.02 && p.y0 > c.y0 + 0.02 && p.y1 < c.y1 - 0.02,
      ),
    );

  it('fails an emblem cut against the far floor’s coarse field (it bridges joints)', () => {
    const coarse = floor(2, createRng(1), []).cells;
    expect(onOneFlag(emblem(0, createRng(2), coarse, [0.4, 0], SIZE))).toBe(false);
  });

  it('LOD0: every painted piece lies on one flag, inside its joints', () => {
    const m = emblem(0, createRng(2), f.cells, [0.4, 0], SIZE);
    expect(pieces(m).length).toBeGreaterThan(10);
    expect(onOneFlag(m)).toBe(true);
  });
});

describe('floor on a raided plinth', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`LOD${lod}: the full layout overhangs the blown-off corner (failure case)`, () => {
      const full = floor(lod, createRng(1), []).cells;
      expect(full.every((c) => rectInside(BROKEN_PLINTH, c, 0.25))).toBe(false);
    });

    it(`LOD${lod}: every laid flag lies on the broken slab`, () => {
      const f = floor(lod, createRng(1), [], BROKEN_PLINTH);
      expect(f.cells.length).toBeGreaterThan(0);
      expect(f.cells.every((c) => rectInside(BROKEN_PLINTH, c, 0.25))).toBe(true);
      const xs = f.mesh.positions.filter((_, i) => i % 3 === 0);
      const ys = f.mesh.positions.filter((_, i) => i % 3 === 1);
      // Nothing over the corner the raid took (x > 2.9 m, y < -5 m of the 5.5 × 7.5 m half-plan).
      expect(xs.some((x, i) => x > 3.0 && (ys[i] ?? 0) < -6.9)).toBe(false);
    });
  }
});
