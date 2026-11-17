// riggedChain: image → mesh → rig → Blender steps → importModel through the recipe cache. A miss
// at any stage is null and asks nothing further; each ask names the previous output by sha256,
// and the raw and rigged meshes stay local.

import { afterEach, describe, expect, it } from 'bun:test';
import {
  clearNeuralSources,
  compile,
  type NeuralCtxAsk,
  type NeuralOutput,
  type NeuralSource,
  type NeuralTask,
  provideNeuralSource,
} from '../core/index.ts';
import { type ImportedModel, writeMeshGlb } from '../neural/index.ts';
import { box } from '../primitives/index.ts';
import { defineModelCharacter } from './model-character.ts';
import { riggedChain } from './model-character-chain.ts';
import { albedoPng } from './model-fixtures.ts';

afterEach(() => clearNeuralSources());

describe('riggedChain', () => {
  const sha = (c: string): string => c.repeat(32);
  const local = (c: string): NeuralOutput => ({
    bytes: new Uint8Array(0),
    mime: 'model/gltf-binary',
    sha256: sha(c),
    absent: true,
  });
  const glb = writeMeshGlb([
    { name: 'body', mesh: box({ size: [0.4, 0.3, 1], color: [1, 1, 1] }) },
  ]);
  const all: Partial<Record<NeuralTask, NeuralOutput>> = {
    image: { bytes: albedoPng(false), mime: 'image/png', sha256: sha('a1') },
    mesh: local('b2'),
    rig: local('c3'),
    blender: { bytes: glb, mime: 'model/gltf-binary', sha256: sha('d4') },
  };
  interface Seen {
    task: NeuralTask;
    request: Record<string, unknown>;
    ask: NeuralCtxAsk | undefined;
  }
  function run(name: string, outputs: Partial<Record<NeuralTask, NeuralOutput>>) {
    const seen: Seen[] = [];
    const source = {
      get(task: NeuralTask, request: object, ask?: NeuralCtxAsk) {
        seen.push({ task, request: request as Record<string, unknown>, ask });
        const out = outputs[task];
        return out ? { outputs: [out] } : null;
      },
    } as NeuralSource;
    let got: ImportedModel | null | undefined;
    const asset = defineModelCharacter({
      name,
      real: { length: 0.4, width: 0.3, height: 1.8, mass: 80 },
      budget: { triangles: [100, 100, 100] },
      model: (ctx) => {
        got = riggedChain(ctx, {
          concept: { seed: 1, prompt: 'a ranger, a-pose', width: 1024, height: 1024 },
          surface: { seed: 0, pose: 'a-pose', maxTriangles: 300_000 },
          rig: { seed: 0, height: 1.8, clips: ['Idle'] },
          steps: [{ op: 'clean' }, { op: 'export' }],
          maxTriangles: 100,
          models: { mesh: 'meshy-7.1', rig: 'meshy-rigging' },
          seed: 7,
          license: 'own',
          author: 'fixture',
        });
        return null;
      },
      clips: { rename: {} },
      fallback: (ctx, { part }) => ctx.part(part, box({ size: [0.4, 0.3, 1.8], color: [1, 1, 1] })),
    });
    provideNeuralSource([name], source);
    compile(asset);
    return { got, seen };
  }

  it('a miss at any stage is null, and nothing after it is asked', () => {
    const order: NeuralTask[] = ['image', 'mesh', 'rig', 'blender'];
    order.forEach((miss, i) => {
      const { got, seen } = run(`miss_${miss}`, { ...all, [miss]: undefined });
      expect(got).toBeNull();
      expect(seen.map((s) => s.task)).toEqual(order.slice(0, i + 1));
    });
    // A committed output whose file is gone is a miss too, not an import of nothing.
    expect(run('gone', { ...all, blender: local('d4') }).got).toBeNull();
  });

  it('each ask names the previous output by sha256; raw and rigged meshes stay local', () => {
    const { got, seen } = run('hit', all);
    expect(got?.lods).toHaveLength(1);
    expect(got?.credit).toContain(`blender steps on rig ${sha('c3').slice(0, 12)}`);
    const [, mesh, rig, blender] = seen;
    expect(mesh?.request['image']).toEqual({ sha256: sha('a1'), mime: 'image/png' });
    expect(mesh?.ask).toMatchObject({ model: 'meshy-7.1', keep: 'local' });
    // The concept's bytes are here, so they travel; the absent raw mesh's cannot.
    expect([...(mesh?.ask?.inputs?.keys() ?? [])]).toEqual([sha('a1')]);
    expect(rig?.request).toMatchObject({ height: 1.8, mesh: { sha256: sha('b2') } });
    expect(rig?.ask).toMatchObject({ model: 'meshy-rigging', keep: 'local' });
    expect(rig?.ask?.inputs).toBeUndefined();
    expect(blender?.request).toMatchObject({
      seed: 7,
      maxTriangles: 100,
      mesh: { sha256: sha('c3') },
    });
    expect(blender?.ask?.keep).toBeUndefined();
    expect(blender?.ask?.inputs?.size).toBe(1);
  });
});
