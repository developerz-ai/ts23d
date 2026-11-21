// A rain stain is a soft run of grime, not an icicle (D591). Measured on its weight field: it
// keeps (or gains) width as it falls instead of narrowing to a point, its edges ease in over a
// good part of its half-width instead of starting at a hard rim, and it is a few times longer
// than it is wide. Failure first: the old decal (a hard-edged wedge tapering to a point) fails.

import { describe, expect, it } from 'bun:test';
import { hex } from '@developerz.ai/ts23d';
import { halfWidth, type RainStain, stainWeight } from './rain.ts';

type Field = (t: number, z: number) => number;

/** Width (m) of the field above `cut` × its row peak along the row at height z. */
function widthAt(f: Field, z: number, cut = 0.1): number {
  const ts = Array.from({ length: 1401 }, (_, i) => -0.7 + i * 0.001);
  const ws = ts.map((t) => f(t, z));
  const peak = Math.max(...ws);
  if (peak <= 0) return 0;
  const on = ts.filter((_, i) => (ws[i] ?? 0) > cut * peak);
  return on.length ? (on[on.length - 1] ?? 0) - (on[0] ?? 0) : 0;
}

/** Edge softness: (width above 10 % − width above 90 %) ÷ width above 10 %; 0 = hard rim. */
const softness = (f: Field, z: number): number => {
  const outer = widthAt(f, z, 0.1);
  return outer > 0 ? (outer - widthAt(f, z, 0.9)) / outer : 0;
};

interface Shape {
  readonly taper: number;
  readonly soft: number;
  readonly aspect: number;
}

/** A stain's shape: width at 80 % depth ÷ at its head, edge softness, length ÷ head width. */
function shape(f: Field, top: number, len: number): Shape {
  const head = widthAt(f, top - 0.05 * len);
  return {
    taper: widthAt(f, top - 0.8 * len) / head,
    soft: softness(f, top - 0.3 * len),
    aspect: len / head,
  };
}

/** Rain-stain rules: no point, soft edges, a run (not a blot, not a needle). */
const isStain = (s: Shape): boolean =>
  s.taper >= 0.9 && s.soft >= 0.3 && s.aspect >= 2 && s.aspect <= 8;

const RUN: RainStain = { t: 0, top: 3, len: 1.3, w: 0.56, color: hex('#423d33'), k: 0.55 };

describe('rain stain shape', () => {
  it('fails the old decal: a hard-edged wedge narrowing to a point', () => {
    const wedge: Field = (t, z) => {
      const d = (RUN.top - z) / RUN.len;
      if (d < 0 || d > 1.08) return 0;
      const hw = d <= 1 ? (RUN.w / 2) * (1 - 0.55 * d) : (RUN.w / 2) * 0.45 * (1 - (d - 1) / 0.08);
      return Math.abs(t) < hw ? 1 - 0.8 * d : 0;
    };
    const s = shape(wedge, RUN.top, RUN.len);
    expect(isStain(s)).toBe(false);
    expect(s.taper).toBeLessThan(0.9);
    expect(s.soft).toBeLessThan(0.3);
  });

  for (const [w, len] of [
    [0.5, 1.1],
    [0.56, 1.3],
    [0.62, 1.5],
  ] as const)
    it(`a ${w} × ${len} m run off a sill reads as a stain`, () => {
      const s: RainStain = { ...RUN, w, len };
      const got = shape((t, z) => stainWeight(s, t, z), s.top, s.len);
      expect(got.taper).toBeGreaterThanOrEqual(0.9);
      expect(got.soft).toBeGreaterThanOrEqual(0.3);
      expect(got.aspect).toBeGreaterThanOrEqual(2);
      expect(got.aspect).toBeLessThanOrEqual(8);
    });

  it('fades out down its length and stops at its edges', () => {
    expect(stainWeight(RUN, 0, RUN.top - 0.95 * RUN.len)).toBeLessThan(
      0.05 * stainWeight(RUN, 0, RUN.top - 0.02),
    );
    expect(stainWeight(RUN, halfWidth(RUN, 0.5) + 1e-3, RUN.top - 0.5 * RUN.len)).toBe(0);
    expect(stainWeight(RUN, 0, RUN.top + 0.01)).toBe(0);
  });

  it('stays finite at its foot, where rounding puts a vertex a hair past the end', () => {
    // (3.333 − 2.165) ÷ 1.168 rounds to 1 + 2⁻⁵², though 2.165 is not below 3.333 − 1.168: the
    // fade's (1 − d)^1.6 went NaN there and the scaffold walls failed QA (non-finite colours).
    const foot: RainStain = { ...RUN, top: 3.333, len: 1.168 };
    expect((foot.top - 2.165) / foot.len).toBeGreaterThan(1);
    expect(Number.isFinite(stainWeight(foot, 0, 2.165))).toBe(true);
  });
});
