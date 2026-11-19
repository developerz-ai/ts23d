// The model-tier dragon's contract. Without the cache it is a code-built wingless quadruped of
// the creature kind (several trim-sheet parts, no texture set). With the committed cache: one
// skinned textured body on every LOD inside the triangle budget, the design spec's shoulder
// height, head-and-body length and tail length, ≤ 64 bones with three a wing (wings.ts), clips
// idle / look / walk / flap (trot and gallop dropped, bite and blink impossible on a fused head),
// wing tips that travel in the flap with the membrane whole, QA PASS on every LOD and the same
// bytes twice. No test calls a model or Blender: the cache is read from disk.

import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  clearNeuralSources,
  compile,
  decodePng,
  inverseBind,
  neuralCache,
  poseJoints,
  provideNeural,
  type Quat,
  runQa,
  STRETCH_TOLERANCE,
  skinPositions,
  toGlb,
} from '@developerz.ai/ts23d';
import { compileLods } from '@developerz.ai/ts23d/testing';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { BOX, dragon_hybrid, measured, SOURCED } from './dragon_hybrid.ts';
import { TRIANGLES, WING_SCALE } from './steps.ts';
import { DROPPED } from './surface.ts';
import { FLAP } from './wings.ts';

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
    "the wings are the generator's × 1.25: a 3.4 m V where 2.8 m was drawn",
    async () => {
      await cached();
      const P = textured(0)[0]?.mesh?.positions ?? new Float32Array();
      let [left, right, top] = [0, 0, 0];
      for (let i = 0; i < P.length; i += 3) {
        left = Math.max(left, P[i + 1] ?? 0);
        right = Math.min(right, P[i + 1] ?? 0);
        top = Math.max(top, P[i + 2] ?? 0);
      }
      // The generator's V was 2.8 m wide and 3.3 m high: neither fits the scaled box's ± 5 %.
      expect(2.8).toBeLessThan(BOX.width * 0.95);
      expect(3.3).toBeLessThan(BOX.height * 0.95);
      expect(WING_SCALE).toBe(1.25);
      expect(Math.abs(left - right - BOX.width) / BOX.width).toBeLessThan(0.05);
      expect(Math.abs(top - BOX.height) / BOX.height).toBeLessThan(0.05);
    },
    SLOW,
  );

  it(
    'the maps carry the paint: dust on the feet, a roughness that varies',
    async () => {
      await cached();
      const body = textured(0)[0];
      const [mesh, set] = [body?.mesh, body?.textures];
      if (!mesh || !set?.orm) throw new Error('no textured body');
      const sample = (png: Uint8Array, pick: (z: number) => boolean): number[][] => {
        const image = decodePng(png);
        const out: number[][] = [];
        for (let v = 0; v < mesh.positions.length / 3; v++) {
          if (!pick(mesh.positions[v * 3 + 2] ?? 0)) continue;
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
      // Pale dust over red hide: the feet's green channel rises against the legs above them.
      const green = (z0: number, z1: number) =>
        mean(
          sample(set.albedo, (z) => z > z0 && z < z1).map(
            (c) => (c[1] ?? 0) / Math.max(c[0] ?? 1, 1),
          ),
        );
      expect(green(0.02, 0.1)).toBeGreaterThan(green(0.5, 0.8) * 1.2);
      // One flat roughness (the bake's 0.8 = 204) has no spread; scales, plates, horn and dust do.
      const rough = sample(set.orm, () => true).map((c) => c[1] ?? 0);
      const avg = mean(rough);
      const spread = Math.sqrt(mean(rough.map((r) => (r - avg) ** 2)));
      expect(Math.sqrt(mean([204, 204].map((r) => (r - 204) ** 2)))).toBe(0);
      expect(spread).toBeGreaterThan(12);
    },
    SLOW,
  );

  it(
    '≤ 64 bones, the plan’s and three a wing; clips idle, look, walk, flap; trot, gallop, bite and blink absent',
    async () => {
      await cached();
      const a = compile(dragon_hybrid, { lod: 2 });
      const names = new Set((a.skeleton?.bones ?? []).map((b) => b.name));
      expect(names.size).toBeGreaterThan(20);
      expect(names.size).toBeLessThanOrEqual(64);
      for (const n of ['head', 'neck_0', 'spine_0', 'fore_l_3', 'hind_r_3', 'tail_4'])
        expect(names.has(n)).toBe(true);
      const clips = (a.clips ?? []).map((c) => c.name);
      for (const c of ['idle', 'look', 'walk', 'flap']) expect(clips).toContain(c);
      for (const c of [...DROPPED, 'bite', 'blink']) expect(clips).not.toContain(c);
      // The rigger gives no wing bones: wings.ts finds three a side, hung from the withers.
      const wings = (a.skeleton?.bones ?? []).filter((b) => b.name.startsWith('wing_'));
      expect(wings.map((b) => b.name)).toEqual(
        ['l', 'r'].flatMap((s) => [0, 1, 2].map((i) => `wing_${s}_${i}`)),
      );
      expect(wings[0]?.parent).toBe('spine_2');
      wings.forEach((b, i) => {
        const [min, max] = FLAP.limits[i % 3] ?? [0, 0];
        expect([b.limit?.min, b.limit?.max]).toEqual([min, max]);
        // Left and right are mirror images after the repose.
        const twin = wings[(i + 3) % 6];
        expect(b.head[1]).toBeCloseTo(-(twin?.head[1] ?? 0), 5);
        expect(b.head[2]).toBeCloseTo(twin?.head[2] ?? 0, 5);
      });
      // Idle and the walk carry the wings; look leaves them alone.
      const keyed = (clip: string): boolean =>
        (a.clips?.find((c) => c.name === clip)?.tracks ?? []).some(
          (t) => 'bone' in t && t.bone.startsWith('wing_'),
        );
      expect([keyed('idle'), keyed('walk'), keyed('look')]).toEqual([true, true, false]);
      for (const c of a.clips ?? [])
        for (const t of c.tracks) if ('bone' in t) expect(names.has(t.bone)).toBe(true);
    },
    SLOW,
  );

  it(
    'flap: each wing tip travels over 1.5 m and the membrane stays whole',
    async () => {
      await cached();
      const a = compile(dragon_hybrid, { lod: 1 });
      const [sk, mesh] = [a.skeleton, textured(1)[0]?.mesh];
      const flap = a.clips?.find((c) => c.name === 'flap');
      if (!sk || !mesh?.joints || !mesh.weights || !flap) throw new Error('no skinned flap');
      expect(flap.seconds).toBeCloseTo(1 / FLAP.hz, 6);
      const [J, W, R, T] = [mesh.joints, mesh.weights, mesh.positions, mesh.indices];
      const wingBone = sk.bones.map((b) => b.name.startsWith('wing_'));
      const n = R.length / 3;
      // A vertex is wing when the wing bones carry it; the tips are the farthest out each side.
      const onWing = (v: number): number =>
        [0, 1, 2, 3].reduce(
          (s, k) => s + (wingBone[J[v * 4 + k] ?? 0] ? (W[v * 4 + k] ?? 0) : 0),
          0,
        );
      let [left, right] = [0, 0];
      for (let v = 0; v < n; v++) {
        if ((R[v * 3 + 1] ?? 0) > (R[left * 3 + 1] ?? 0)) left = v;
        if ((R[v * 3 + 1] ?? 0) < (R[right * 3 + 1] ?? 0)) right = v;
      }
      expect(onWing(left)).toBeGreaterThan(0.99);
      expect(onWing(right)).toBeGreaterThan(0.99);
      const ibm = inverseBind(sk);
      const keys = flap.tracks[0]?.times.length ?? 0;
      const dist = (P: ArrayLike<number>, p: number, Q: ArrayLike<number>, q: number): number =>
        Math.hypot(
          (P[p * 3] ?? 0) - (Q[q * 3] ?? 0),
          (P[p * 3 + 1] ?? 0) - (Q[q * 3 + 1] ?? 0),
          (P[p * 3 + 2] ?? 0) - (Q[q * 3 + 2] ?? 0),
        );
      const poses = Array.from({ length: keys }, (_, k) => {
        const rotation = new Map<string, Quat>();
        for (const t of flap.tracks)
          if ('bone' in t && t.path === 'rotation') {
            const [x = 0, y = 0, z = 0, w = 1] = t.values.subarray(k * 4, k * 4 + 4);
            rotation.set(t.bone, [x, y, z, w]);
          }
        return skinPositions(mesh, poseJoints(sk, rotation), ibm);
      });
      // Travel: the widest two places a tip is in over the beat.
      const travel = (v: number): number =>
        Math.max(...poses.flatMap((P) => poses.map((Q) => dist(P, v, Q, v))));
      // Measured 1.95 m and 1.90 m on wings 2.9 m long; half the length is the least a flap is.
      expect(travel(left)).toBeGreaterThan(1.5);
      expect(travel(right)).toBeGreaterThan(1.5);
      // The beat is symmetric (the two wings' own surfaces are not: nothing is mirrored).
      expect(Math.abs(travel(left) / travel(right) - 1)).toBeLessThan(0.1);
      // The membrane: every edge of a triangle the wing bones move, posed ÷ rest, over the whole
      // beat. QA `deform` allows ×4 at the 99th percentile; the worst edge here is ×1.26.
      let worst = 1;
      for (let t = 0; t < T.length; t += 3) {
        const tri = [T[t] ?? 0, T[t + 1] ?? 0, T[t + 2] ?? 0] as const;
        if (!tri.some((v) => onWing(v) > 0.02)) continue;
        for (const [p, q] of [
          [tri[0], tri[1]],
          [tri[1], tri[2]],
          [tri[2], tri[0]],
        ] as const) {
          const rest = dist(R, p, R, q);
          if (rest < 1e-4) continue;
          for (const P of poses) worst = Math.max(worst, dist(P, p, P, q) / rest);
        }
      }
      expect(STRETCH_TOLERANCE.default).toBe(4);
      expect(worst).toBeLessThan(2);
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
