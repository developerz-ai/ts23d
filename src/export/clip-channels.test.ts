import { describe, expect, it } from 'bun:test';
import { type Clip, compile, defineAsset, type Lod, type Mesh, type Track } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { clipPlays, keysNode } from './clip-channels.ts';
import { glbContents } from './draw-budget.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb } from './glb.ts';
import { arm } from './skin-fixtures.ts';

const keys = new Float32Array([0, 1]);
const track = (target: { part: string } | { bone: string }, path: Track['path']): Track => ({
  ...target,
  path,
  times: keys,
  values: new Float32Array(path === 'weights' ? 2 : path === 'rotation' ? 8 : 6),
});
const clip = (name: string, tracks: Track[]): Clip => ({ name, seconds: 1, loop: true, tracks });
const blink = clip('blink', [track({ part: 'lid' }, 'weights')]);
const nod = clip('nod', [track({ part: 'lid' }, 'translation')]);

const face = defineAsset({
  name: 'face',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  clips: [blink, nod],
  build(ctx) {
    ctx.part('head', box({ size: [1, 1, 1], color: [1, 1, 1] }));
    const m = box({ size: [0.2, 0.2, 0.2], color: [1, 1, 1] });
    const d = new Float32Array(m.positions.length);
    d[2] = 0.05;
    const lid: Mesh = ctx.lod === 2 ? m : { ...m, morphs: [{ name: 'close', positions: d }] };
    ctx.part('lid', lid, { at: [0, 0, 1], motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 } });
  },
});

const inFile = (glb: Uint8Array): string[] =>
  ((readGlbChunks(glb).json['animations'] ?? []) as { name: string }[]).map((a) => a.name);

describe('which clips a LOD file keeps', () => {
  it('drops a weights-only clip on a LOD whose mesh has no morph targets', () => {
    const targets = glbContents(compile(face, { lod: 2 })).clipTargets;
    expect(clipPlays(blink, targets)).toBe(false);
    expect(clipPlays(nod, targets)).toBe(true);
    expect(clipPlays(clip('ghost', [track({ part: 'nose' }, 'rotation')]), targets)).toBe(false);
    expect(clipPlays(clip('limb', [track({ bone: 'upper' }, 'rotation')]), targets)).toBe(false);
  });

  it('never keys weights on a bone, and keys every other path on any node', () => {
    expect(keysNode(track({ bone: 'upper' }, 'weights'), 3)).toBe(false);
    expect(keysNode(track({ part: 'lid' }, 'weights'), 0)).toBe(false);
    expect(keysNode(track({ part: 'lid' }, 'weights'), 1)).toBe(true);
    expect(keysNode(track({ bone: 'upper' }, 'rotation'), 0)).toBe(true);
  });

  it('agrees with the clips the exporter writes, per LOD file', () => {
    for (const lod of [0, 1, 2] as readonly Lod[]) {
      const compiled = compile(face, { lod });
      const written = inFile(toGlb(compiled, { animations: true }));
      const listed = [blink, nod].filter((c) => clipPlays(c, glbContents(compiled).clipTargets));
      expect(listed.map((c) => c.name)).toEqual(written.filter((n) => n !== 'rest' && n !== 'run'));
    }
    const skinned = compile(arm());
    const [wave] = arm().clips ?? [];
    expect(wave !== undefined && clipPlays(wave, glbContents(skinned).clipTargets)).toBe(true);
    expect(inFile(toGlb(skinned, { animations: true }))).toContain('wave');
  });
});
