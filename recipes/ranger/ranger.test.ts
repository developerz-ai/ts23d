// The ranger's contract. Without the cache: the CPU mannequin (one static part, no skeleton, no
// clips, same real box). With the committed cache: 1.78 m ± 2 %, one skinned textured part on
// every LOD inside the triangle budget, ≤ 64 bones, clips idle / walk / jog at the lengths the
// rig service returned, joints at human landmark heights, boots on the floor through every clip,
// the playbook's model-tier triangle band, the painted wear in the maps, and the same bytes
// twice. No test calls a model: the cache is read from disk.

import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  boundsOf,
  type Clip,
  clearNeuralSources,
  compile,
  decodePng,
  runQa,
  toGlb,
} from '@developerz.ai/ts23d';
import { compileLods } from '@developerz.ai/ts23d/testing';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { LANDMARKS, LIFT, PART, ranger } from './ranger.ts';
import { TRIANGLES } from './steps.ts';
import { HEIGHT } from './surface.ts';
import { BANDS } from './wear.ts';

const SLOW = 300_000;
/** The rig service keys its library clips at 30 fps. */
const FRAME = 1 / 30;
/** Last key = first key on every track. */
const closed = (c: Clip): boolean =>
  c.tracks.every((t) => {
    const s = t.values.length / t.times.length;
    return [...t.values.subarray(0, s)].every(
      (v, k) => Math.abs(v - (t.values[t.values.length - s + k] ?? 0)) < 1e-4,
    );
  });
const file = join(import.meta.dir, 'ranger.ts');
const cached = async (): Promise<void> => {
  clearNeuralSources();
  await provideRecipeNeural(file, ['ranger'], true);
};
const sizeOf = (lod: 0 | 1 | 2) => {
  const mesh = compile(ranger, { lod }).parts[0]?.mesh;
  if (!mesh) throw new Error('no body mesh');
  const b = boundsOf(mesh);
  return { mesh, b, height: b.max[2] - b.min[2] };
};

afterEach(() => clearNeuralSources());

describe('ranger, CPU tier (no neural cache)', () => {
  it(
    'builds a static mannequin: one untextured part, no skeleton, no clips, 1.78 m ± 2 %',
    () => {
      clearNeuralSources();
      for (const a of compileLods(ranger)) {
        expect(a.parts.map((p) => p.name)).toEqual([PART]);
        expect(a.parts[0]?.textures).toBeUndefined();
        expect(a.skeleton).toBeUndefined();
        expect(a.clips ?? []).toEqual([]);
      }
      expect(Math.abs(sizeOf(0).height - HEIGHT) / HEIGHT).toBeLessThan(0.02);
    },
    SLOW,
  );
});

describe('ranger, model tier (committed cache)', () => {
  it(
    'a missing cache is not mistaken for the model: the textured part appears only with it',
    async () => {
      clearNeuralSources();
      expect(compile(ranger, { lod: 2 }).parts[0]?.textures).toBeUndefined();
      await cached();
      const set = compile(ranger, { lod: 2 }).parts[0]?.textures;
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
    'stands 1.78 m ± 2 % on z = 0, one skinned textured part per LOD, inside the budget',
    async () => {
      await cached();
      for (const lod of [0, 1, 2] as const) {
        const a = compile(ranger, { lod });
        const { mesh, b, height } = sizeOf(lod);
        expect(Math.abs(height - HEIGHT) / HEIGHT).toBeLessThan(0.02);
        expect(Math.abs(b.min[2])).toBeLessThan(0.01);
        expect(a.parts).toHaveLength(1);
        expect(a.parts[0]?.textures?.name).toBeDefined();
        expect(mesh.joints?.length).toBe((mesh.positions.length / 3) * 4);
        const triangles = mesh.indices.length / 3;
        expect(triangles).toBeLessThanOrEqual(a.budget.triangles[lod]);
        // Not a decimated stub either: Blender was asked for TRIANGLES and lands within 1 %.
        expect(triangles).toBeGreaterThan(TRIANGLES[lod] * 0.99);
      }
    },
    SLOW,
  );

  it(
    'inside the model-tier band (30 000 / 10 000 / 6 000), where 39 000 / 11 800 was not',
    async () => {
      await cached();
      const band = [30000, 10000, 6000] as const;
      expect([39000, 11800].some((t, lod) => t > (band[lod] ?? 0))).toBe(true);
      for (const lod of [0, 1, 2] as const) {
        expect(compile(ranger, { lod }).budget.triangles[lod]).toBeLessThanOrEqual(band[lod]);
        expect(sizeOf(lod).mesh.indices.length / 3).toBeLessThanOrEqual(band[lod]);
      }
    },
    SLOW,
  );

  it(
    'the maps carry the paint: matt wool over waxed boots, mud on the feet',
    async () => {
      await cached();
      const part = compile(ranger, { lod: 0 }).parts[0];
      const [mesh, set] = [part?.mesh, part?.textures];
      if (!mesh || !set?.orm) throw new Error('no textured body');
      const sample = (png: Uint8Array, pick: (y: number, z: number) => boolean): number[][] => {
        const image = decodePng(png);
        const out: number[][] = [];
        for (let v = 0; v < mesh.positions.length / 3; v++) {
          if (!pick(mesh.positions[v * 3 + 1] ?? 0, mesh.positions[v * 3 + 2] ?? 0)) continue;
          const px = Math.min(image.width - 1, Math.floor((mesh.uvs[v * 2] ?? 0) * image.width));
          const py = Math.min(
            image.height - 1,
            Math.floor((mesh.uvs[v * 2 + 1] ?? 0) * image.height),
          );
          out.push([
            ...image.data.subarray((py * image.width + px) * 4, (py * image.width + px) * 4 + 3),
          ]);
        }
        return out;
      };
      const mean = (values: readonly number[]): number =>
        values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
      const legs = (lo: number, hi: number) => (y: number, z: number) =>
        Math.abs(y) < 0.3 && z > lo && z < hi;
      // Roughness (ORM green, 0..255): wool trousers against the boot shafts above the mud.
      const wool = mean(
        sample(set.orm, legs(BANDS.boot + 0.06, BANDS.hem - 0.14)).map((c) => c[1] ?? 0),
      );
      const boots = mean(sample(set.orm, legs(0.3, BANDS.boot - 0.06)).map((c) => c[1] ?? 0));
      expect(wool).toBeGreaterThan(0.9 * 255);
      expect(wool - boots).toBeGreaterThan(0.2 * 255);
      // Caked mud is paler than boot leather: the feet are lighter than the shafts.
      const value = (c: readonly number[]) => mean(c);
      const feet = mean(sample(set.albedo, legs(0.09, 0.14)).map(value));
      const shafts = mean(sample(set.albedo, legs(0.34, 0.42)).map(value));
      expect(feet).toBeGreaterThan(shafts * 1.15);
    },
    SLOW,
  );

  it(
    '≤ 64 bones at human landmark heights; clips idle, walk, jog on those bones',
    async () => {
      await cached();
      const a = compile(ranger, { lod: 2 });
      const bones = a.skeleton?.bones ?? [];
      expect(bones.length).toBeGreaterThan(15);
      expect(bones.length).toBeLessThanOrEqual(64);
      for (const l of LANDMARKS) {
        const z = bones.find((x) => x.name === l.bone)?.head[2] ?? Number.NaN;
        expect(Math.abs(z / HEIGHT - l.share) / l.share).toBeLessThanOrEqual(l.tolerance);
      }
      const clips = a.clips ?? [];
      expect(clips.map((c) => c.name)).toEqual(['idle', 'walk', 'jog']);
      const seconds = Object.fromEntries(clips.map((c) => [c.name, c.seconds]));
      // The rig service returned 4.0 s (closed), 4.1667 s and 0.7 s (each one frame short of its
      // period at 30 fps): importModel gives the two open cycles their closing key.
      expect(seconds['idle']).toBeCloseTo(4, 3);
      expect(seconds['walk']).toBeCloseTo(4.1667 + FRAME, 3);
      expect(seconds['jog']).toBeCloseTo(0.7 + FRAME, 3);
      for (const c of clips) expect([c.name, c.loop, closed(c)]).toEqual([c.name, true, true]);
      expect(bones.map((x) => x.name)).not.toContain('headfront');
      const names = new Set(bones.map((x) => x.name));
      for (const c of clips)
        for (const t of c.tracks) expect(names.has('bone' in t ? t.bone : '')).toBe(true);
    },
    SLOW,
  );

  it(
    'without its lift the idle puts a boot under the floor, and QA gait says by how much',
    async () => {
      await cached();
      const a = compile(ranger, { lod: 0 });
      const lowered = (a.clips ?? []).map((c) =>
        c.name !== 'idle'
          ? c
          : {
              ...c,
              tracks: c.tracks.map((t) =>
                'bone' in t && t.bone === 'hips' && t.path === 'translation'
                  ? { ...t, values: t.values.map((v, k) => (k % 3 === 2 ? v - LIFT.idle : v)) }
                  : t,
              ),
            },
      );
      const found = runQa({ ...a, clips: lowered }).filter((f) => f.gate === 'gait');
      expect(found.map((f) => f.code)).toContain('T3D_QA_GAIT');
      expect(found[0]?.message).toMatch(
        /clip 'idle' \(in place\): the skin of foot 'left_toe_base' sinks 5\.\d mm/,
      );
    },
    SLOW,
  );

  it(
    'passes QA on every LOD and builds the same bytes twice',
    async () => {
      await cached();
      for (const a of compileLods(ranger)) expect(runQa(a)).toEqual([]);
      const once = Bun.hash(toGlb(compile(ranger, { lod: 1 })));
      expect(Bun.hash(toGlb(compile(ranger, { lod: 1 })))).toBe(once);
    },
    SLOW,
  );
});
