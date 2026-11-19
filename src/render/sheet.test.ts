import { expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { contactSheet, sheetLabels } from './sheet.ts';

it('renders a six-view PNG', () => {
  const a = defineAsset({
    name: 'cube',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => {
      ctx.part('body', box({ size: [1, 1, 1], color: [0.6, 0.2, 0.2] }));
    },
  });
  const png = contactSheet(compile(a), { cell: 64 });
  expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  expect(Bun.hash(png)).toBe(Bun.hash(contactSheet(compile(a), { cell: 64 })));
});

const cube = (size: [number, number, number], lod: 0 | 1 | 2 = 0) =>
  compile(
    defineAsset({
      name: 'cube',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) => ctx.part('body', box({ size, color: [0.9, 0.05, 0.05] })),
    }),
    { lod },
  );

/** Asset (red) pixels on the outer border of each of the six cells. */
const borderHits = (png: Uint8Array, cell: number): number[] => {
  const img = decodePng(png);
  const red = (x: number, y: number): boolean => {
    const i = (y * img.width + x) * 4;
    return (img.data[i] ?? 0) > 1.6 * (img.data[i + 1] ?? 0) && (img.data[i] ?? 0) > 60;
  };
  return [0, 1, 2, 3, 4, 5].map((v) => {
    const [ox, oy] = [(v % 3) * cell, 40 + Math.floor(v / 3) * cell];
    let n = 0;
    for (let k = 0; k < cell; k++)
      for (const [x, y] of [
        [ox, oy + k],
        [ox + cell - 1, oy + k],
        [ox + k, oy],
        [ox + k, oy + cell - 1],
      ] as const)
        if (red(x, y)) n++;
    return n;
  });
};

it('frames 3/4 views from their projected extent: a cube is not cropped', () => {
  for (const size of [
    [2, 2, 2],
    [4, 4, 0.5],
    [6, 2, 2],
  ] as [number, number, number][])
    expect(borderHits(contactSheet(cube(size), { cell: 120 }), 120)).toEqual([0, 0, 0, 0, 0, 0]);
});

it('labels the sixth cell with the LOD it draws', () => {
  expect(sheetLabels(cube([1, 1, 1]))[5]).toBe('FAR LOD0');
  expect(sheetLabels(cube([1, 1, 1]), { far: cube([1, 1, 1], 2) })[5]).toBe('FAR LOD2');
});

it('refuses a part with short attribute arrays with a coded error, not a RangeError', () => {
  const b = box({ size: [1, 1, 1], color: [1, 1, 1] });
  const bad = compile(
    defineAsset({
      name: 'bad',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) => ctx.part('a', { ...b, normals: b.normals.slice(0, 12) }),
    }),
  );
  expect(() => contactSheet(bad, { cell: 32 })).toThrow(/T3D_RECIPE_INVALID.*'a'.*normals/);
});
