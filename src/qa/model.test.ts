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
import { albedoSpread, GROUND, model, TEXTURE_STD } from './model.ts';
import { FIT_SPAN, FIT_TURN, hugTurn, skeletonHug, skeletonSpan } from './model-hug.ts';

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
    // A turned copy of this skeleton fits the mesh better than the skeleton as it stands.
    expect(hugTurn(part?.mesh as Mesh, [0, 0, 0], a.skeleton ?? { bones: [] })).toBeGreaterThan(1);
    expect(
      hugTurn(table(), [0, 0, 0], asset({ name: 'square' }).skeleton ?? { bones: [] }),
    ).toBeLessThan(FIT_TURN);
  });

  it('fails a skeleton shrunk inside its body: every joint inside, no turn fits better, wrong scale', () => {
    const half = compile(
      defineAsset({
        name: 'shrunk',
        kind: 'creature',
        budget: { triangles: [500, 500, 500], textureSets: { count: 1, size: 1024 } },
        build(ctx) {
          // The table's skeleton at 40 % about the trunk's middle: it lies inside the trunk box.
          const k = (p: Vec3): Vec3 => [p[0] * 0.4, p[1] * 0.4, 0.45 + (p[2] - 0.45) * 0.08];
          for (const [name, b] of BONES) ctx.bone(name, { ...b, head: k(b.head), tail: k(b.tail) });
          ctx.part('body_fur', table(), {
            density: 100,
            textures: { name: 'body', albedo: albedo(null) },
          });
        },
      }),
    );
    const sk = half.skeleton ?? { bones: [] };
    expect(skeletonSpan(table(), sk)).toBeLessThan(FIT_SPAN);
    expect(model(half).some((f) => /not at one scale/.test(f.message))).toBe(true);
    expect(
      skeletonSpan(table(), asset({ name: 'whole' }).skeleton ?? { bones: [] }),
    ).toBeGreaterThan(FIT_SPAN);
  });

  it('reads the same hug however densely one region is tessellated (area, not vertices)', () => {
    const plain = table();
    // One leg's triangles split in four at their edge midpoints, twice: 16× the triangles and
    // many more vertices there, the same surface. A vertex median (or an unweighted triangle
    // median) moves toward that leg; the area median may not.
    const split = (m: Mesh, pick: (c: Vec3) => boolean): Mesh => {
      const P = [...m.positions];
      const N = [...m.normals];
      const U = [...m.uvs];
      const C = [...m.colors];
      const J = [...(m.joints ?? [])];
      const W = [...(m.weights ?? [])];
      const I: number[] = [];
      const mid = (a: number, b: number): number => {
        const v = P.length / 3;
        for (let k = 0; k < 3; k++) P.push(((P[a * 3 + k] ?? 0) + (P[b * 3 + k] ?? 0)) / 2);
        for (let k = 0; k < 3; k++) N.push(N[a * 3 + k] ?? 0);
        for (let k = 0; k < 2; k++) U.push(((U[a * 2 + k] ?? 0) + (U[b * 2 + k] ?? 0)) / 2);
        const cs = C.length / (m.positions.length / 3) || 3;
        for (let k = 0; k < cs; k++) C.push(1);
        for (let k = 0; k < 4; k++) J.push(J[a * 4 + k] ?? 0);
        for (let k = 0; k < 4; k++) W.push(W[a * 4 + k] ?? 0);
        return v;
      };
      for (let t = 0; t < m.indices.length; t += 3) {
        const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
        const centre = [0, 1, 2].map(
          (k) => ((P[a * 3 + k] ?? 0) + (P[b * 3 + k] ?? 0) + (P[c * 3 + k] ?? 0)) / 3,
        ) as [number, number, number];
        if (!pick(centre)) {
          I.push(a, b, c);
          continue;
        }
        const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)];
        I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      }
      return {
        ...m,
        positions: Float32Array.from(P),
        normals: Float32Array.from(N),
        uvs: Float32Array.from(U),
        colors: Float32Array.from(C),
        indices: Uint32Array.from(I),
        ...(m.joints ? { joints: Uint16Array.from(J), weights: Float32Array.from(W) } : {}),
      };
    };
    const leg = (c: Vec3): boolean => c[0] > 0.3 && c[1] > 0 && c[2] < 0.35;
    const dense = split(split(plain, leg), leg);
    expect(dense.indices.length).toBeGreaterThan(plain.indices.length * 2);
    const sk = asset({ name: 'good' }).skeleton ?? { bones: [] };
    const hug = skeletonHug(plain, [0, 0, 0], sk);
    // Centroid samples move within a triangle when it is split: equal to a part in a hundred.
    expect(Math.abs(skeletonHug(dense, [0, 0, 0], sk) - hug)).toBeLessThan(hug * 0.01);
  });

  it('fails feet that do not reach the ground', () => {
    const f = model(asset({ name: 'lifted', mesh: table(GROUND * 3) }));
    const ground = f.filter((x) => /ground/.test(x.message));
    expect(ground.length).toBe(4);
    expect(ground.every((x) => x.code === 'T3D_MODEL_FIT' && /z = 0/.test(x.fix))).toBe(true);
  });

  it('one paw 3 cm in the air is caught by ITS foot, though the next paw 14 cm away is down', () => {
    const one = merge([
      box({ size: [1, 0.18, 0.08], at: [0, 0, 0.41], color: [1, 1, 1] }),
      ...FEET.map((f, i) =>
        box({ size: [0.05, 0.05, 0.43], at: [f[0], f[1], i === 0 ? 0.03 : 0], color: [1, 1, 1] }),
      ),
    ]);
    const uvs = Float32Array.from(one.uvs, (_, i) => (i * 0.618034) % 1);
    const mesh = bindRigid({ ...one, uvs, colors: new Float32Array(one.colors.length).fill(1) }, 0);
    const ground = model(asset({ name: 'one_up', mesh })).filter((x) => /ground/.test(x.message));
    expect(ground.map((x) => /'(leg_\d)'/.exec(x.message)?.[1])).toEqual(['leg_0']);
  });

  it('judges a body under a moved parent where it stands in the world, not at its own pivot', () => {
    const under = (lift: number): CompiledAsset =>
      compile(
        defineAsset({
          name: 'nested',
          kind: 'creature',
          budget: { triangles: [500, 500, 500], textureSets: { count: 1, size: 1024 } },
          build(ctx) {
            for (const [name, b] of BONES) ctx.bone(name, b);
            // The parent sits 2 m up; the body's mesh is authored 2 m down (plus `lift`).
            ctx.group('rig', { at: [0, 0, 2] });
            ctx.part('body_fur', table(lift - 2), {
              parent: 'rig',
              density: 100,
              textures: { name: 'body', albedo: albedo(null) },
            });
          },
        }),
      );
    expect(model(under(0))).toEqual([]);
    expect(codes(under(GROUND * 3))).toContain('T3D_MODEL_FIT');
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
