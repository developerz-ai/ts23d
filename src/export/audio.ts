// KHR_audio_emitter (Khronos draft, extensionsUsed only): each sound source becomes a positional
// emitter on its node, its clip an `audio/wav` entry by URI (`<clip>.wav` beside the GLB —
// `t3d build` writes them). Only the LOD0 tree carries emitters, so an MSFT_lod swap never
// doubles a sound. What starts a sound rides `extras.trigger` (the extension has no such field).

import { type CompiledAsset, Ts23dError } from '../core/index.ts';
import { soundUses } from './audio-files.ts';
import type { Json } from './bin-writer.ts';

export const AUDIO_EMITTER = 'KHR_audio_emitter';

/**
 * Attach emitters to the named nodes in `nodes[from, to)` and return the root extension object,
 * or null when the asset has no sounds.
 */
export function writeAudio(
  nodes: Json[],
  asset: CompiledAsset,
  from: number,
  to: number,
): Json | null {
  const uses = soundUses(asset);
  if (!uses.length) return null;
  const audio: Json[] = [];
  const audioIndex = new Map<string, number>();
  const sources: Json[] = [];
  const emitters: Json[] = [];
  for (const u of uses) {
    let a = audioIndex.get(u.clip.name);
    if (a === undefined) {
      audio.push({ uri: `${u.clip.name}.wav`, mimeType: 'audio/wav', name: u.clip.name });
      a = audio.length - 1;
      audioIndex.set(u.clip.name, a);
    }
    sources.push({
      name: u.node,
      audio: a,
      ...(u.loop ? { loop: true } : {}),
      ...(u.trigger === 'always' ? { autoPlay: true } : {}),
    });
    const positional: Json = {
      ...(u.refDistance !== undefined ? { refDistance: u.refDistance } : {}),
      ...(u.maxDistance !== undefined ? { maxDistance: u.maxDistance } : {}),
    };
    emitters.push({
      name: u.node,
      type: 'positional',
      ...(u.gain !== 1 ? { gain: u.gain } : {}),
      sources: [sources.length - 1],
      ...(Object.keys(positional).length ? { positional } : {}),
      extras: { trigger: u.trigger },
    });
    const at = nodes.findIndex((n, i) => i >= from && i < to && n['name'] === u.node);
    const node = nodes[at];
    if (!node)
      throw new Ts23dError('T3D_AUDIO_INVALID', {
        cause: `sound source '${u.node}' in '${asset.name}' has no node of its own in the GLB`,
        fix: 'put sounds on a group, an emitter or a moving part (static parts merge into their pivot)',
      });
    node['extensions'] = {
      ...((node['extensions'] as Json | undefined) ?? {}),
      [AUDIO_EMITTER]: { emitter: emitters.length - 1 },
    };
  }
  return { audio, sources, emitters };
}
