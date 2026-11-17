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
  SKIN_INFLUENCES,
} from '../core/index.ts';
import type { ImportedModel } from '../neural/index.ts';
import { box } from '../primitives/index.ts';
import { defineModelCharacter } from './model-character.ts';
import { foldTargets } from './model-character-body.ts';
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

  it('two characters on ONE model that keep different bones do not share a skin, either order', () => {
    // `hop` moves only the leg, so `head` (and its helper) fold into the root; `walk` keeps `head`.
    const hop: Clip = { ...clip('hop', true, [0, 0.01, 0]), tracks: [track('leg', [0, 0.01, 0])] };
    let shared = model();
    const make = (name: string, rename: Record<string, string>) =>
      defineModelCharacter({
        name,
        real: { length: 0.4, width: 0.3, height: 1.8, mass: 80 },
        budget: { triangles: [100, 100, 100], bones: 8, textureSets: { count: 1, size: 1024 } },
        model: () => shared,
        clips: { rename },
        fallback: (ctx, { part }) =>
          ctx.part(part, box({ size: [0.4, 0.3, 1.8], color: [1, 1, 1] })),
      });
    const first = (name: string, rename: Record<string, string>) => {
      const a = compile(make(name, rename));
      const j = a.parts[0]?.mesh?.joints?.[0] ?? -1;
      return a.skeleton?.bones[j]?.name;
    };
    for (const order of [
      ['walker', 'hopper'],
      ['hopper', 'walker'],
    ]) {
      // A fresh model per order: the second order must be a cold build too, not a cache read.
      shared = model({ clips: [clip('casual_walk', true, [0, 0.01, 0]), hop] });
      const seen = Object.fromEntries(
        order.map((n) => [
          n,
          first(`${n}_${order[0]}`, n === 'walker' ? { casual_walk: 'walk' } : { hop: 'hop' }),
        ]),
      );
      expect(seen).toEqual({ walker: 'head', hopper: 'hips' });
    }
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
