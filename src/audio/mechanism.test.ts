import { describe, expect, it } from 'bun:test';
import { magnitudeAt, rms, seamJump } from './analyze.ts';
import { mechanism } from './mechanism.ts';
import { ui } from './ui.ts';
import { encodeWav } from './wav.ts';

describe('sound.mechanism', () => {
  it('rejects unknown kinds, materials and out-of-range speed', () => {
    // @ts-expect-error — an unknown kind from untyped input
    expect(() => mechanism({ kind: 'groan', material: 'oak' })).toThrow('T3D_AUDIO_INVALID');
    expect(() => mechanism({ kind: 'creak', material: 'cheese' })).toThrow('T3D_AUDIO_MATERIAL');
    expect(() => mechanism({ kind: 'creak', material: 'oak', speed: 3 })).toThrow(
      'T3D_AUDIO_INVALID',
    );
  });

  it('renders every kind, audibly, deterministically', () => {
    for (const kind of ['creak', 'squeak', 'whine', 'rattle', 'hiss', 'clunk'] as const) {
      const a = mechanism({ kind, material: 'steel', seed: 5 });
      expect(rms(a)).toBeGreaterThan(0.02);
      expect(Bun.hash(encodeWav(a))).toBe(
        Bun.hash(encodeWav(mechanism({ kind, material: 'steel', seed: 5 }))),
      );
    }
  });

  it('whine sits at teeth × shaft rate', () => {
    const w = mechanism({ kind: 'whine', material: 'steel', rpm: 1500, teeth: 30 });
    const mesh = (1500 / 60) * 30;
    expect(magnitudeAt(w, mesh)).toBeGreaterThan(magnitudeAt(w, mesh * 1.3) * 10);
  });

  it('looping kinds loop seamlessly; one-shots do not claim to', () => {
    // Measured seam jump (whine 1.102, hiss 0.266, rattle 0.0009) + 10 %.
    const bound = { whine: 1.21, hiss: 0.29, rattle: 0.001 } as const;
    for (const kind of ['whine', 'rattle', 'hiss'] as const) {
      const c = mechanism({ kind, material: 'steel' });
      expect(c.loop).toBe(true);
      expect(seamJump(c)).toBeLessThan(bound[kind]);
    }
    expect(mechanism({ kind: 'creak', material: 'oak' }).loop).toBe(false);
  });
});

describe('sound.mechanism names', () => {
  it('default name is unique per parameter set; defaults keep the short name', () => {
    expect(mechanism({ kind: 'creak', material: 'oak', speed: 0.5, seed: 1 }).name).toBe(
      'creak_oak',
    );
    const w = { kind: 'whine', material: 'steel' } as const;
    const names = [
      mechanism(w),
      mechanism({ ...w, seed: 2 }),
      mechanism({ ...w, speed: 0.9 }),
      mechanism({ ...w, duration: 1 }),
      mechanism({ ...w, rpm: 1500 }),
      mechanism({ ...w, teeth: 30 }),
      mechanism({ ...w, loop: false }),
    ].map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('sound.ui', () => {
  it('rejects unknown kinds and fractional seeds', () => {
    // @ts-expect-error — an unknown kind from untyped input
    expect(() => ui({ kind: 'boing', seed: 1 })).toThrow('T3D_AUDIO_INVALID');
    expect(() => ui({ kind: 'blip', seed: 0.5 })).toThrow('T3D_AUDIO_INVALID');
  });

  it('seed varies the effect, and the same seed repeats it', () => {
    for (const kind of ['blip', 'pickup', 'laser', 'hit', 'powerup'] as const) {
      const a = encodeWav(ui({ kind, seed: 1 }));
      expect(Bun.hash(a)).toBe(Bun.hash(encodeWav(ui({ kind, seed: 1 }))));
      expect(Bun.hash(a)).not.toBe(Bun.hash(encodeWav(ui({ kind, seed: 2 }))));
    }
  });
});
