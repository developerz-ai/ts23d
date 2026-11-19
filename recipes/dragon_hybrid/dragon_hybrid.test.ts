// The model-tier dragon's contract. Without the cache it is a code-built wingless quadruped of
// the creature kind (several trim-sheet parts, no texture set). With the committed cache: one
// skinned textured body on every LOD inside the triangle budget, the design spec's shoulder
// height, head-and-body length and tail length, ≤ 64 bones, clips idle / look / walk (trot and
// gallop dropped, bite and blink impossible on a fused head, no wing bones), QA PASS on every
// LOD and the same bytes twice. No test calls a model or Blender: the cache is read from disk.

import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  clearNeuralSources,
  compile,
  neuralCache,
  provideNeural,
  runQa,
  toGlb,
} from '@developerz.ai/ts23d';
import { compileLods } from '@developerz.ai/ts23d/testing';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { dragon_hybrid, measured, SOURCED } from './dragon_hybrid.ts';
import { TRIANGLES } from './steps.ts';
import { DROPPED } from './surface.ts';

const SLOW = 300_000;
const file = join(import.meta.dir, 'dragon_hybrid.ts');
const cached = async (): Promise<void> => {
  clearNeuralSources();
  await provideRecipeNeural(file, ['dragon_hybrid'], true);
};
const textured = (lod: 0 | 1 | 2) =>
  compile(dragon_hybrid, { lod }).parts.filter((p) => p.textures);

afterEach(() => clearNeuralSources());

describe('dragon_hybrid, CPU tier (no neural cache)', () => {
  it(
    'is the code quadruped: trim-sheet parts, no texture set, the creature clips',
    () => {
      clearNeuralSources();
      const a = compile(dragon_hybrid, { lod: 2 });
      expect(a.parts.some((p) => p.textures)).toBe(false);
      expect(a.parts.length).toBeGreaterThan(1);
      expect((a.clips ?? []).map((c) => c.name)).toContain('walk');
    },
    SLOW,
  );
});

describe('dragon_hybrid, model tier (committed cache)', () => {
  it('a build with an empty cache (the npm package) stops with T3D_NEURAL_MISSING, no CPU stand-in', () => {
    clearNeuralSources();
    provideNeural(neuralCache({ recipe: 'dragon_hybrid', offline: true }));
    expect(() => compile(dragon_hybrid, { lod: 2 })).toThrow('T3D_NEURAL_MISSING');
  });

  it(
    'a missing cache is not mistaken for the model: the textured body appears only with it',
    async () => {
      clearNeuralSources();
      expect(textured(2)).toHaveLength(0);
      await cached();
      const set = textured(2)[0]?.textures;
      // PNG header: width and height are big-endian at bytes 16 and 20.
      const edge = (at: number) =>
        new DataView(
          set?.albedo.buffer ?? new ArrayBuffer(24),
          set?.albedo.byteOffset ?? 0,
        ).getUint32(at);
      expect([edge(16), edge(20)]).toEqual([2048, 2048]);
      expect(set?.normal).toBeDefined();
      expect(set?.orm).toBeDefined();
    },
    SLOW,
  );

  it(
    'one skinned textured body per LOD, inside the budget and not a stub',
    async () => {
      await cached();
      for (const lod of [0, 1, 2] as const) {
        const a = compile(dragon_hybrid, { lod });
        const body = textured(lod);
        expect(body).toHaveLength(1);
        const mesh = body[0]?.mesh;
        expect(mesh?.joints?.length).toBe(((mesh?.positions.length ?? 0) / 3) * 4);
        const triangles = (mesh?.indices.length ?? 0) / 3;
        expect(triangles).toBeLessThanOrEqual(a.budget.triangles[lod]);
        // Blender was asked for TRIANGLES and lands within 1 %.
        expect(triangles).toBeGreaterThan(TRIANGLES[lod] * 0.99);
      }
    },
    SLOW,
  );

  it(
    'measures as the design spec: shoulder, head and body, tail',
    async () => {
      await cached();
      const m = measured(compile(dragon_hybrid, { lod: 0 }));
      expect(m).not.toBeNull();
      for (const k of Object.keys(SOURCED) as (keyof typeof SOURCED)[]) {
        const [lo, hi] = SOURCED[k];
        expect(m?.[k] ?? Number.NaN).toBeGreaterThanOrEqual(lo);
        expect(m?.[k] ?? Number.NaN).toBeLessThanOrEqual(hi);
      }
    },
    SLOW,
  );

  it(
    '≤ 64 plan-named bones; clips idle, look, walk on them; trot, gallop, bite and blink absent',
    async () => {
      await cached();
      const a = compile(dragon_hybrid, { lod: 2 });
      const names = new Set((a.skeleton?.bones ?? []).map((b) => b.name));
      expect(names.size).toBeGreaterThan(20);
      expect(names.size).toBeLessThanOrEqual(64);
      for (const n of ['head', 'neck_0', 'spine_0', 'fore_l_3', 'hind_r_3', 'tail_4'])
        expect(names.has(n)).toBe(true);
      const clips = (a.clips ?? []).map((c) => c.name);
      for (const c of ['idle', 'look', 'walk']) expect(clips).toContain(c);
      for (const c of [...DROPPED, 'bite', 'blink']) expect(clips).not.toContain(c);
      // The rigger gives no wing bones: the wings ride with the chest.
      expect([...names].some((n) => n.includes('wing'))).toBe(false);
      for (const c of a.clips ?? [])
        for (const t of c.tracks) if ('bone' in t) expect(names.has(t.bone)).toBe(true);
    },
    SLOW,
  );

  it(
    'passes QA on every LOD and builds the same bytes twice',
    async () => {
      await cached();
      for (const a of compileLods(dragon_hybrid)) expect(runQa(a)).toEqual([]);
      const once = Bun.hash(toGlb(compile(dragon_hybrid, { lod: 1 })));
      expect(Bun.hash(toGlb(compile(dragon_hybrid, { lod: 1 })))).toBe(once);
    },
    SLOW,
  );
});
