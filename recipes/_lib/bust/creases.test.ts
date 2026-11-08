import { describe, expect, it } from 'bun:test';
import { creaseCurve, edgeCreases, MAX_CREASE, ringCreases } from './creases.ts';

describe('bust crease declarations', () => {
  it('never declares a region wider than a fold (a 28 cm "garments" sphere is clamped to 3 cm)', () => {
    const c = creaseCurve('garments', 'bust', [[0, 0, 0.2]], 0.28, 'too big');
    expect(c.every((x) => x.radius <= MAX_CREASE)).toBe(true);
  });
  it('strings spheres ON a curved fold, mirrored — none off it (no centre regions)', () => {
    const arc = [0, 1, 2, 3, 4].map((i): [number, number, number] => [
      Math.cos(i * 0.6) * 0.1,
      0.05 + Math.sin(i * 0.6) * 0.1,
      0,
    ]);
    const c = creaseCurve('arc', 'head', arc, 0.02, 'x', true);
    expect(c.some((x) => x.name.startsWith('arc_r') && x.at[1] < 0)).toBe(true);
    // Every region on the left lies on the arc (its 0.6 rad chords sag ≤ 4.5 mm).
    for (const x of c.filter((k) => k.at[1] > 0))
      expect(Math.abs(Math.hypot(x.at[0], x.at[1] - 0.05) - 0.1)).toBeLessThan(0.005);
  });
  it('declares a ring as a closed curve on the ring, not its inside', () => {
    const ring = Array.from({ length: 24 }, (_, i): [number, number, number] => [
      0.06 * Math.cos((i / 24) * Math.PI * 2),
      0.06 * Math.sin((i / 24) * Math.PI * 2),
      0.25,
    ]);
    const c = ringCreases('collar', 'head', ring, 0.025, 'x');
    expect(c.length).toBeGreaterThan(14);
    for (const x of c) expect(Math.hypot(x.at[0], x.at[1])).toBeGreaterThan(0.058);
  });
  it('finds a garment edge where the region meets the body (a sphere cut by a plane)', () => {
    const body = (p: readonly number[]) => Math.hypot(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0) - 0.1;
    const region = (p: readonly number[]) => (p[2] ?? 0) - 0.03;
    const e = edgeCreases(
      'hem',
      'bust',
      body,
      region,
      [
        [-0.12, -0.12, -0.12],
        [0.12, 0.12, 0.12],
      ],
      0.025,
      'x',
    );
    expect(e.length).toBeGreaterThan(8);
    for (const c of e) expect(Math.abs(c.at[2] - 0.03)).toBeLessThan(0.006);
  });
});
