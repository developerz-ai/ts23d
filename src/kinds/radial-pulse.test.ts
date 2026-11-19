// radialPulse: stays inside the measured mantle range, contracts faster than it refills, closes its
// loop, and refuses scale on a joint with children.

import { describe, expect, it } from 'bun:test';
import type { Bone } from '../core/index.ts';
import { PULSE_PRESETS, pulseAt, radialPulseClip } from './radial-pulse.ts';

const bones: Bone[] = [
  { name: 'hub', head: [0, 0, 0], tail: [0, 0, 1] },
  { name: 'ring', parent: 'hub', head: [0, 0, 0], tail: [0, 0, 0.5] },
];
const { squid, jelly } = PULSE_PRESETS;

describe('radialPulseClip', () => {
  it('refuses a range past the measured mantle limits', () => {
    expect(() => radialPulseClip('p', { ...squid, contract: -0.5 }, { part: 'mantle' })).toThrow(
      /-0\.40/,
    );
  });

  it('refuses timing that leaves no refill', () => {
    const timing = { inflate: 0.5, contract: 0.5, coast: 0 };
    expect(() => radialPulseClip('p', { ...squid, timing }, { part: 'm' })).toThrow(/timing/);
  });

  it('refuses an inflation with no share of the cycle (the loop would pop at its seam)', () => {
    const timing = { inflate: 0, contract: 0.2, coast: 0.1 };
    expect(() => radialPulseClip('p', { ...squid, timing }, { part: 'm' })).toThrow(/no share/);
    // No inflation and no share for it is the jellyfish: still fine.
    expect(() =>
      radialPulseClip('p', { ...squid, inflate: 0, timing }, { part: 'm' }),
    ).not.toThrow();
  });

  it('refuses scale on a joint with children (it would shear them)', () => {
    const target = { bones: ['hub'], skeleton: bones, axis: [0, 0, 1] as const };
    expect(() => radialPulseClip('p', squid, target)).toThrow(/child joints/);
  });

  it('refuses a ring axis off the coordinate axes: scale keys cannot contract across it', () => {
    const target = { bones: ['ring'], skeleton: bones, axis: [1, 1, 0] as const };
    expect(() => radialPulseClip('p', squid, target)).toThrow(/coordinate axis/);
  });

  it('accepts a coordinate axis of either sign and any length', () => {
    const target = { bones: ['ring'], skeleton: bones, axis: [0, -3, 0] as const };
    const t = radialPulseClip('p', squid, target).tracks[0];
    const n = t?.times.length ?? 0;
    const ys = Array.from({ length: n }, (_, i) => t?.values[i * 3 + 1]);
    expect(new Set(ys)).toEqual(new Set([1]));
    const xs = Array.from({ length: n }, (_, i) => t?.values[i * 3] ?? 0);
    expect(Math.min(...xs)).toBeCloseTo(0.7, 2);
  });

  it('inflates, contracts fast, refills slowly', () => {
    const { inflate: a, contract: b } = squid.timing;
    expect(pulseAt(squid, 0)).toBe(0);
    expect(pulseAt(squid, a)).toBeCloseTo(squid.inflate, 9);
    expect(pulseAt(squid, a + b)).toBeCloseTo(squid.contract, 9);
    expect(1 - a - b).toBeGreaterThan(b);
  });

  it('holds a jellyfish coast at rest', () => {
    expect(pulseAt(jelly, 0.9)).toBeCloseTo(0, 9);
    expect(pulseAt(jelly, 0.2)).toBeCloseTo(jelly.contract, 9);
  });

  it('scales across the ring axis only and closes the loop', () => {
    const c = radialPulseClip('p', squid, { bones: ['ring'], skeleton: bones, axis: [0, 0, 1] }, 2);
    const t = c.tracks[0];
    if (!t) throw new Error('no track');
    const n = t.times.length;
    expect(c.seconds).toBeCloseTo(1.24, 9);
    const xs = Array.from({ length: n }, (_, i) => t.values[i * 3] ?? 0);
    expect(Math.min(...xs)).toBeCloseTo(0.7, 2);
    expect(Math.max(...xs)).toBeCloseTo(1.09, 2);
    for (let i = 0; i < n; i++) expect(t.values[i * 3 + 2]).toBe(1);
    for (let k = 0; k < 3; k++) expect(t.values[(n - 1) * 3 + k]).toBe(t.values[k] ?? NaN);
  });

  it('drives two morph weights in 0..1', () => {
    const t = radialPulseClip('p', squid, { part: 'mantle' }).tracks[0];
    if (!t) throw new Error('no track');
    expect(t.path).toBe('weights');
    expect(Math.max(...t.values)).toBeLessThanOrEqual(1);
    expect(Math.min(...t.values)).toBeGreaterThanOrEqual(0);
    expect(t.values.length).toBe(t.times.length * 2);
  });
});
