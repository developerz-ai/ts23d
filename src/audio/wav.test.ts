import { describe, expect, it } from 'bun:test';
import { makeClip, SAMPLE_RATE } from './clip.ts';
import { encodeWav, readWavHeader } from './wav.ts';

describe('encodeWav', () => {
  it('rejects a clip whose samples are not whole frames', () => {
    const odd = { ...makeClip('odd', new Float32Array(3)), channels: 2 as const };
    expect(() => encodeWav(odd)).toThrow('T3D_AUDIO_INVALID');
    expect(() => readWavHeader(new Uint8Array(10))).toThrow('T3D_AUDIO_INVALID');
  });

  it('writes a valid 16-bit PCM RIFF header and clamped samples', () => {
    const wav = encodeWav(makeClip('tone', new Float32Array([0, 0.5, -1, 2])));
    expect(wav.byteLength).toBe(44 + 8);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(readWavHeader(wav)).toEqual({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      bitsPerSample: 16,
      frames: 4,
    });
    const v = new DataView(wav.buffer);
    expect([
      v.getInt16(44, true),
      v.getInt16(46, true),
      v.getInt16(48, true),
      v.getInt16(50, true),
    ]).toEqual([0, 16384, -32767, 32767]);
  });

  it('rejects a clip name that cannot be a file name', () => {
    expect(() => makeClip('Door Creak', new Float32Array(1))).toThrow('T3D_AUDIO_INVALID');
  });
});
