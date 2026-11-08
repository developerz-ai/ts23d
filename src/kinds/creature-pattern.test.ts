import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { marks } from './creature-pattern.ts';
import type { PatternKind } from './creature-spec.ts';

/** Sample a flank patch (x along the body, z up) on one side. */
function sample(kind: PatternKind, side: 1 | -1, seed = 3): number[] {
  const m = marks({ kind, scale: 0.1, coverage: 0.35, seed }, 0.004);
  const out: number[] = [];
  for (let i = 0; i < 40; i++)
    for (let j = 0; j < 20; j++) {
      const p: Vec3 = [-0.6 + i * 0.03, 0.15 * side, 0.4 + j * 0.02];
      out.push(m(p, { v: 0.6 - j * 0.02 }));
    }
  return out;
}

const mean = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0) / a.length;

describe('coat patterns', () => {
  for (const kind of ['stripes', 'spots', 'rosettes', 'patches'] as const) {
    it(`${kind}: marks some of the coat, not all of it, the same way every time`, () => {
      const a = sample(kind, 1);
      expect(mean(a)).toBeGreaterThan(0.04);
      expect(mean(a)).toBeLessThan(0.8);
      expect(sample(kind, 1)).toEqual(a);
    });

    it(`${kind}: left and right flanks differ (asymmetric, like a real animal)`, () => {
      const l = sample(kind, 1);
      const r = sample(kind, -1);
      const diff = l.reduce((s, x, i) => s + Math.abs(x - (r[i] ?? 0)), 0) / l.length;
      expect(diff).toBeGreaterThan(0.02);
    });
  }

  it('a different seed is a different animal', () => {
    const a = sample('spots', 1, 1);
    const b = sample('spots', 1, 2);
    expect(a).not.toEqual(b);
  });
});
