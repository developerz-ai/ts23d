import { describe, expect, it } from 'bun:test';
import { peakFrequency, seamJump } from './analyze.ts';
import { durationOf } from './clip.ts';
import { engine, firingFrequency } from './engine.ts';
import { encodeWav } from './wav.ts';

describe('sound.engine', () => {
  it('rejects a bad cylinder count, rpm or firing order', () => {
    expect(() => engine({ cylinders: 0, rpm: 900 })).toThrow('T3D_AUDIO_INVALID');
    expect(() => engine({ cylinders: 4.5, rpm: 900 })).toThrow('T3D_AUDIO_INVALID');
    expect(() => engine({ cylinders: 4, rpm: 50 })).toThrow('T3D_AUDIO_INVALID');
    expect(() => engine({ cylinders: 4, rpm: 900, firingOrder: [1, 2, 2, 4] })).toThrow(
      'T3D_AUDIO_INVALID',
    );
  });

  it('fundamental = rpm/60 × cylinders/2', () => {
    for (const [cylinders, rpm] of [
      [10, 900],
      [4, 3000],
      [8, 1200],
    ] as const) {
      const f0 = firingFrequency(rpm, cylinders);
      const peak = peakFrequency(engine({ cylinders, rpm }), f0 * 0.4, f0 * 1.6);
      expect(Math.abs(peak - f0) / f0).toBeLessThan(0.01);
    }
  });

  it('loops seamlessly over whole engine cycles', () => {
    const e = engine({ cylinders: 10, rpm: 900, firingOrder: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9] });
    expect(e.loop).toBe(true);
    expect(seamJump(e)).toBeLessThan(1);
    // 2 s at 900 rpm = 15 cycles of 2 revolutions.
    expect(durationOf(e)).toBeCloseTo(2, 2);
  });

  it('is deterministic', () => {
    const a = encodeWav(engine({ cylinders: 6, rpm: 2000, seed: 4 }));
    const b = encodeWav(engine({ cylinders: 6, rpm: 2000, seed: 4 }));
    expect(Bun.hash(a)).toBe(Bun.hash(b));
  });

  it('default name is unique per parameter set; defaults keep the short name', () => {
    expect(engine({ cylinders: 8, rpm: 900 }).name).toBe('engine_8cyl_900rpm');
    expect(engine({ cylinders: 8, rpm: 900, seed: 1, roughness: 0.3 }).name).toBe(
      'engine_8cyl_900rpm',
    );
    const names = [
      engine({ cylinders: 8, rpm: 900, seed: 1 }),
      engine({ cylinders: 8, rpm: 900, seed: 2 }),
      engine({ cylinders: 8, rpm: 900, roughness: 0.5 }),
      engine({ cylinders: 8, rpm: 900, duration: 1 }),
      engine({ cylinders: 8, rpm: 900, exhaust: { length: 2 } }),
      engine({ cylinders: 8, rpm: 900, exhaust: { muffler: 0.2 } }),
      engine({ cylinders: 8, rpm: 900, firingOrder: [1, 8, 4, 3, 6, 5, 7, 2] }),
    ].map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(engine({ cylinders: 8, rpm: 900, name: 'idle' }).name).toBe('idle');
  });
});
