import { describe, expect, it } from 'bun:test';
import { peakFrequency } from './analyze.ts';
import { impact } from './impact.ts';
import { encodeWav } from './wav.ts';

const hash = (b: Uint8Array): bigint => Bun.hash(b) as bigint;

describe('sound.impact', () => {
  it('rejects unknown materials and impossible sizes', () => {
    expect(() => impact({ material: 'unobtainium', size: 0.3 })).toThrow('T3D_AUDIO_MATERIAL');
    expect(() => impact({ material: 'steel', size: 0 })).toThrow('T3D_AUDIO_INVALID');
    expect(() => impact({ material: 'steel', size: 0.3, force: 2 })).toThrow('T3D_AUDIO_INVALID');
    expect(() => impact({ material: 'steel', size: 0.3, thickness: 1 })).toThrow(
      'T3D_AUDIO_INVALID',
    );
  });

  it('is deterministic: same options, same WAV bytes; another seed differs', () => {
    const a = encodeWav(impact({ material: 'steel', size: 0.3, shape: 'hollow' }));
    const b = encodeWav(impact({ material: 'steel', size: 0.3, shape: 'hollow' }));
    const c = encodeWav(impact({ material: 'steel', size: 0.3, shape: 'hollow', seed: 2 }));
    expect(hash(a)).toBe(hash(b));
    expect(hash(a)).not.toBe(hash(c));
  });

  it('pitch falls as size grows (f ∝ 1/L at fixed thickness ratio)', () => {
    const small = peakFrequency(
      impact({ material: 'steel', size: 0.2, shape: 'bar' }),
      50,
      8000,
      4,
    );
    const big = peakFrequency(impact({ material: 'steel', size: 0.4, shape: 'bar' }), 50, 8000, 4);
    expect(big).toBeLessThan(small);
    expect(small / big).toBeCloseTo(2, 0);
  });

  it('stiff light materials ring higher than soft dense ones of the same size', () => {
    const glass = peakFrequency(
      impact({ material: 'glass', size: 0.3, shape: 'bar' }),
      50,
      8000,
      4,
    );
    const pine = peakFrequency(impact({ material: 'pine', size: 0.3, shape: 'bar' }), 50, 8000, 4);
    expect(glass).toBeGreaterThan(pine);
  });

  it('metal rings longer than wood; names follow material, shape and size', () => {
    const steel = impact({ material: 'steel', size: 0.3 });
    const oak = impact({ material: 'oak', size: 0.3 });
    expect(steel.samples.length).toBeGreaterThan(oak.samples.length * 3);
    expect(steel.name).toBe('impact_steel_plate_0_3');
    expect(impact({ material: 'iron_cast', size: 0.3 }).name).toBe('impact_cast_iron_plate_0_3');
  });

  it('default name is unique per parameter set; defaults keep the short name', () => {
    const o = { material: 'steel', size: 0.3 } as const;
    expect(impact({ ...o, seed: 1, force: 0.7, mass: 0.5 }).name).toBe('impact_steel_plate_0_3');
    const names = [
      impact(o),
      impact({ ...o, seed: 2 }),
      impact({ ...o, force: 0.2 }),
      impact({ ...o, mass: 2 }),
      impact({ ...o, thickness: 0.004 }),
      impact({ ...o, duration: 1 }),
      impact({ ...o, size: 0.301 }),
    ].map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
