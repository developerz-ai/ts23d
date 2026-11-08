// RIFF/WAVE encoder: 16-bit little-endian PCM, mono or stereo, at the clip's rate. Samples are
// clamped to −1..1 and rounded (not dithered), so the same clip always gives the same bytes.

import { type SoundClip, Ts23dError } from '../core/index.ts';

const HEADER = 44;

export function encodeWav(clip: SoundClip): Uint8Array {
  const { samples, channels, sampleRate } = clip;
  if (samples.length % channels !== 0 || !Number.isInteger(sampleRate) || sampleRate <= 0)
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `clip '${clip.name}' has ${samples.length} samples for ${channels} channels at ${sampleRate} Hz`,
      fix: 'interleave whole frames (length divisible by channels) at a positive integer rate',
    });
  const data = samples.length * 2;
  const out = new Uint8Array(HEADER + data);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(HEADER + i * 2, Math.round(s * 32767), true);
  }
  return out;
}

/** The header fields a reader needs; throws T3D_AUDIO_INVALID on anything but 16-bit PCM WAVE. */
export function readWavHeader(bytes: Uint8Array): {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  frames: number;
} {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.byteLength < HEADER || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(36) !== 'data')
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: 'bytes are not a canonical 44-byte-header RIFF/WAVE file',
      fix: 'pass the output of encodeWav(clip)',
    });
  const channels = v.getUint16(22, true);
  const bitsPerSample = v.getUint16(34, true);
  return {
    channels,
    sampleRate: v.getUint32(24, true),
    bitsPerSample,
    frames: v.getUint32(40, true) / ((channels * bitsPerSample) / 8),
  };
}
