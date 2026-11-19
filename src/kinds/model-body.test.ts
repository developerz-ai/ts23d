import { describe, expect, it } from 'bun:test';
import { compile, type Mesh, Ts23dError } from '../core/index.ts';
import { applySimilarity, triBvh, yawSimilarity } from '../primitives/index.ts';
import { creaturePlan } from './creature.ts';
import { meshVolume } from './model-body.ts';
import { defineModelCreature } from './model-creature.ts';
import { applyFit } from './model-fit.ts';
import { capsuleCreature, FIXTURE_WOLF, fixtureModel } from './model-fixtures.ts';
import { modelRig } from './model-rig.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
// The "model": the plan's flesh, turned 60° and half as big again, as generators return it.
const turned: Mesh = applyFit(capsuleCreature(bones), {
  ...yawSimilarity(60),
  s: 1.5,
  t: [1, 2, 0],
});
const budget = { triangles: [150000, 40000, 8000], textureSets: { count: 1, size: 1024 } } as const;

const asset = (model: ReturnType<typeof fixtureModel> | null, name: string) =>
  defineModelCreature({ name, spec: FIXTURE_WOLF, budget, model: () => model });

describe('modelBody / defineModelCreature', () => {
  it('refuses a model without a texture set', () => {
    const { textures: _none, ...bare } = fixtureModel(turned);
    const a = asset(bare, 'model_bare');
    expect(() => compile(a, { lod: 2 })).toThrow(Ts23dError);
    expect(() => compile(a, { lod: 2 })).toThrow(/T3D_MODEL_FIT/);
  });

  it('refuses a model that is not the planned animal (a ball)', () => {
    const P = Float32Array.from(turned.positions);
    for (let i = 0; i < P.length; i += 3) {
      const l = Math.hypot(P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0) || 1;
      for (let k = 0; k < 3; k++) P[i + k] = (P[i + k] ?? 0) / l;
    }
    const a = asset(fixtureModel({ ...turned, positions: P }), 'model_ball');
    expect(() => compile(a, { lod: 2 })).toThrow(/T3D_MODEL_(FIT|SKELETON)/);
  });

  it('emits one textured skinned part on the fitted skeleton, with the sourced mass', () => {
    const c = compile(asset(fixtureModel(turned), 'model_wolf'), { lod: 2 });
    const body = c.parts.filter((p) => p.mesh);
    expect(body.map((p) => p.name)).toEqual(['body_fur']);
    const part = body[0];
    expect(part?.textures?.name).toBe('body');
    expect(part?.mesh?.joints?.length).toBe(((part?.mesh?.positions.length ?? 0) / 3) * 4);
    expect((part?.density ?? 0) * meshVolume(part?.mesh as Mesh)).toBeCloseTo(FIXTURE_WOLF.mass, 6);
    expect(c.skeleton?.bones.some((b) => b.name === 'jaw')).toBe(false);
    expect(c.clips?.map((x) => x.name)).toEqual(['idle', 'look', 'walk', 'trot', 'gallop']);
    // Registered: +X is the front again (the head bone points forward), feet on the ground.
    const head = c.skeleton?.bones.find((b) => b.name === 'head');
    expect((head?.tail[0] ?? 0) - (head?.head[0] ?? 0)).toBeGreaterThan(0.1);
    let low = Infinity;
    const P = part?.mesh?.positions ?? new Float32Array();
    for (let i = 2; i < P.length; i += 3) low = Math.min(low, P[i] ?? 0);
    expect(Math.abs(low)).toBeLessThan(1e-4);
    expect(applySimilarity(yawSimilarity(0), [1, 0, 0])[0]).toBe(1);
  });

  it('declares the model_surface crease on the part a skinned body emits (not body_*)', () => {
    const a = defineModelCreature({
      name: 'model_skin',
      spec: { ...FIXTURE_WOLF, surface: 'skin' },
      budget,
      model: () => fixtureModel(turned),
    });
    const c = compile(a, { lod: 2 });
    const part = c.parts.find((p) => p.textures)?.name;
    expect(part).toBe('body');
    expect(c.creases?.find((x) => x.name === 'model_surface')?.part).toBe(part);
  }, 60_000);

  it('does not declare model_surface on the code creature (it would excuse its seams)', () => {
    const a = defineModelCreature({
      name: 'model_skin_miss',
      spec: { ...FIXTURE_WOLF, surface: 'skin' },
      budget,
      model: () => null,
    });
    const c = compile(a, { lod: 2 });
    expect(c.parts.map((p) => p.name)).toContain('body');
    expect(c.creases?.some((x) => x.name === 'model_surface')).toBe(false);
  });

  it('one-pass symmetric: emits the mirrored mesh the skeleton was fitted into', () => {
    // A profile model: the far (right) legs are missing; the fit mirrors the left half.
    const lopsided = capsuleCreature(bones, (k) => !(k.a[1] < -0.01 && k.b[2] < 0.5));
    const a = defineModelCreature({
      name: 'model_symmetric',
      spec: FIXTURE_WOLF,
      budget,
      model: () => fixtureModel(lopsided),
      body: { symmetric: '+' },
    });
    const c = compile(a, { lod: 0 });
    const mesh = c.parts.find((p) => p.textures)?.mesh;
    if (!mesh) throw new Error('no model body');
    const bvh = triBvh(mesh);
    const legs = c.skeleton?.bones.filter((b) => /^(fore|hind)_[lr]_\d$/.test(b.name)) ?? [];
    expect(legs.length).toBe(16);
    for (const b of legs) {
      const mid = [0, 1, 2].map((k) => ((b.head[k] ?? 0) + (b.tail[k] ?? 0)) / 2);
      expect([b.name, bvh.winding(mid as [number, number, number]) > 0.5]).toEqual([b.name, true]);
    }
  }, 60_000);

  it('falls back to the code creature, with its clips, when there is no model', () => {
    const a = asset(null, 'model_miss');
    const c = compile(a, { lod: 2 });
    expect(c.parts.some((p) => p.textures)).toBe(false);
    expect(c.parts.map((p) => p.name)).toContain('body');
    expect(c.clips?.map((x) => x.name)).toContain('bite');
  });

  it('rewrites the clips on every compile (model, then miss, then model)', () => {
    let on = true;
    const a = defineModelCreature({
      name: 'model_flip',
      spec: FIXTURE_WOLF,
      budget,
      model: () => (on ? fixtureModel(turned) : null),
    });
    const names = (): string[] => compile(a, { lod: 2 }).clips?.map((x) => x.name) ?? [];
    expect(names()).not.toContain('bite');
    on = false;
    expect(names()).toContain('bite');
    on = true;
    expect(names()).not.toContain('bite');
  });

  it("uses the Blender output's own skin when it is bound to the fitted bones, and refuses a stale one", () => {
    const flesh = capsuleCreature(bones);
    const rig = modelRig(flesh, FIXTURE_WOLF);
    const real = rig.bones.filter((b) => !b.name.endsWith('_mid'));
    const n = flesh.positions.length / 3;
    const weights = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) weights[v * 4] = 1;
    // Everything on the LAST real bone of the import's own order (reversed against the rig's).
    const bound: Mesh = { ...rig.mesh, joints: new Uint16Array(n * 4), weights };
    const model = (shift: number) => ({
      ...fixtureModel(bound),
      armature: {
        bones: [...real].reverse().map((b) => ({
          ...b,
          head: [b.head[0] + shift, b.head[1], b.head[2]] as [number, number, number],
        })),
      },
    });
    const make = (name: string, shift: number) =>
      defineModelCreature({
        name,
        spec: FIXTURE_WOLF,
        budget,
        model: () => ({ model: model(shift), rig }),
      });
    const c = compile(make('model_own_skin', 0), { lod: 2 });
    const part = c.parts.find((p) => p.textures);
    const last = real[real.length - 1]?.name;
    expect(c.skeleton?.bones[part?.mesh?.joints?.[0] ?? -1]?.name).toBe(last);
    expect(() => compile(make('model_stale_skin', 0.01), { lod: 2 })).toThrow(
      /T3D_MODEL_SKELETON.*another fit/,
    );
  });
});
