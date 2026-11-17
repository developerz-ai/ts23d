import { describe, expect, it } from 'bun:test';
import {
  type BoneOptions,
  type CompiledAsset,
  compile,
  defineAsset,
  encodePng,
  type Mesh,
  merge,
  type Vec3,
} from '../core/index.ts';
import { bindRigid } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { DEFAULT_GATES } from './gates.ts';
import { albedoSpread, FIT_MEDIAN, GROUND, model, skeletonHug, TEXTURE_STD } from './model.ts';

/** A 16 × 16 albedo: every texel `grey`, or value noise. */
function albedo(grey: number | null): Uint8Array {
  const px = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    const v = grey ?? (i * 97) % 256;
    px.set([v, v, v, 255], i * 4);
  }
  return encodePng(16, 16, px);
}

const FEET: readonly Vec3[] = [
  [0.4, 0.07, 0],
  [0.4, -0.07, 0],
  [-0.4, 0.07, 0],
  [-0.4, -0.07, 0],
];

/** A table-shaped "animal": a slim trunk box on four leg boxes (half its surface within 10 % of
 *  the skeleton's height of a bone), UVs spread over the whole map. */
function table(lift = 0): Mesh {
  const m = merge([
    box({ size: [1, 0.18, 0.08], at: [0, 0, 0.41 + lift], color: [1, 1, 1] }),
    ...FEET.map((f) => box({ size: [0.05, 0.05, 0.43], at: [f[0], f[1], lift], color: [1, 1, 1] })),
  ]);
  const uvs = Float32Array.from(m.uvs, (_, i) => (i * 0.618034) % 1);
  return bindRigid({ ...m, uvs, colors: new Float32Array(m.colors.length).fill(1) }, 0);
}

const BONES: readonly (readonly [string, BoneOptions])[] = [
  ['spine', { head: [-0.45, 0, 0.45], tail: [0.45, 0, 0.45] }],
  ...FEET.map((f, i): [string, BoneOptions] => [
    `leg_${i}`,
    { parent: 'spine', head: [f[0], f[1], 0.4], tail: [f[0], f[1], 0.01] },
  ]),
];

function asset(o: { png?: Uint8Array; mesh?: Mesh; turn?: boolean; name: string }): CompiledAsset {
  return compile(
    defineAsset({
      name: o.name,
      kind: 'creature',
      budget: { triangles: [500, 500, 500], textureSets: { count: 1, size: 1024 } },
      build(ctx) {
        for (const [name, b] of BONES) {
          const q = (p: Vec3): Vec3 => (o.turn ? [-p[1], p[0], p[2]] : p);
          ctx.bone(name, { ...b, head: q(b.head), tail: q(b.tail) });
        }
        ctx.part('body_fur', o.mesh ?? table(), {
          density: 100,
          textures: { name: 'body', albedo: o.png ?? albedo(null) },
        });
      },
    }),
  );
}

const codes = (a: CompiledAsset): string[] => model(a).map((f) => f.code);

describe('QA model', () => {
  it('fails a blank albedo with T3D_MODEL_TEXTURE and a fix', () => {
    const f = model(asset({ name: 'blank', png: albedo(128) }));
    expect(f.map((x) => x.code)).toEqual(['T3D_MODEL_TEXTURE']);
    expect(f[0]?.fix).toMatch(/bake/);
    expect(albedoSpread(albedo(128), table())).toBe(0);
    expect(albedoSpread(albedo(null), table())).toBeGreaterThan(TEXTURE_STD * 5);
  });

  it('fails a black bake with a little noise (std under the limit)', () => {
    const px = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 256; i++) px.set([i % 5, i % 5, i % 5, 255], i * 4);
    expect(codes(asset({ name: 'black', png: encodePng(16, 16, px) }))).toEqual([
      'T3D_MODEL_TEXTURE',
    ]);
  });

  it('fails joints outside the mesh and a skeleton a quarter turn off the surface', () => {
    const a = asset({ name: 'turned', turn: true });
    expect(codes(a)).toContain('T3D_MODEL_SKELETON');
    expect(codes(a)).toContain('T3D_MODEL_FIT');
    const part = a.parts[0];
    const hug = skeletonHug(part?.mesh as Mesh, [0, 0, 0], a.skeleton ?? { bones: [] });
    expect(hug).toBeGreaterThan(FIT_MEDIAN);
  });

  it('reads the same hug however densely one region is tessellated (area, not vertices)', () => {
    const plain = table();
    // 600 more vertices on one leg tip, in zero-area triangles: a decimation that keeps detail
    // on the paws moves a vertex median, never the surface.
    const n = plain.positions.length / 3;
    const dense: Mesh = {
      ...plain,
      positions: Float32Array.from([
        ...plain.positions,
        ...Array.from({ length: 600 }, () => [0.4, 0.07, 0]).flat(),
      ]),
      normals: Float32Array.from([
        ...plain.normals,
        ...Array.from({ length: 600 }, () => [0, 0, -1]).flat(),
      ]),
      indices: Uint32Array.from([
        ...plain.indices,
        ...Array.from({ length: 600 }, (_, i) => n + i),
      ]),
    };
    const sk = asset({ name: 'good' }).skeleton ?? { bones: [] };
    const hug = skeletonHug(plain, [0, 0, 0], sk);
    expect(hug).toBeLessThan(FIT_MEDIAN);
    expect(skeletonHug(dense, [0, 0, 0], sk)).toBeCloseTo(hug, 9);
  });

  it('fails feet that do not reach the ground', () => {
    const f = model(asset({ name: 'lifted', mesh: table(GROUND * 3) }));
    const ground = f.filter((x) => /ground/.test(x.message));
    expect(ground.length).toBe(4);
    expect(ground.every((x) => x.code === 'T3D_MODEL_FIT' && /z = 0/.test(x.fix))).toBe(true);
  });

  it('passes a textured body on its skeleton, and leaves untextured assets alone', () => {
    expect(model(asset({ name: 'good' }))).toEqual([]);
    const plain = compile(
      defineAsset({
        name: 'plain',
        kind: 'prop',
        budget: { triangles: [100, 100, 100] },
        build: (ctx) => ctx.part('crate', box({ size: [1, 1, 1], color: [1, 1, 1] })),
      }),
    );
    expect(model(plain)).toEqual([]);
  });

  it('fails a two-headed body (mirrored across a plane that misses the head) and passes one head', () => {
    const headBone: BoneOptions = { parent: 'spine', head: [0.45, 0, 0.5], tail: [0.75, 0, 0.5] };
    const withHead = (heads: readonly number[], name: string): CompiledAsset =>
      compile(
        defineAsset({
          name,
          kind: 'creature',
          budget: { triangles: [900, 900, 900], textureSets: { count: 1, size: 1024 } },
          build(ctx) {
            for (const [bone, b] of BONES) ctx.bone(bone, b);
            ctx.bone('head', headBone);
            const muzzles = heads.map((y) =>
              box({ size: [0.36, 0.1, 0.1], at: [0.62, y, 0.45], color: [1, 1, 1] }),
            );
            const m = merge([table(), ...muzzles.map((x) => bindRigid(x, 0))]);
            const uvs = Float32Array.from(m.uvs, (_, i) => (i * 0.618034) % 1);
            ctx.part(
              'body_fur',
              { ...m, uvs },
              {
                density: 100,
                textures: { name: 'body', albedo: albedo(null) },
              },
            );
          },
        }),
      );
    const two = model(withHead([0.08, -0.08], 'two_heads')).filter(
      (f) => f.code === 'T3D_MODEL_DOUBLED',
    );
    expect(two.length).toBe(1);
    expect(two[0]?.message).toMatch(/the head/);
    expect(two[0]?.fix).toMatch(/repose|side profile/);
    expect(codes(withHead([0], 'one_head'))).not.toContain('T3D_MODEL_DOUBLED');
  });

  it('fails a fifth leg (a far-side limb left on the mirror plane)', () => {
    const extra = merge([
      table(),
      bindRigid(box({ size: [0.05, 0.05, 0.32], at: [0.4, 0, 0], color: [1, 1, 1] }), 0),
    ]);
    const uvs = Float32Array.from(extra.uvs, (_, i) => (i * 0.618034) % 1);
    const f = model(asset({ name: 'five_legs', mesh: { ...extra, uvs } })).filter(
      (x) => x.code === 'T3D_MODEL_DOUBLED',
    );
    expect(f.length).toBe(1);
    expect(f[0]?.message).toMatch(/legs.*6 separate|legs.*5 separate/);
  });

  it('is in the default gate table', () => {
    expect(DEFAULT_GATES).toContain(model);
  });
});
