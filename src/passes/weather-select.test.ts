import { describe, expect, it } from 'bun:test';
import { merge } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { sceneOf } from './weather-scene.ts';
import { parseWhere, select } from './weather-select.ts';
import { subdivideTo } from './weather-subdivide.ts';

describe('weather selectors', () => {
  it('rejects junk with the selector list in the fix', () => {
    expect(() => parseWhere('up-facing && wet')).toThrow(/ends early|unknown/);
    expect(() => parseWhere('(up-facing')).toThrow(/missing \)/);
    expect(() => parseWhere('up_facing')).toThrow(/unexpected '_'/);
  });

  it('composes & | ! over geometry: tops, edges, ground band, fasteners', () => {
    const m = subdivideTo(box({ size: [1, 1, 1], color: [1, 1, 1] }), 0.1);
    const sc = sceneOf(m, {}, { fasteners: [{ at: [0.5, 0, 0.6], radius: 0.05 }], touched: [] });
    const n = (v: number): number => m.normals[v * 3 + 2] ?? 0;
    const z = (v: number): number => m.positions[v * 3 + 2] ?? 0;
    const up = select(sc, 'up-facing');
    const notUp = select(sc, '!up-facing');
    const edges = select(sc, 'convex-edges');
    const low = select(sc, 'ground-near & side-facing');
    const below = select(sc, 'below-fasteners');
    for (let v = 0; v < up.length; v++) {
      expect((up[v] ?? 0) >= 0.5).toBe(n(v) > 0.9);
      expect((up[v] ?? 0) + (notUp[v] ?? 0)).toBeCloseTo(1, 6);
      if ((low[v] ?? 0) >= 0.5) expect(z(v)).toBeLessThan(0.35);
      if ((below[v] ?? 0) >= 0.5) expect(z(v)).toBeLessThan(0.6);
      const x = Math.abs(m.positions[v * 3] ?? 0);
      const y = Math.abs(m.positions[v * 3 + 1] ?? 0);
      const near = (t: number): boolean[] => [x > t, y > t, z(v) > 1 - (0.5 - t) || z(v) < 0.5 - t];
      const count = (t: number): number => near(t).filter(Boolean).length;
      // Every edge vertex wears; wear reaches at most one ring (≤ 0.1 m) in, never mid-face.
      if (count(0.49) >= 2) expect(edges[v] ?? 0).toBeGreaterThanOrEqual(0.5);
      if (count(0.39) < 2) expect(edges[v] ?? 0).toBeLessThan(0.5);
    }
    expect([...below].some((w) => w >= 0.5)).toBe(true);
  });

  it('finds shade under an overhang and sun on the open top', () => {
    const roof = box({ size: [1.4, 1.4, 0.05], at: [0, 0, 1.2], color: [1, 1, 1] });
    const post = subdivideTo(box({ size: [0.3, 0.3, 1.2], color: [1, 1, 1] }), 0.1);
    const m = merge([post, roof]);
    const sc = sceneOf(m, { sun: [0, 0, 1] }, { fasteners: [], touched: [] });
    const shaded = select(sc, 'shaded');
    const sunlit = select(sc, 'sunlit');
    for (let v = 0; v < m.positions.length / 3; v++) {
      const z = m.positions[v * 3 + 2] ?? 0;
      const nz = m.normals[v * 3 + 2] ?? 0;
      if (z > 1.24 && nz > 0.9) expect(sunlit[v] ?? 0).toBeGreaterThan(0.5);
      if (z > 0.8 && z < 1.19 && Math.abs(nz) < 0.1) expect(shaded[v] ?? 0).toBeGreaterThan(0.5);
    }
  });
});
