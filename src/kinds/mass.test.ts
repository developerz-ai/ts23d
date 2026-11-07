import { describe, expect, it } from 'bun:test';
import { boundsOf, Ts23dError, triangleCount } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { mass } from './mass.ts';

describe('mass', () => {
  it('rejects a flat or negative block with a fix', () => {
    expect(() => mass({ size: [6, 0, 3], color: [1, 1, 1] })).toThrow(Ts23dError);
    expect(() => mass({ size: [6, 2, -3], color: [1, 1, 1] })).toThrow('T3D_RECIPE_INVALID');
  });

  it('lays brick courses at true scale from the ground line, not stretched over the face', () => {
    const m = mass({ size: [6, 8, 6], at: [0, 0, 0], color: [1, 1, 1], omit: ['top', 'bottom'] });
    const r = stripRect('brick');
    let n = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const z = m.positions[i * 3 + 2] ?? 0;
      const f = ((m.uvs[i * 2 + 1] ?? 0) - r.v0) / (r.v1 - r.v0);
      const inBand = z / 0.45 - Math.floor(z / 0.45 + 1e-6);
      // A stretched mapping (f = z / 6) fails this on every interior band edge.
      expect(Math.min(Math.abs(f - inBand), Math.abs(f - 1 - inBand))).toBeLessThan(1e-4);
      n++;
    }
    expect(n).toBeGreaterThan(4 * 2 * 13);
  });

  it('keeps the box extents and drops to one quad per side at LOD2', () => {
    const b = boundsOf(mass({ size: [6, 8, 6], at: [1, 2, 3], color: [1, 1, 1] }));
    expect(b.min).toEqual([-2, -2, 3]);
    expect(b.max).toEqual([4, 6, 9]);
    expect(triangleCount(mass({ size: [6, 8, 6], color: [1, 1, 1], omit: ['bottom'] }, 2))).toBe(
      10,
    );
  });
});
