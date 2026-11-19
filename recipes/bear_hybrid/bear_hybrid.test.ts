// The model-tier bear's contract. Without the cache it IS the code bear of the creature kind
// (several trim-sheet parts, no texture set). With the committed cache: one skinned textured body
// on every LOD inside the triangle budget, the sourced withers height, head-and-body length and
// tail length, ≤ 64 bones, clips idle / look / walk (trot and gallop dropped, bite and blink
// impossible on a fused head), QA PASS on every LOD and the same bytes twice. The maps carry what
// the step program painted (ears no longer white, wet paws, a roughness that varies), and twenty
// code-built claws ride the paw bones at LOD 0 and 1. No test calls a model or Blender: the
// cache is read from disk.

import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  clearNeuralSources,
  compile,
  decodePng,
  type Mesh,
  neuralCache,
  provideNeural,
  runQa,
  toGlb,
} from '@developerz.ai/ts23d';
import { compileLods } from '@developerz.ai/ts23d/testing';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { bear_hybrid, CLAW, CLAWS, measured, SOURCED } from './bear_hybrid.ts';
import { TRIANGLES } from './steps.ts';
import { DROPPED } from './surface.ts';

const SLOW = 300_000;
const file = join(import.meta.dir, 'bear_hybrid.ts');
const cached = async (): Promise<void> => {
  clearNeuralSources();
  await provideRecipeNeural(file, ['bear_hybrid'], true);
};
const textured = (lod: 0 | 1 | 2) => compile(bear_hybrid, { lod }).parts.filter((p) => p.textures);

afterEach(() => clearNeuralSources());

/** A map's texels under the vertices `pick` keeps (UV origin top-left, as glTF): RGB 0..255. */
function texels(
  png: Uint8Array,
  mesh: Mesh,
  pick: (x: number, y: number, z: number) => boolean,
): [number, number, number][] {
  const image = decodePng(png);
  const out: [number, number, number][] = [];
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const [x = 0, y = 0, z = 0] = [0, 1, 2].map((k) => mesh.positions[v * 3 + k]);
    if (!pick(x, y, z)) continue;
    const px = Math.min(image.width - 1, Math.floor((mesh.uvs[v * 2] ?? 0) * image.width));
    const py = Math.min(image.height - 1, Math.floor((mesh.uvs[v * 2 + 1] ?? 0) * image.height));
    const at = (py * image.width + px) * 4;
    out.push([image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0]);
  }
  return out;
}
const mean = (values: readonly number[]): number =>
  values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);

describe('bear_hybrid, CPU tier (no neural cache)', () => {
  it(
    'is the code bear: trim-sheet parts, no texture set, the creature clips',
    () => {
      clearNeuralSources();
      const a = compile(bear_hybrid, { lod: 2 });
      expect(a.parts.some((p) => p.textures)).toBe(false);
      expect(a.parts.length).toBeGreaterThan(1);
      expect((a.clips ?? []).map((c) => c.name)).toContain('walk');
    },
    SLOW,
  );
});

describe('bear_hybrid, model tier (committed cache)', () => {
  it('a build with an empty cache (the npm package) stops with T3D_NEURAL_MISSING, no CPU stand-in', () => {
    clearNeuralSources();
    provideNeural(neuralCache({ recipe: 'bear_hybrid', offline: true }));
    expect(() => compile(bear_hybrid, { lod: 2 })).toThrow('T3D_NEURAL_MISSING');
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
        const a = compile(bear_hybrid, { lod });
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
    'the maps carry the paint: brown ear tips, wet dark paws, a roughness that varies',
    async () => {
      await cached();
      const body = textured(0)[0];
      const [mesh, set] = [body?.mesh, body?.textures];
      if (!mesh || !set?.orm) throw new Error('no textured body');
      let top = 0;
      for (let i = 2; i < mesh.positions.length; i += 3)
        top = Math.max(top, mesh.positions[i] ?? 0);
      // The generator capped the ears white (over 200 of 255); the ear tips are the top 2 cm.
      const ears = texels(set.albedo, mesh, (x, _y, z) => x > 0.6 && z > top - 0.02);
      expect(ears.length).toBeGreaterThan(3);
      expect(mean(ears.map((c) => Math.max(...c)))).toBeLessThan(150);
      // Wet mud: the paws are darker than the coat on the back.
      const value = (c: readonly number[]) => (c[0] ?? 0) + (c[1] ?? 0) + (c[2] ?? 0);
      const paws = mean(texels(set.albedo, mesh, (_x, _y, z) => z < 0.04).map(value));
      const back = mean(
        texels(set.albedo, mesh, (_x, y, z) => z > 0.8 && Math.abs(y) < 0.1).map(value),
      );
      expect(paws).toBeLessThan(back * 0.75);
      // One flat roughness (the bake's 0.8 = 204) has no spread; fur, mud, nose and claws do.
      const rough = texels(set.orm, mesh, () => true).map((c) => c[1]);
      const avg = mean(rough);
      const spread = Math.sqrt(mean(rough.map((r) => (r - avg) ** 2)));
      expect(Math.sqrt(mean([204, 204, 204].map((r) => (r - 204) ** 2)))).toBe(0);
      expect(spread).toBeGreaterThan(12);
      expect(mean(texels(set.orm, mesh, (_x, _y, z) => z < 0.04).map((c) => c[1]))).toBeLessThan(
        190,
      );
    },
    SLOW,
  );

  it(
    "twenty claws at LOD 0 and 1, each paw's on its own last bone, none under the floor; none at LOD 2",
    async () => {
      await cached();
      expect(compile(bear_hybrid, { lod: 2 }).parts.some((p) => p.name === CLAWS)).toBe(false);
      for (const lod of [0, 1] as const) {
        const a = compile(bear_hybrid, { lod });
        const mesh = a.parts.find((p) => p.name === CLAWS)?.mesh;
        if (!mesh?.joints || !mesh.weights) throw new Error('no skinned claws');
        const bones = a.skeleton?.bones ?? [];
        const paws = new Set(
          Array.from(
            mesh.joints.filter((_, i) => i % 4 === 0),
            (j) => bones[j]?.name ?? '',
          ),
        );
        expect([...paws].sort()).toEqual(['fore_l_3', 'fore_r_3', 'hind_l_3', 'hind_r_3']);
        for (let v = 0; v < mesh.positions.length / 3; v++) {
          expect(mesh.weights[v * 4]).toBe(1);
          expect(mesh.positions[v * 3 + 2]).toBeGreaterThanOrEqual(0);
        }
        // Twenty equal claws: the vertex count divides by 4 paws × 5 toes.
        const each = mesh.positions.length / 3 / (4 * CLAW.toes);
        expect(each).toBeGreaterThan(8);
        expect(Number.isInteger(each)).toBe(true);
      }
    },
    SLOW,
  );

  it(
    'measures as the sourced bear: withers, head and body, free tail',
    async () => {
      await cached();
      const m = measured(compile(bear_hybrid, { lod: 0 }));
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
      const a = compile(bear_hybrid, { lod: 2 });
      const names = new Set((a.skeleton?.bones ?? []).map((b) => b.name));
      expect(names.size).toBeGreaterThan(20);
      expect(names.size).toBeLessThanOrEqual(64);
      for (const n of ['head', 'neck_0', 'spine_0', 'fore_l_3', 'hind_r_3', 'tail_0'])
        expect(names.has(n)).toBe(true);
      const clips = (a.clips ?? []).map((c) => c.name);
      for (const c of ['idle', 'look', 'walk']) expect(clips).toContain(c);
      for (const c of [...DROPPED, 'bite', 'blink']) expect(clips).not.toContain(c);
      for (const c of a.clips ?? [])
        for (const t of c.tracks) if ('bone' in t) expect(names.has(t.bone)).toBe(true);
    },
    SLOW,
  );

  it(
    'passes QA on every LOD and builds the same bytes twice',
    async () => {
      await cached();
      for (const a of compileLods(bear_hybrid)) expect(runQa(a)).toEqual([]);
      const once = Bun.hash(toGlb(compile(bear_hybrid, { lod: 1 })));
      expect(Bun.hash(toGlb(compile(bear_hybrid, { lod: 1 })))).toBe(once);
    },
    SLOW,
  );
});
