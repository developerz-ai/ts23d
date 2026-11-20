// The model-tier wolf's contract. Without the cache it IS the code wolf of the creature kind
// (several trim-sheet parts, no texture set). With the committed cache: one skinned textured body
// on every LOD inside the triangle budget, the sourced withers height, head-and-body length and
// tail length, ≤ 64 bones, clips idle / look / walk / trot (gallop dropped, bite and blink
// impossible on a fused head), QA PASS on every LOD and the same bytes twice. The maps carry
// what the step program painted (the generator's orange cast gone, muddy legs, a roughness that
// varies). No test calls a model or Blender: the cache is read from disk.

import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  clearNeuralSources,
  compile,
  decodePng,
  dmath,
  neuralCache,
  provideNeural,
  runQa,
  toGlb,
} from '@developerz.ai/ts23d';
import { compileLods } from '@developerz.ai/ts23d/testing';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { TRIANGLES } from './steps.ts';
import { DROPPED } from './surface.ts';
import { measured, SOURCED, wolf_hybrid } from './wolf_hybrid.ts';

const SLOW = 300_000;
const file = join(import.meta.dir, 'wolf_hybrid.ts');
const cached = async (): Promise<void> => {
  clearNeuralSources();
  await provideRecipeNeural(file, ['wolf_hybrid'], true);
};
const textured = (lod: 0 | 1 | 2) => compile(wolf_hybrid, { lod }).parts.filter((p) => p.textures);

afterEach(() => clearNeuralSources());

describe('wolf_hybrid, CPU tier (no neural cache)', () => {
  it(
    'is the code wolf: trim-sheet parts, no texture set, the creature clips',
    () => {
      clearNeuralSources();
      const a = compile(wolf_hybrid, { lod: 2 });
      expect(a.parts.some((p) => p.textures)).toBe(false);
      expect(a.parts.length).toBeGreaterThan(1);
      expect((a.clips ?? []).map((c) => c.name)).toContain('walk');
    },
    SLOW,
  );
});

describe('wolf_hybrid, model tier (committed cache)', () => {
  it('a build with an empty cache (the npm package) stops with T3D_NEURAL_MISSING, no CPU stand-in', () => {
    clearNeuralSources();
    provideNeural(neuralCache({ recipe: 'wolf_hybrid', offline: true }));
    expect(() => compile(wolf_hybrid, { lod: 2 })).toThrow('T3D_NEURAL_MISSING');
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
        const a = compile(wolf_hybrid, { lod });
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
    'the maps carry the paint: no orange cast, mud to the wrists and hocks, a roughness that varies',
    async () => {
      await cached();
      const body = textured(0)[0];
      const [mesh, set] = [body?.mesh, body?.textures];
      expect(mesh && set?.orm).toBeTruthy();
      if (!mesh || !set?.orm) return;
      /** A map's texels under the vertices between two heights (metres): RGB 0..255. */
      const texels = (png: Uint8Array, z0: number, z1: number): number[][] => {
        const image = decodePng(png);
        const out: number[][] = [];
        for (let v = 0; v < mesh.positions.length / 3; v++) {
          const z = mesh.positions[v * 3 + 2] ?? 0;
          if (z < z0 || z >= z1) continue;
          const px = Math.min(image.width - 1, Math.floor((mesh.uvs[v * 2] ?? 0) * image.width));
          const py = Math.min(
            image.height - 1,
            Math.floor((mesh.uvs[v * 2 + 1] ?? 0) * image.height),
          );
          const at = (py * image.width + px) * 4;
          out.push([image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0]);
        }
        return out;
      };
      const mean = (values: readonly number[]): number =>
        values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
      const all = texels(set.albedo, -1, 9);
      expect(all.length).toBeGreaterThan(10_000);
      // The generator's orange (flank, ears, tail root): texels whose chroma passes 0.45 were
      // 8.2 % of the unpainted bake (18.6 % on the flank band), and are 0.4 % painted.
      const strong = (c: readonly number[]): number =>
        (Math.max(...c) - Math.min(...c)) / Math.max(...c, 1) > 0.45 ? 1 : 0;
      expect(mean(all.map(strong))).toBeLessThan(0.03);
      // Wet mud: the paws were as light as the flank (value 387 against 401 of 765); they are
      // a quarter of it, and the pasterns under half.
      const value = (c: readonly number[]): number => (c[0] ?? 0) + (c[1] ?? 0) + (c[2] ?? 0);
      const flank = mean(texels(set.albedo, 0.38, 0.57).map(value));
      expect(mean(texels(set.albedo, 0, 0.04).map(value))).toBeLessThan(flank * 0.5);
      expect(mean(texels(set.albedo, 0.04, 0.11).map(value))).toBeLessThan(flank * 0.7);
      // One flat roughness (the bake's 0.8 = 204) has no spread; coat, mud, nose and scars do.
      const rough = texels(set.orm, -1, 9).map((c) => c[1] ?? 0);
      const avg = mean(rough);
      expect(Math.sqrt(mean(rough.map((r) => dmath.pow(r - avg, 2))))).toBeGreaterThan(12);
    },
    SLOW,
  );

  it(
    'measures as the sourced wolf: withers, head and body, tail',
    async () => {
      await cached();
      const m = measured(compile(wolf_hybrid, { lod: 0 }));
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
    '≤ 64 plan-named bones; clips idle, look, walk, trot on them; gallop, bite and blink absent',
    async () => {
      await cached();
      const a = compile(wolf_hybrid, { lod: 2 });
      const names = new Set((a.skeleton?.bones ?? []).map((b) => b.name));
      expect(names.size).toBeGreaterThan(20);
      expect(names.size).toBeLessThanOrEqual(64);
      for (const n of ['head', 'neck_0', 'spine_0', 'fore_l_3', 'hind_r_3', 'tail_0'])
        expect(names.has(n)).toBe(true);
      const clips = (a.clips ?? []).map((c) => c.name);
      for (const c of ['idle', 'look', 'walk', 'trot']) expect(clips).toContain(c);
      for (const c of [...DROPPED, 'bite', 'blink']) expect(clips).not.toContain(c);
      for (const c of a.clips ?? [])
        for (const t of c.tracks) if ('bone' in t) expect(names.has(t.bone)).toBe(true);
    },
    SLOW,
  );

  it(
    'no edge joins tail-only skin to leg-only skin, and no joint limit declares a tolerance (D253)',
    async () => {
      // The generator fused the hanging tail to both thighs. With a hard tail / leg split in the
      // weights, 128 edge sides had one end on the tail and the other on a leg and stretched
      // ×8–10 at the hip's limits (QA `deform` ×5.7 on LOD 1, held by two `limitTolerances`).
      // `isolate`'s `contact` (steps.ts) blends the weights round those edges: zero such edges on
      // every LOD, and zero declared tolerances, so the gate's ×4 holds every joint.
      await cached();
      for (const lod of [0, 1, 2] as const) {
        const a = compile(wolf_hybrid, { lod });
        const bones = a.skeleton?.bones ?? [];
        expect(bones.filter((b) => b.limit?.stretch !== undefined).map((b) => b.name)).toEqual([]);
        const names = bones.map((b) => b.name);
        const m = textured(lod)[0]?.mesh;
        expect(m?.indices.length ?? 0).toBeGreaterThan(0);
        const share = (v: number, re: RegExp): number => {
          let s = 0;
          for (let k = 0; k < 4; k++)
            if (re.test(names[m?.joints?.[v * 4 + k] ?? 0] ?? ''))
              s += m?.weights?.[v * 4 + k] ?? 0;
          return s;
        };
        const T = m?.indices ?? new Uint32Array();
        const only = (v: number, re: RegExp) => share(v, re) >= 0.98;
        let joined = 0;
        for (let t = 0; t < T.length; t += 3)
          for (const [p = 0, q = 0] of [
            [T[t], T[t + 1]],
            [T[t + 1], T[t + 2]],
            [T[t + 2], T[t]],
          ])
            if (
              (only(p, /^tail_/) && only(q, /^hind_/)) ||
              (only(q, /^tail_/) && only(p, /^hind_/))
            )
              joined++;
        expect(joined).toBe(0);
      }
    },
    SLOW,
  );

  it(
    'passes QA on every LOD and builds the same bytes twice',
    async () => {
      await cached();
      for (const a of compileLods(wolf_hybrid)) expect(runQa(a)).toEqual([]);
      const once = Bun.hash(toGlb(compile(wolf_hybrid, { lod: 1 })));
      expect(Bun.hash(toGlb(compile(wolf_hybrid, { lod: 1 })))).toBe(once);
    },
    SLOW,
  );
});
