import { expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { definePart } from './define-part.ts';
import { Ts23dError } from './errors.ts';
import { materialsInUse, noteMaterial, trackMaterials } from './material-use.ts';
import { merge } from './mesh.ts';

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
