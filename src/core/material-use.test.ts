import { expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { definePart } from './define-part.ts';
import { Ts23dError } from './errors.ts';
import {
  type MappedMaterial,
  mappedOf,
  materialsInUse,
  noteMaterial,
  trackMaterials,
  withMapped,
} from './material-use.ts';
import { type Mesh, merge, translate } from './mesh.ts';
import { place } from './transform.ts';

const budget = { triangles: [100, 100, 100] as const };
const asset = (name: string, build: Parameters<typeof defineAsset>[0]['build']) =>
  defineAsset({ name, kind: 'prop', budget, build });

function thrown(fn: () => unknown): Ts23dError {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('did not throw');
}

it('fails: two materials on one row in ONE compile is a coded conflict naming both and the rows held', () => {
  const clash = asset('clash', () => {
    noteMaterial({ id: 'granite', row: 4 });
    noteMaterial({ id: 'moss_wet', row: 2 });
    noteMaterial({ id: 'scales', row: 4 });
  });
  const e = thrown(() => compile(clash));
  expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
  expect(e.message).toContain("asset 'clash'");
  expect(e.message).toContain("'granite' and 'scales'");
  expect(e.fix).toContain('2 moss_wet, 4 granite');
  // A failed compile leaves no scope open: the next note is outside every compile.
  expect(materialsInUse()).toBeUndefined();
  expect(() => noteMaterial({ id: 'anything', row: 4 })).not.toThrow();
});

it('records what each compile mapped onto, per asset: another asset may hold the same row', () => {
  const a = asset('rock', () => noteMaterial({ id: 'granite', row: 4 }));
  const b = asset('snake', () => {
    noteMaterial({ id: 'scales', row: 4 });
    noteMaterial({ id: 'belly', row: 1 });
    noteMaterial({ id: 'scales', row: 4 });
  });
  expect(compile(a).materials).toEqual([{ id: 'granite', row: 4 }]);
  expect(compile(b).materials).toEqual([
    { id: 'belly', row: 1 },
    { id: 'scales', row: 4 },
  ]);
  expect(compile(a).materials).toEqual([{ id: 'granite', row: 4 }]);
  expect('materials' in compile(asset('bare', () => {}))).toBe(false);
});

it('a used child gives its materials to the parent, and a clash between children fails the parent', () => {
  const rock = asset('rock', () => noteMaterial({ id: 'granite', row: 4 }));
  const snake = asset('snake', () => noteMaterial({ id: 'scales', row: 4 }));
  const tree = asset('tree', () => noteMaterial({ id: 'bark_wet', row: 7 }));
  const scene = asset('scene', (ctx) => {
    ctx.use(rock, { prefix: 'rock' });
    ctx.use(tree, { prefix: 'tree' });
  });
  expect(compile(scene).materials?.map((u) => u.id)).toEqual(['granite', 'bark_wet']);
  for (const order of [
    [rock, snake],
    [snake, rock],
  ]) {
    const both = asset('both', (ctx) => {
      order.forEach((c, i) => {
        ctx.use(c, { prefix: `c${i}` });
      });
    });
    const e = thrown(() => compile(both));
    expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
    expect(e.message).toContain("asset 'both'");
    expect(e.fix).toContain('ctx.use');
  }
});

it('a cached definePart notes its materials again on every hit', () => {
  const bolt = definePart({
    name: 'use_bolt',
    description: 'test',
    params: { r: 1 },
    build: () => {
      noteMaterial({ id: 'zinc', row: 9 });
      return merge([]);
    },
  });
  const a = asset('first', (ctx) => bolt(ctx, 'bolt'));
  const b = asset('second', (ctx) => bolt(ctx, 'bolt'));
  expect(compile(a).materials).toEqual([{ id: 'zinc', row: 9 }]);
  expect(compile(b).materials).toEqual([{ id: 'zinc', row: 9 }]);
  expect(bolt.stats()).toEqual({ builds: 1, hits: 1 });
});

it('hands a closed scope to the one around it only when the build succeeded', () => {
  const outer = trackMaterials('outer', () => {
    trackMaterials('inner', () => noteMaterial({ id: 'kept', row: 0 }));
    expect(() =>
      trackMaterials('broken', () => {
        noteMaterial({ id: 'dropped', row: 1 });
        throw new Error('build failed');
      }),
    ).toThrow('build failed');
  });
  expect(outer.uses).toEqual([{ id: 'kept', row: 0 }]);
});

// D354: a mesh carries the materials its UVs were mapped onto, and the compile that USES it
// records them, wherever the mesh was built.
const BAND = { v0: 0.75, v1: 0.765625 };
const use = (id: string, row: number): MappedMaterial => ({ id, row, ...BAND });
/** One triangle whose UVs lie at V = `v`. */
const tri = (v: number): Mesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
  normals: new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0]),
  uvs: new Float32Array([0, v, 1, v, 0, v + 0.01]),
  colors: new Float32Array(9).fill(1),
  indices: new Uint32Array([0, 1, 2]),
});

it('fails before D354: a mesh mapped outside every compile brings its material to the asset that uses it', () => {
  const outside = withMapped(tri(0.755), [use('granite', 4)]);
  const a = asset('carries', (ctx) => ctx.part('rock', outside));
  expect(compile(a).materials).toEqual([{ id: 'granite', row: 4 }]);
  // The same mesh in an asset that holds the row for another material: named, with the part.
  const clash = asset('carries_clash', (ctx) => {
    noteMaterial({ id: 'scales', row: 4 });
    ctx.part('rock', outside);
  });
  const e = thrown(() => compile(clash));
  expect(e.code).toBe('T3D_MATERIAL_CONFLICT');
  expect(e.message).toContain("'scales' and 'granite'");
  expect(e.message).toContain("part 'rock'");
  expect(e.fix).toContain("defineMaterial({ id: 'granite', row:");
});

it('carries the record through translate, place, merge and ctx.use, and unions it by id in row order', () => {
  const a = withMapped(tri(0.755), [use('granite', 4)]);
  const b = withMapped(tri(0.755), [use('bark', 2), use('granite', 4)]);
  expect(translate(a, [1, 0, 0]).mapped).toEqual(a.mapped);
  expect(place(a, { at: [0, 1, 0], yaw: 1 }).mapped).toEqual(a.mapped);
  expect(merge([a, tri(0.1), b]).mapped?.map((u) => u.id)).toEqual(['bark', 'granite']);
  expect(merge([tri(0.1), tri(0.2)]).mapped).toBeUndefined();
  expect(mappedOf(tri(0.1), a).mapped).toBe(a.mapped);
  expect(withMapped(a, [])).toBe(a);
  const child = asset('carried_child', (ctx) => ctx.part('rock', a));
  const scene = asset('carried_scene', (ctx) => {
    ctx.use(child, { prefix: 'c' });
  });
  const c = compile(scene);
  expect(c.materials).toEqual([{ id: 'granite', row: 4 }]);
  expect(c.parts.find((p) => p.name === 'c_rock')?.mesh?.mapped).toEqual(a.mapped);
  const clash = asset('carried_clash', (ctx) => {
    noteMaterial({ id: 'scales', row: 4 });
    ctx.use(child, { prefix: 'c' });
  });
  expect(thrown(() => compile(clash)).code).toBe('T3D_MATERIAL_CONFLICT');
});

it('a stale record claims nothing: UVs re-pointed off the band, or lying on its edge', () => {
  // Mapped onto granite, then its UVs moved by hand to another row: it no longer shows granite.
  const moved = { ...withMapped(tri(0.755), [use('granite', 4)]), uvs: tri(0.1).uvs };
  const a = asset('stale', (ctx) => {
    noteMaterial({ id: 'scales', row: 4 });
    ctx.part('moved', moved);
    // A triangle lying wholly on the band's lower edge samples the row below, not this one.
    ctx.part('edge', {
      ...moved,
      uvs: new Float32Array([0, BAND.v0, 1, BAND.v0, 0.5, BAND.v0]),
    });
  });
  expect(compile(a).materials).toEqual([{ id: 'scales', row: 4 }]);
});
