import { describe, expect, it } from 'bun:test';
import { sound } from '../audio/index.ts';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { soundFiles } from './audio-files.ts';
import { toGlb } from './glb.ts';

const clang = sound.impact({ material: 'steel', size: 0.2, name: 'clang' });
const creak = sound.mechanism({ kind: 'creak', material: 'oak', duration: 0.3, name: 'creak' });
const wood = [0.5, 0.4, 0.3] as const;

const shed = (extra?: 'unmoving' | 'clash') =>
  defineAsset({
    name: 'shed',
    kind: 'prop',
    budget: { triangles: [100, 100, 100] },
    build(ctx) {
      ctx.part('body', box({ size: [1, 1, 1], color: [...wood] }));
      ctx.part('door', box({ size: [0.05, 0.6, 0.9], color: [...wood] }), {
        at: [0.55, 0, 0],
        motion: { kind: 'sway', axis: [0, 0, 1], degrees: 45, hz: 0.5, oneWay: true },
        sound: { onMotion: creak },
      });
      ctx.emitter('bell', { kind: 'sound', clip: clang, at: [0, 0, 1.2], gain: 0.5 });
      if (extra === 'unmoving')
        ctx.part('lid', box({ size: [1, 1, 0.1], color: [...wood] }), {
          at: [0, 0, 1],
          sound: { onMotion: creak },
        });
      if (extra === 'clash')
        ctx.emitter('gong', {
          kind: 'sound',
          clip: sound.impact({ material: 'brass', size: 0.5, name: 'clang' }),
        });
    },
  });

const json = (glb: Uint8Array) => {
  const dv = new DataView(glb.buffer);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
};

describe('KHR_audio_emitter export', () => {
  it('fails on sound without motion and on two clips sharing a name', () => {
    expect(() => toGlb(compile(shed('unmoving')))).toThrow('T3D_AUDIO_INVALID');
    expect(() => soundFiles(compile(shed('clash')))).toThrow('T3D_AUDIO_CONFLICT');
  });

  it('puts positional emitters on the door and the bell node, clips as external WAVs', () => {
    const gltf = json(toGlb(compile(shed())));
    expect(gltf.extensionsUsed).toContain('KHR_audio_emitter');
    expect(gltf.extensionsRequired ?? []).not.toContain('KHR_audio_emitter');
    const ext = gltf.extensions.KHR_audio_emitter;
    expect(ext.audio).toEqual([
      { uri: 'creak.wav', mimeType: 'audio/wav', name: 'creak' },
      { uri: 'clang.wav', mimeType: 'audio/wav', name: 'clang' },
    ]);
    expect(ext.emitters[0]).toMatchObject({ type: 'positional', extras: { trigger: 'motion' } });
    expect(ext.emitters[1]).toMatchObject({ gain: 0.5, extras: { trigger: 'event' } });
    const byName = (n: string) => gltf.nodes.find((x: { name: string }) => x.name === n);
    expect(byName('door').extensions.KHR_audio_emitter).toEqual({ emitter: 0 });
    expect(byName('bell').extensions.KHR_audio_emitter).toEqual({ emitter: 1 });
    // Sound nodes are not particle emitters.
    expect(byName('bell').extras).toBeUndefined();
  });

  it('writes nothing audio when asked not to, and lists sorted WAV files', () => {
    const gltf = json(toGlb(compile(shed()), { sounds: false }));
    expect(gltf.extensionsUsed ?? []).not.toContain('KHR_audio_emitter');
    const files = soundFiles(compile(shed()));
    expect(files.map((f) => f.file)).toEqual(['clang.wav', 'creak.wav']);
    expect(files[1]?.seconds).toBeCloseTo(0.3, 3);
  });
});
