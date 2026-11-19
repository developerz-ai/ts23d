// The shared wear kit: `shade` touches colour only, `mix`/`under` stay in range, and `mudFor`
// always answers a believable earth that contrasts with the paint. Failure first: the old fixed
// near-black mud is refused by the same checks `mudFor` must pass.

import { describe, expect, it } from 'bun:test';
import { box, hex, type Vec3 } from '@developerz.ai/ts23d';
import { DARK_EARTH, luminance, mix, mudFor, PALE_EARTH, shade, smooth, under } from './wear.ts';

/** An earth tone: warm (red ≥ green ≥ blue) and neither shadow-black nor chalk. */
const isEarth = (c: Vec3): boolean =>
  c[0] >= c[1] && c[1] >= c[2] && luminance(c) >= 0.035 && luminance(c) <= 0.3;

/** Luminance ratio, the darker of the two below: ≥ 1.5 reads as a different tone at a glance. */
const contrast = (a: Vec3, b: Vec3): number =>
  (Math.max(luminance(a), luminance(b)) + 0.01) / (Math.min(luminance(a), luminance(b)) + 0.01);

describe('mudFor', () => {
  const OLD_MUD: Vec3 = [0.028, 0.02, 0.012];
  const PAINTS: Record<string, Vec3> = {
    black: hex('#141414'),
    iron: hex('#2b2b2b'),
    olive: hex('#4b5320'),
    oxide_red: hex('#6e2a1e'),
    signal_grey: hex('#8a8d8f'),
    white: hex('#e8e8e2'),
    sand: hex('#c9b27c'),
  };

  it('refuses the old near-black mud: it is shadow, not earth, and vanishes on dark paint', () => {
    expect(isEarth(OLD_MUD)).toBe(false);
    expect(contrast(OLD_MUD, PAINTS['iron'] as Vec3)).toBeLessThan(1.5);
  });

  for (const [name, paint] of Object.entries(PAINTS))
    it(`${name} paint gets an earth that reads against it`, () => {
      const mud = mudFor(paint);
      expect(isEarth(mud)).toBe(true);
      expect(contrast(mud, paint)).toBeGreaterThanOrEqual(1.5);
    });

  it('blends between the two earths, never outside them', () => {
    for (const k of [0, 1, 2]) {
      expect(mudFor([0, 0, 0])[k]).toBeCloseTo(PALE_EARTH[k] ?? 0, 9);
      expect(mudFor([1, 1, 1])[k]).toBeCloseTo(DARK_EARTH[k] ?? 0, 9);
    }
    const mid = mudFor([0.15, 0.15, 0.15]);
    expect(luminance(mid)).toBeGreaterThan(luminance(DARK_EARTH));
    expect(luminance(mid)).toBeLessThan(luminance(PALE_EARTH));
  });
});

describe('shade, mix, under', () => {
  it('changes colours only, with the world offset applied to positions', () => {
    const m = box({ size: [1, 1, 1], color: [0.5, 0.5, 0.5] });
    const seen: number[] = [];
    const out = shade(
      m,
      (p, _n, c) => {
        seen.push(p[2]);
        return mix(c, [0, 0, 0], p[2] > 5.5 ? 1 : 0);
      },
      [0, 0, 5],
    );
    expect(out.positions).toBe(m.positions);
    expect(out.uvs).toBe(m.uvs);
    expect(Math.min(...seen)).toBeCloseTo(5, 6);
    expect(Math.max(...out.colors)).toBeCloseTo(0.5, 6);
    expect(Math.min(...out.colors)).toBe(0);
  });

  it('clamps the blend weight and keeps stains under a paint slot', () => {
    expect(mix([0.2, 0.2, 0.2], [1, 1, 1], 4)).toEqual([1, 1, 1]);
    expect(mix([0.2, 0.2, 0.2], [1, 1, 1], -1)).toEqual([0.2, 0.2, 0.2]);
    expect(under([0.3, 0.1, 0.5], [0.2, 0.2, 0.2])).toEqual([0.2, 0.1, 0.2]);
    expect(smooth(0, 1, 0.5)).toBeCloseTo(0.5, 9);
    expect(smooth(0, 1, 2)).toBe(1);
  });
});
