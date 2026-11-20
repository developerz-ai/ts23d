// The far float gauge lies on the far hoop bands. Failure first: the board was squared to the
// gauge's bearing (−0.7 rad) while the band facet under it faces −0.589 rad, so one edge of the
// 26 cm board sank about 1 cm into the bands.
import { describe, expect, it } from 'bun:test';
import { dmath } from '@developerz.ai/ts23d';
import { FAR_HOOP, farGauge } from './water_tower.ts';

describe('water_tower far gauge', () => {
  it('every corner is 2–6 mm outside the hoop facet under it, centred on the bearing', () => {
    const m = farGauge();
    const step = (Math.PI * 2) / FAR_HOOP.segments;
    // Lathe rings start at −90°, a whole number of steps here: vertices at multiples of a step.
    const k = Math.floor(FAR_HOOP.gauge / step);
    const c = (k + 0.5) * step;
    const apothem = FAR_HOOP.radius * dmath.cos(step / 2);
    const P = m.positions;
    let [sx, sy] = [0, 0];
    for (let i = 0; i < P.length / 3; i++) {
      const [x, y] = [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0];
      const d = x * dmath.cos(c) + y * dmath.sin(c) - apothem;
      expect(d).toBeGreaterThan(0.002);
      expect(d).toBeLessThan(0.006);
      sx += x;
      sy += y;
    }
    expect(Math.abs(dmath.atan2(sy, sx) - FAR_HOOP.gauge)).toBeLessThan(0.003);
  });
});
