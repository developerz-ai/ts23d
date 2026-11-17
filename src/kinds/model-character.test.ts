// Rigged-model characters. Failure cases first: a model with no rig, a clip that is not there, a
// one-shot declared a loop, a cache miss anywhere in the chain (the fallback builds). Then the
// contract: helper leaves fold into their parents, bones and clips are renamed, a lifted clip
// rides higher, and one asset shows the clips of whichever body it just built.

import { afterEach, describe, expect, it } from 'bun:test';
import {
  type Bone,
  type Clip,
  clearNeuralSources,
  compile,
  type Mesh,
  type NeuralCtxAsk,
  type NeuralOutput,
  type NeuralSource,
  type NeuralTask,
  provideNeuralSource,
  SKIN_INFLUENCES,
} from '../core/index.ts';
import { type ImportedModel, writeMeshGlb } from '../neural/index.ts';
import { box } from '../primitives/index.ts';
import { defineModelCharacter } from './model-character.ts';
import { foldTargets } from './model-character-body.ts';
import { riggedChain } from './model-character-chain.ts';
import { liftClip } from './model-character-clips.ts';
import { albedoPng } from './model-fixtures.ts';

const BONES: Bone[] = [
  { name: 'hips', head: [0, 0, 1], tail: [0, 0, 1.2] },
  { name: 'head', parent: 'hips', head: [0, 0, 1.5], tail: [0, 0, 1.7] },
  { name: 'head_end', parent: 'head', head: [0, 0, 1.7], tail: [0, 0, 1.8] },
  { name: 'leg', parent: 'hips', head: [0, 0, 1], tail: [0, 0, 0.05] },
];

/** A 0.4 × 0.3 × 1.8 m block; every vertex half on `head`, half on the helper `head_end`. */
function block(): Mesh {
  const m = box({ size: [0.4, 0.3, 1.8], color: [0.5, 0.5, 0.5] });
  const n = m.positions.length / 3;
  const joints = new Uint16Array(n * SKIN_INFLUENCES);
  const weights = new Float32Array(n * SKIN_INFLUENCES);
  for (let v = 0; v < n; v++) {
    joints.set([1, 2], v * SKIN_INFLUENCES);
    weights.set([0.5, 0.5], v * SKIN_INFLUENCES);
  }
  return { ...m, joints, weights };
}

const track = (bone: string, z: readonly number[]) => ({
  bone,
  path: 'translation' as const,
  times: Float32Array.from(z, (_, i) => i / 30),
  values: Float32Array.from(z.flatMap((v) => [0, 0, v])),
});
const clip = (name: string, loop: boolean, z: readonly number[]): Clip => ({
  name,
  seconds: (z.length - 1) / 30,
  loop,
  tracks: [track('hips', z), track('leg', z), track('head', z)],
});

const model = (over: Partial<ImportedModel> = {}): ImportedModel => ({
  lods: [block()],
  textures: { name: 'body', albedo: albedoPng(false) },
  armature: { bones: BONES },
  boneNames: {},
  clips: [clip('casual_walk', true, [0, 0.01, 0]), clip('wave', false, [0, 0.01, 0.02])],
  credit: 'fixture',
  warnings: [],
  sha256: 'cd'.repeat(32),
  scale: 1,
  ...over,
});

const character = (got: ImportedModel | null, clips: Record<string, unknown> = {}) =>
  defineModelCharacter({
    name: 'figure',
    real: { length: 0.4, width: 0.3, height: 1.8, mass: 80 },
    budget: { triangles: [100, 100, 100], bones: 8, textureSets: { count: 1, size: 1024 } },
    model: () => got,
    part: 'clothed_body',
    clips: { rename: { casual_walk: 'walk' }, ...clips },
    boneNames: { hips: 'pelvis' },
    fallback: (ctx, { part, mass }) => {
      const m = box({ size: [0.4, 0.3, 1.8], color: [0.5, 0.5, 0.5] });
      ctx.part(part, m, { density: mass / (0.4 * 0.3 * 1.8) });
    },
  });

afterEach(() => clearNeuralSources());

describe('defineModelCharacter: what it refuses', () => {
  it('a model with no armature, skin or texture set', () => {
    const { armature: _, ...bare } = model();
    expect(() => compile(character(bare))).toThrow(/T3D_MODEL_SKELETON.*0 bone\(s\)/s);
    const { textures: __, ...plain } = model();
    expect(() => compile(character(plain))).toThrow(/no texture set/);
  });

  it('a clip the model does not have, by the names it does have', () => {
    const a = character(model(), { rename: { run_02: 'jog' } });
    expect(() => compile(a)).toThrow(/no clip 'run_02' \(it has 'casual_walk', 'wave'\)/);
  });

  it('a one-shot declared a loop, and a loop or lift on a clip the asset lacks', () => {
    const shot = character(model(), { rename: { wave: 'wave' }, loop: ['wave'] });
    expect(() => compile(shot)).toThrow(/clip 'wave' must loop/);
    expect(() => compile(character(model(), { lift: { idle: 0.01 } }))).toThrow(/'idle'/);
  });
});

describe('defineModelCharacter', () => {
  it('a miss builds the fallback: one plain part, no bones, no clips', () => {
    const a = compile(character(null));
    expect(a.parts.map((p) => [p.name, p.textures])).toEqual([['clothed_body', undefined]]);
    expect(a.skeleton).toBeUndefined();
    expect(a.clips ?? []).toEqual([]);
  });

  it('a hit is one skinned textured part on the kept bones, weighing the real mass', () => {
    const a = compile(character(model(), { loop: ['walk'], lift: { walk: 0.02 } }));
    expect(a.kind).toBe('character');
    expect(a.parts).toHaveLength(1);
    expect(a.parts[0]?.textures?.name).toBe('body');
    // `head_end` moves in no clip: folded into `head`; `leg` is a leaf too, but `walk` keys it.
    expect(a.skeleton?.bones.map((b) => [b.name, b.parent])).toEqual([
      ['pelvis', undefined],
      ['head', 'pelvis'],
      ['leg', 'pelvis'],
    ]);
    const mesh = a.parts[0]?.mesh;
    expect([...(mesh?.joints?.subarray(0, 4) ?? [])]).toEqual([1, 1, 0, 0]);
    expect([...(mesh?.weights?.subarray(0, 4) ?? [])]).toEqual([1, 0, 0, 0]);
    expect(a.parts[0]?.density).toBeCloseTo(80 / (0.4 * 0.3 * 1.8), 3);
    expect(a.creases?.map((c) => [c.name, c.part])).toEqual([['model_surface', 'clothed_body']]);
    // Unlisted `wave` is dropped; `walk` follows the renamed root and rides 2 cm higher.
    expect(a.clips?.map((c) => c.name)).toEqual(['walk']);
    const root = a.clips?.[0]?.tracks[0];
    expect(root && 'bone' in root ? root.bone : '').toBe('pelvis');
    expect([2, 5, 8].map((k) => +(root?.values[k] ?? 0).toFixed(4))).toEqual([0.02, 0.03, 0.02]);
  });

  it('one asset shows the clips of the body it just built', () => {
    let got: ImportedModel | null = model();
    const a = defineModelCharacter({
      name: 'switching',
      real: { length: 0.4, width: 0.3, height: 1.8, mass: 80 },
      budget: { triangles: [100, 100, 100], bones: 8, textureSets: { count: 1, size: 1024 } },
      model: () => got,
      clips: { rename: { casual_walk: 'walk' } },
      fallback: (ctx, { part }) => ctx.part(part, box({ size: [0.4, 0.3, 1.8], color: [1, 1, 1] })),
    });
    expect(compile(a).clips?.map((c) => c.name)).toEqual(['walk']);
    got = null;
    expect(compile(a).clips ?? []).toEqual([]);
    got = model();
    expect(compile(a).clips?.map((c) => c.name)).toEqual(['walk']);
    expect(compile(a).parts[0]?.name).toBe('body');
  });
});

describe('rigged-model helpers', () => {
  it('only leaf bones no clip moves fold, a chain of them whole', () => {
    const bones: Bone[] = [
      ...BONES,
      { name: 'tip', parent: 'head_end', head: [0, 0, 1.8], tail: [0, 0, 1.9] },
    ];
    const to = foldTargets(bones, [clip('walk', true, [0, 0])]);
    expect(['tip', 'head_end', 'head', 'leg'].map((n) => to.get(n))).toEqual([
      'head',
      'head',
      'head',
      'leg',
    ]);
    // A bone left a leaf by the fold, and still unmoved, folds too.
    const legOnly: Clip = { ...clip('hop', true, [0, 0]), tracks: [track('leg', [0, 0])] };
    expect(foldTargets(bones, [legOnly]).get('tip')).toBe('hips');
  });

  it('liftClip keys the root when it has no height track, and leaves 0 alone', () => {
    const still: Clip = { ...clip('idle', true, [0, 0]), tracks: [track('leg', [0, 0])] };
    expect(liftClip(still, 'hips', 0)).toBe(still);
    const up = liftClip(still, 'hips', 0.006).tracks[1];
    expect(up && 'bone' in up ? [up.bone, up.path] : []).toEqual(['hips', 'translation']);
    expect([...(up?.times ?? [])]).toEqual([0, Math.fround(1 / 30)]);
    expect([...(up?.values ?? [])].map((v) => +v.toFixed(4))).toEqual([0, 0, 0.006, 0, 0, 0.006]);
  });
});

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
