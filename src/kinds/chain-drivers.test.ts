// The drivers against their defining equations: each field is checked by differentiating or
// integrating what it claims to be, bad parameters first.

import { describe, expect, it } from 'bun:test';
import { dmath } from '../core/index.ts';
import {
  bendPulse,
  ds21Envelope,
  expEnvelope,
  followPath,
  hingeGroups,
  minJerk,
  orthogonalWaves,
  serpenoid,
  TAU,
  travellingWave,
} from './chain-drivers.ts';
import { type ChainField, integrate } from './chain-field.ts';

/** Heading at s: the first joint's turn plus the curvature up to s. */
const heading = (f: ChainField, s: number, t: number): number => {
  let sum = f.base?.(t).bend ?? 0;
  for (let i = 0; i < 200; i++) sum += integrate(f.kn, (s * i) / 200, (s * (i + 1)) / 200, t);
  return sum;
};

describe('chain drivers', () => {
  it('refuses a wave with no length or rate, and arm strain beyond the measured range', () => {
    const envelope = ds21Envelope();
    expect(() => travellingWave({ f: 1, lambda: 0, envelope })).toThrow(/wavelength/);
    expect(() => travellingWave({ f: 0, lambda: 1, envelope })).toThrow(/frequency/);
    const centre = (): number => 0;
    const strain = { peak: 2, at: () => 1 };
    expect(() => bendPulse({ peak: 1, width: 0.1, centre, strain })).toThrow(/-0\.12\.\.1\.8/);
  });

  it('has the published envelopes', () => {
    const a = ds21Envelope();
    expect(2 * a.at(0)).toBeCloseTo(0.05, 9);
    expect(2 * a.at(1)).toBeCloseTo(0.2, 9);
    const e = expEnvelope(0.07, 3.9);
    expect(e.at(0) / e.at(1)).toBeCloseTo(dmath.exp(-3.9), 9);
  });

  it('turns y = A sin(2π(s/λ − ft)) into heading = atan(dy/ds)', () => {
    const envelope = ds21Envelope();
    const w = travellingWave({ f: 1.3, lambda: 0.9, envelope });
    const y = (s: number, t: number): number =>
      envelope.at(s) * dmath.sin(TAU * (s / 0.9 - 1.3 * t));
    for (const [s, t] of [
      [0.3, 0.1],
      [0.8, 0.42],
      [1, 0.77],
    ] as const) {
      const slope = (y(s + 1e-5, t) - y(s - 1e-5, t)) / 2e-5;
      expect(heading(w, s, t)).toBeCloseTo(dmath.atan(slope), 5);
    }
  });

  it('runs crests from root to tip', () => {
    const w = serpenoid({ f: 1, lambda: 1, alpha: 1 });
    // A later time finds the same curvature further along.
    expect(w.kn?.(0.3, 0.1)).toBeCloseTo(w.kn?.(0.4, 0.2) ?? 0, 9);
  });

  it('puts orthogonal waves a quarter cycle apart', () => {
    const w = orthogonalWaves({ f: 2, lambda: 0.8, alpha: 3 }, { lambda: 0.8, alpha: 3 });
    expect(w.kb?.(0.2, 0.3)).toBeCloseTo(w.kn?.(0.2, 0.3 - 0.25 / 2) ?? 0, 9);
  });

  it('gives the bell speed of minimum jerk', () => {
    expect(minJerk(0)).toBe(0);
    expect(minJerk(1)).toBe(1);
    expect((minJerk(0.5 + 1e-6) - minJerk(0.5 - 1e-6)) / 2e-6).toBeCloseTo(1.875, 4);
  });

  it('runs a bend pulse with the arm stretched only behind it', () => {
    const f = bendPulse({
      peak: 10,
      width: 0.05,
      centre: () => 0.5,
      strain: { peak: 0.6, at: () => 1 },
    });
    expect(f.kn?.(0.5, 0)).toBeCloseTo(10, 9);
    expect(f.kn?.(0.9, 0)).toBeLessThan(0.001);
    expect(f.e?.(0.1, 0)).toBeCloseTo(0.6, 9);
    expect(f.e?.(0.9, 0)).toBe(0);
  });

  for (const lead of ['start', 'end'] as const)
    it(`follows the path from the ${lead}`, () => {
      const H = (t: number): number => 0.7 * dmath.sin(1.4 * t);
      const f = followPath({ heading: H, delay: 0.5, lead });
      for (const s of [0.25, 0.6, 1]) {
        const lag = 0.5 * (lead === 'start' ? s : 1 - s);
        expect(heading(f, s, 2)).toBeCloseTo(H(2 - lag), 4);
      }
    });

  it('lands a hinge turn whole, inside its width', () => {
    const f = hingeGroups([{ s: 0.5, width: 0.2, angle: () => 1.1 }]);
    expect(integrate(f.kn, 0.4, 0.5, 0) + integrate(f.kn, 0.5, 0.6, 0)).toBeCloseTo(1.1, 3);
    expect(f.kn?.(0.3, 0)).toBe(0);
  });
});
