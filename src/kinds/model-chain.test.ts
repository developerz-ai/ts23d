import { afterEach, describe, expect, it } from 'bun:test';
import {
  clearNeuralSources,
  compile,
  defineAsset,
  type NeuralCtxAsk,
  type NeuralOutput,
  type NeuralSource,
  type NeuralTask,
  provideNeuralSource,
} from '../core/index.ts';
import { type BlenderStep, type ImportedModel, sha256Hex, writeMeshGlb } from '../neural/index.ts';
import { creaturePlan } from './creature.ts';
import { type ChainedModel, modelChain } from './model-chain.ts';
import { albedoPng, capsuleCreature, FIXTURE_WOLF } from './model-fixtures.ts';

const png = albedoPng(false);
const glb = writeMeshGlb([
  { name: 'body', mesh: capsuleCreature(creaturePlan(FIXTURE_WOLF).bones) },
]);
const rawSha = 'ab'.repeat(32);
const STEPS: readonly BlenderStep[] = [
  { op: 'clean' },
  { op: 'retopo', triangles: 3000 },
  { op: 'uv' },
  { op: 'bake' },
  { op: 'lods', triangles: [1000, 300] },
  { op: 'export' },
];

interface Seen {
  task: NeuralTask;
  request: Record<string, unknown>;
  ask: NeuralCtxAsk | undefined;
}

/** A cache that answers each task with the given output (undefined = a miss) and records asks. */
function fake(outputs: Partial<Record<NeuralTask, NeuralOutput>>): {
  source: NeuralSource;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const source = {
    get(task: NeuralTask, request: object, ask?: NeuralCtxAsk) {
      seen.push({ task, request: request as Record<string, unknown>, ask });
      const out = outputs[task];
      return out ? { outputs: [out] } : null;
    },
  } as NeuralSource;
  return { source, seen };
}

function run(name: string, source: NeuralSource): ImportedModel | null | undefined {
  let got: ChainedModel | null | undefined;
  const asset = defineAsset({
    name,
    kind: 'prop',
    budget: { triangles: [10, 10, 10] },
    build(ctx) {
      got = modelChain(ctx, {
        concept: { seed: 1, prompt: 'a grey wolf, side on', width: 1024, height: 1024 },
        surface: { seed: 2, maxTriangles: 1_000_000 },
        steps: STEPS,
        maxTriangles: 3000,
        models: { mesh: 'pixal3d' },
        license: 'MIT',
        author: 'fixture',
      });
    },
  });
  provideNeuralSource([name], source);
  compile(asset);
  return got === null ? null : got?.model;
}

const image: NeuralOutput = { bytes: png, mime: 'image/png' };
const absentMesh: NeuralOutput = {
  bytes: new Uint8Array(),
  mime: 'model/gltf-binary',
  sha256: rawSha,
  absent: true,
};
const blender: NeuralOutput = { bytes: glb, mime: 'model/gltf-binary' };

describe('modelChain', () => {
  afterEach(clearNeuralSources);

  it('returns null on a miss at any stage and asks no further', () => {
    const none = fake({});
    expect(run('chain_none', none.source)).toBeNull();
    expect(none.seen.map((s) => s.task)).toEqual(['image']);
    const noMesh = fake({ image });
    expect(run('chain_no_mesh', noMesh.source)).toBeNull();
    expect(noMesh.seen.map((s) => s.task)).toEqual(['image', 'mesh']);
    const noBlend = fake({ image, mesh: absentMesh });
    expect(run('chain_no_blend', noBlend.source)).toBeNull();
    expect(noBlend.seen.map((s) => s.task)).toEqual(['image', 'mesh', 'blender']);
  });

  it('returns null when the Blender output itself is absent (bytes are needed to import)', () => {
    const f = fake({
      image,
      mesh: absentMesh,
      blender: { ...blender, bytes: new Uint8Array(), sha256: rawSha, absent: true },
    });
    expect(run('chain_absent', f.source)).toBeNull();
  });

  it('chains by sha256 through a raw mesh that is not on this machine', () => {
    const f = fake({ image, mesh: absentMesh, blender });
    const model = run('chain_hit', f.source);
    expect(model?.lods.length).toBe(1);
    const [, mesh, blend] = f.seen;
    expect(mesh?.request['image']).toEqual({ sha256: sha256Hex(png), mime: 'image/png' });
    expect(mesh?.ask?.keep).toBe('local');
    expect(mesh?.ask?.model).toBe('pixal3d');
    expect(mesh?.ask?.inputs?.get(sha256Hex(png))).toBe(png);
    expect(blend?.request['mesh']).toEqual({ sha256: rawSha, mime: 'model/gltf-binary' });
    const program = blend?.request['program'] as { sha256: string };
    const bytes = blend?.ask?.inputs?.get(program.sha256);
    expect(bytes && sha256Hex(bytes)).toBe(program.sha256);
    // The raw mesh is absent: only the program travels.
    expect(blend?.ask?.inputs?.size).toBe(1);
    expect(blend?.request['maxTriangles']).toBe(3000);
  });

  it('sends the raw mesh bytes along when they are here', () => {
    const raw: NeuralOutput = { bytes: glb, mime: 'model/gltf-binary' };
    const f = fake({ image, mesh: raw, blender });
    expect(run('chain_local', f.source)).not.toBeNull();
    const blend = f.seen[2];
    expect(blend?.request['mesh']).toEqual({ sha256: sha256Hex(glb), mime: 'model/gltf-binary' });
    expect(blend?.ask?.inputs?.get(sha256Hex(glb))).toBe(glb);
  });
});
