import { describe, expect, it } from 'bun:test';
import { merge } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { imperfect } from './imperfect.ts';
import { subdivideTo } from './weather-subdivide.ts';

const plank = (): ReturnType<typeof box> =>
  subdivideTo(box({ size: [2, 0.15, 0.03], at: [0, 0, 0.5], color: [1, 1, 1] }), 0.05);
const lowest = (m: ReturnType<typeof box>): number =>
  Math.min(
    ...Array.from({ length: m.positions.length / 3 }, (_, v) => m.positions[v * 3 + 2] ?? 0),
  );

describe('imperfect', () => {
  it('does nothing at LOD2 and reports zero there', () => {
    const p = plank();
    const r = imperfect(p, { lod: 2, sag: { max: 0.01 }, dents: { count: [3, 3] } });
    expect(r.mesh).toBe(p);
    for (const c of r.coverage) expect(c.actual).toBe(0);
  });

  it('sags a long plank by k·L² capped at max, ends on their supports', () => {
    const p = plank();
    const r = imperfect(p, { age: 1, sag: { max: 0.006 } });
    const sag = r.coverage.find((c) => c.effect === 'sag');
    expect(sag?.actual).toBeCloseTo(0.006, 6); // 0.005·4 m² = 20 mm, capped at 6 mm
    expect(lowest(p) - lowest(r.mesh)).toBeCloseTo(0.006, 3);
    // A short block is no span: untouched.
    const block = box({ size: [0.3, 0.3, 0.3], color: [1, 1, 1] });
    expect(imperfect(block, { sag: {} }).coverage[0]?.area).toBe(0);
  });

  it('presses the declared number of dents, never deeper than declared, crack-free', () => {
    const panel = subdivideTo(box({ size: [1.2, 0.04, 1.2], color: [1, 1, 1] }), 0.04);
    const r = imperfect(panel, { seed: 3, dents: { count: [2, 4], depth: 0.01, radius: 0.1 } });
    const d = r.coverage[0];
    expect(d?.count ?? 0).toBeGreaterThanOrEqual(2);
    expect(d?.count ?? 9).toBeLessThanOrEqual(4);
    expect(d?.actual ?? 1).toBeLessThanOrEqual(0.01);
    expect(d?.actual ?? 0).toBeGreaterThan(0.004);
    // Co-located vertices stay together (positions round to the same welded set).
    const key = (m: typeof panel): number =>
      new Set(
        Array.from({ length: m.positions.length / 3 }, (_, v) =>
          [0, 1, 2].map((k) => Math.round((m.positions[v * 3 + k] ?? 0) * 1e5)).join(),
        ),
      ).size;
    expect(key(r.mesh)).toBe(key(panel));
    const again = imperfect(panel, { seed: 3, dents: { count: [2, 4], depth: 0.01, radius: 0.1 } });
    expect(Array.from(again.mesh.positions)).toEqual(Array.from(r.mesh.positions));
    expect(merge([r.mesh]).indices.length).toBe(panel.indices.length);
  });
});
