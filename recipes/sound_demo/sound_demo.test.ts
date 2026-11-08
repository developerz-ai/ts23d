import { describe, expect, it } from 'bun:test';
import {
  compile,
  defineAsset,
  firingFrequency,
  peakFrequency,
  seamJump,
  soundFiles,
  soundUses,
} from '@developerz.ai/ts23d';
import { assertQaPass } from '@developerz.ai/ts23d/testing';
import { sound_demo } from './sound_demo.ts';

describe('sound_demo', () => {
  it('rejects a sound on a part that never moves', () => {
    const still = defineAsset({
      ...sound_demo,
      name: 'sound_demo_still',
      build(ctx) {
        sound_demo.build(ctx);
        const creak = soundUses(compile(sound_demo))[0]?.clip;
        if (creak) ctx.part('sign', null, { sound: { onMotion: creak } });
      },
    });
    expect(() => soundFiles(compile(still))).toThrow('T3D_AUDIO_INVALID');
  });

  it('passes QA and carries four sounds, the idle a seamless loop at the V10 firing rate', () => {
    expect(() => assertQaPass(sound_demo)).not.toThrow();
    const uses = soundUses(compile(sound_demo));
    expect(uses.map((u) => [u.node, u.clip.name, u.trigger])).toEqual([
      ['door_leaf', 'door_creak', 'motion'],
      ['bell', 'bell_strike', 'motion'],
      ['crate_knock', 'crate_knock', 'event'],
      ['engine_idle', 'engine_v10_idle', 'always'],
    ]);
    const idle = uses[3]?.clip;
    expect(idle?.loop).toBe(true);
    if (!idle) return;
    const f0 = firingFrequency(800, 10);
    expect(Math.abs(peakFrequency(idle, f0 * 0.5, f0 * 1.5) - f0)).toBeLessThan(f0 * 0.01);
    expect(seamJump(idle)).toBeLessThan(1);
  });
});
