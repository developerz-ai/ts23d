import { afterEach, describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { MeshBuilder } from './mesh.ts';
import { clearNeuralSources, neuralReader, provideNeuralSource } from './neural-ctx.ts';
import type { NeuralResult } from './neural-task.ts';

afterEach(clearNeuralSources);

const PNG = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' };
const SHA = 'a'.repeat(64);

/** A one-triangle asset whose height says whether ctx.neural answered. */
const probe = defineAsset({
  name: 'probe',
  kind: 'prop',
  budget: { triangles: [1, 1, 1] },
  build(ctx) {
    const hit = ctx.neural('image', { seed: 1, prompt: 'moss', width: 4, height: 4 });
    const m = new MeshBuilder();
    const v = (p: [number, number, number]): number =>
      m.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    m.tri(v([0, 0, 0]), v([1, 0, 0]), v([0, 1, hit ? 2 : 1]));
    ctx.part('body', m.build());
  },
});
const top = (): number => Math.max(...(compile(probe).parts[0]?.mesh?.positions ?? []));

describe('ctx.neural', () => {
  it('no source provided: a miss is null and the recipe builds its CPU version', () => {
    expect(top()).toBe(1);
  });

  it('a provided source answers by asset name; other assets still miss', () => {
    const seen: string[] = [];
    provideNeuralSource(['probe'], {
      get: <T extends 'image'>(task: T): NeuralResult<T> => {
        seen.push(task);
        return { outputs: [PNG] } as NeuralResult<T>;
      },
    } as Parameters<typeof provideNeuralSource>[1]);
    expect(top()).toBe(2);
    expect(seen).toEqual(['image']);
    expect(neuralReader('other')('image', { seed: 1, prompt: 'x', width: 4, height: 4 })).toBe(
      null,
    );
  });

  it('refuses an input not named by a sha256, and a fractional seed, on every machine', () => {
    const read = neuralReader('probe');
    expect(() =>
      read('mesh', { seed: 1, image: { sha256: 'wolf.png', mime: 'image/png' } }),
    ).toThrow('T3D_RECIPE_INVALID');
    expect(() => read('mesh', { seed: 1.5, image: { sha256: SHA, mime: 'image/png' } })).toThrow(
      /has seed 1.5/,
    );
    expect(() =>
      read('motion', {
        seed: 1,
        prompt: 'trot',
        skeleton: { sha256: SHA, mime: 'application/json' },
        video: { sha256: 'clip', mime: 'video/mp4' },
        seconds: 1,
        fps: 30,
      }),
    ).toThrow('T3D_RECIPE_INVALID');
    const ok = { sha256: SHA, mime: 'application/json' };
    expect(() =>
      read('blender', { seed: 1, program: { ...ok, sha256: 'steps.json' }, maxTriangles: 9 }),
    ).toThrow('T3D_RECIPE_INVALID');
    expect(() =>
      read('mesh', {
        seed: 1,
        images: [{ sha256: 'side.png', mime: 'image/png' }],
        pose: 'a-pose',
      }),
    ).toThrow('T3D_RECIPE_INVALID');
    expect(read('blender', { seed: 1, program: ok, skeleton: ok, maxTriangles: 9 })).toBe(null);
    expect(read('rig', { seed: 1, mesh: ok, height: 1.8, clips: ['walk'] })).toBe(null);
    expect(read('mesh', { seed: 1, image: { sha256: SHA, mime: 'image/png' } })).toBe(null);
  });
});
