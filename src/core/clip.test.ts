import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { type Clip, checkClip, type Track, useClip } from './clip.ts';

const rot = (times: number[]): Track => ({
  bone: 'jaw',
  path: 'rotation',
  times: new Float32Array(times),
  values: new Float32Array(times.flatMap(() => [0, 0, 0, 1])),
});
const clip = (tracks: Track[], over: Partial<Clip> = {}): Clip => ({
  name: 'bite',
  seconds: 1,
  loop: false,
  tracks,
  ...over,
});

describe('checkClip', () => {
  it('refuses unsorted key times', () => {
    expect(() => checkClip('wolf', clip([rot([0, 0.5, 0.25])]))).toThrow(
      /T3D_RECIPE_INVALID: clip 'bite' in 'wolf': .*not strictly increasing/,
    );
  });

  it('refuses a key past the clip end', () => {
    expect(() => checkClip('wolf', clip([rot([0, 2])]))).toThrow(/outside 0..1/);
  });

  it('refuses the wrong value count for the path', () => {
    const t: Track = {
      part: 'lid',
      path: 'translation',
      times: new Float32Array([0, 1]),
      values: new Float32Array(4),
    };
    expect(() => checkClip('box', clip([t]))).toThrow(/4 values for 2 keys/);
  });

  it('refuses the reserved run name and a track keyed twice', () => {
    expect(() => checkClip('wolf', clip([rot([0])], { name: 'run' }))).toThrow(/reserved/);
    expect(() => checkClip('wolf', clip([rot([0]), rot([1])]))).toThrow(/keyed twice/);
  });

  it('refuses weights that do not divide into keys', () => {
    const t: Track = {
      part: 'head',
      path: 'weights',
      times: new Float32Array([0, 1]),
      values: new Float32Array(3),
    };
    expect(() => checkClip('head', clip([t]))).toThrow('T3D_RECIPE_INVALID');
  });

  it('accepts a valid clip and prefixes it under use', () => {
    const c = clip([rot([0, 0.5, 1])], { loop: true });
    expect(checkClip('wolf', c)).toBe(c);
    const used = useClip(c, 'pack_0');
    expect(used.name).toBe('pack_0_bite');
    expect(used.tracks[0] && 'bone' in used.tracks[0] ? used.tracks[0].bone : '').toBe(
      'pack_0_jaw',
    );
  });
});

describe('clips on an asset', () => {
  const jawed = (clips: Clip[]) =>
    defineAsset({
      name: 'jawed',
      kind: 'creature',
      budget: { triangles: [10, 10, 10] },
      clips,
      build(ctx) {
        ctx.bone('jaw', { head: [0, 0, 1], tail: [0.2, 0, 1] });
        ctx.group('lid');
      },
    });

  it('refuses a track on a bone the asset does not have', () => {
    const t: Track = { ...rot([0]), bone: 'tail' };
    expect(() => compile(jawed([clip([t])]))).toThrow(/keys bone 'tail', which the asset/);
  });

  it('refuses two clips with one name', () => {
    expect(() => compile(jawed([clip([rot([0])]), clip([rot([0])])]))).toThrow(/declared twice/);
  });

  it('collects valid clips on bones and parts', () => {
    const lid: Track = {
      part: 'lid',
      path: 'translation',
      times: new Float32Array([0]),
      values: new Float32Array(3),
    };
    const out = compile(jawed([clip([rot([0, 1]), lid])]));
    expect(out.clips?.map((c) => c.name)).toEqual(['bite']);
  });
});
