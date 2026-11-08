// The sounds an asset carries, gathered from its parts: `ctx.emitter(…, { kind: 'sound' })` nodes
// and moving parts' `sound.onMotion`. One entry per distinct clip (by name), encoded to WAV for
// the files beside the GLB. Two different clips under one name fail with T3D_AUDIO_CONFLICT.

import { encodeWav } from '../audio/index.ts';
import { type CompiledAsset, type Part, type SoundClip, Ts23dError } from '../core/index.ts';

/** One sound source on a node: what plays, how loud, and what starts it. */
export interface SoundUse {
  readonly node: string;
  readonly clip: SoundClip;
  readonly gain: number;
  readonly loop: boolean;
  /** 'always' autoplays; 'motion' plays with the part's baked motion; others are game-driven. */
  readonly trigger: 'always' | 'moving' | 'event' | 'motion';
  readonly refDistance?: number;
  readonly maxDistance?: number;
}

export interface SoundFile {
  readonly name: string;
  /** File name beside the GLB: `<name>.wav`. */
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly seconds: number;
  readonly loop: boolean;
}

function useOf(asset: string, p: Part): SoundUse | null {
  if (p.audio) {
    const a = p.audio;
    if (!(a.gain === undefined || (Number.isFinite(a.gain) && a.gain >= 0)))
      throw new Ts23dError('T3D_AUDIO_INVALID', {
        cause: `sound emitter '${p.name}' in '${asset}' has gain ${a.gain}`,
        fix: 'gain is linear and ≥ 0 (1 = as rendered); omit it for 1',
      });
    return {
      node: p.name,
      clip: a.clip,
      gain: a.gain ?? 1,
      loop: a.loop ?? a.clip.loop,
      trigger: a.when ?? 'event',
      ...(a.refDistance !== undefined ? { refDistance: a.refDistance } : {}),
      ...(a.maxDistance !== undefined ? { maxDistance: a.maxDistance } : {}),
    };
  }
  if (!p.sound) return null;
  if (!p.motion)
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `part '${p.name}' in '${asset}' has sound.onMotion but no motion`,
      fix: "give it a motion (motion: { kind: 'sway', … }) or use ctx.emitter(…, { kind: 'sound' })",
    });
  return {
    node: p.name,
    clip: p.sound.onMotion,
    gain: p.sound.gain ?? 1,
    loop: false,
    trigger: 'motion',
  };
}

/** Every sound source on `asset`'s parts, in part order. */
export function soundUses(asset: CompiledAsset): SoundUse[] {
  const uses = asset.parts.flatMap((p) => useOf(asset.name, p) ?? []);
  const seen = new Map<string, SoundClip>();
  for (const u of uses) {
    const prior = seen.get(u.clip.name);
    if (prior && prior !== u.clip && !sameClip(prior, u.clip))
      throw new Ts23dError('T3D_AUDIO_CONFLICT', {
        cause: `two different clips are both named '${u.clip.name}' in '${asset.name}'`,
        fix: "give one its own name: sound.impact({ …, name: 'bell_small' })",
      });
    seen.set(u.clip.name, u.clip);
  }
  return uses;
}

function sameClip(a: SoundClip, b: SoundClip): boolean {
  if (a.samples.length !== b.samples.length || a.sampleRate !== b.sampleRate) return false;
  for (let i = 0; i < a.samples.length; i++) if (a.samples[i] !== b.samples[i]) return false;
  return true;
}

/** The distinct clips as WAV files, sorted by name (stable output order). */
export function soundFiles(asset: CompiledAsset): SoundFile[] {
  const clips = new Map<string, SoundClip>();
  for (const u of soundUses(asset)) clips.set(u.clip.name, u.clip);
  return [...clips.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((c) => ({
      name: c.name,
      file: `${c.name}.wav`,
      bytes: encodeWav(c),
      seconds: c.samples.length / c.channels / c.sampleRate,
      loop: c.loop,
    }));
}
