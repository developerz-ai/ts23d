import { expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, MeshBuilder } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { drawCallsOf, drawFindings, glbContents } from './draw-budget.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb } from './glb.ts';
import { beltMesh, stadium } from './tread-fixtures.ts';

const lidded = (draws: number | undefined) =>
  defineAsset({
    name: 'two',
    kind: 'prop',
    budget: { triangles: [2000, 2000, 2000], ...(draws === undefined ? {} : { draws }) },
    build(ctx) {
      ctx.group('lid', { motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 } });
      ctx.part('base', cylinder({ radius: 0.3, length: 1, segments: 8, color: [1, 1, 1] }));
      ctx.part(
        'cap',
        cylinder({ radius: 0.3, length: 0.1, segments: 8, at: [0, 0, 1], color: [1, 1, 1] }),
        { parent: 'lid' },
      );
    },
  });

it('fails budget.draws when a LOD needs more draw calls, one finding per LOD over it', () => {
  const two = lidded(1);
  const lods = ([0, 1] as const).map((lod) => compile(two, { lod }));
  expect(lods.map(drawCallsOf)).toEqual([2, 2]);
  const found = drawFindings(two, lods);
  expect(found.map((f) => `${f.gate} ${f.code}`)).toEqual([
    'draw-calls T3D_QA_DRAW_CALLS',
    'draw-calls T3D_QA_DRAW_CALLS',
  ]);
  expect(found[0]?.message).toBe('LOD0 needs 2 draw calls, budget.draws is 1');
  expect(found[0]?.fix).toContain('ctx.group');
});

it('passes at the budget, and has nothing to say without one', () => {
  const lods = [compile(lidded(2), { lod: 0 })];
  expect(drawFindings(lidded(2), lods)).toEqual([]);
  expect(drawFindings(lidded(undefined), lods)).toEqual([]);
});

interface Gltf {
  meshes?: { primitives: { indices: number }[] }[];
  accessors?: { count: number }[];
  animations?: { name: string }[];
}
const read = (asset: CompiledAsset): Gltf =>
  readGlbChunks(toGlb(asset, { animations: true })).json as Gltf;
const primitives = (g: Gltf) => (g.meshes ?? []).flatMap((m) => m.primitives);
const hasRun = (g: Gltf): boolean => (g.animations ?? []).some((a) => a.name === 'run');

it('counts no draw for a pivot whose own mesh has no triangles (the GLB writes none)', () => {
  // roadster_v10: the `hood` pivot kept an empty mesh once its panels split into other layers;
  // 24 draws were counted against a 23-primitive file.
  const car = defineAsset({
    name: 'car',
    kind: 'prop',
    budget: { triangles: [200, 200, 200], draws: 2 },
    build(ctx) {
      ctx.part('chassis', box({ size: [2, 1, 0.3], color: [1, 1, 1] }));
      ctx.part('hood', new MeshBuilder().build(), {
        at: [0.6, 0, 0.3],
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.25 },
      });
      ctx.part('hood_glazing', box({ size: [0.6, 0.9, 0.05], color: [1, 1, 1] }), {
        parent: 'hood',
        surface: 'glass',
      });
    },
  });
  const lod = compile(car, { lod: 0 });
  expect(primitives(read(lod))).toHaveLength(2);
  expect(drawCallsOf(lod)).toBe(2);
  expect(drawFindings(car, [lod])).toEqual([]);
});

it('counts the triangles the file holds: none of the degenerate or duplicate ones', () => {
  const sloppy = defineAsset({
    name: 'sloppy',
    kind: 'prop',
    budget: { triangles: [200, 200, 200] },
    build(ctx) {
      const b = new MeshBuilder();
      const at = (x: number, z: number) =>
        b.vertex({ p: [x, 0, z], n: [0, -1, 0], uv: [x, z], color: [1, 1, 1] });
      const [p, q, r, s] = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
      // Two good triangles, one collapsed to a line, one a copy of the first.
      ctx.part('sheet', b.quad(p, q, r, s).tri(p, q, q).tri(p, q, r).build());
    },
  });
  const lod = compile(sloppy, { lod: 0 });
  const g = read(lod);
  const inFile = primitives(g).reduce((n, pr) => n + (g.accessors?.[pr.indices]?.count ?? 0), 0);
  expect(inFile / 3).toBe(2);
  expect(glbContents(lod).triangles).toBe(2);
});

const conveyor = (gap: boolean) =>
  defineAsset({
    name: 'conveyor',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      const { mesh, pitch } = beltMesh(20, gap);
      ctx.part('belt', mesh, {
        motion: { kind: 'tread', path: stadium().map(([x, z]) => [x, 0.8, z] as const), pitch },
      });
    },
  });

it('says a lone belt runs exactly when the GLB gets a run clip', () => {
  // A belt runs by morph targets: "any motion but a tread" missed the conveyor's run clip.
  const runs = compile(conveyor(false), { lod: 0 });
  expect(hasRun(read(runs))).toBe(true);
  expect(glbContents(runs).run).toBe(true);
  // A belt that does not repeat every pitch cannot loop: no targets, no clip.
  const stuck = compile(conveyor(true), { lod: 0 });
  expect(hasRun(read(stuck))).toBe(false);
  expect(glbContents(stuck).run).toBe(false);
  const two = compile(lidded(2), { lod: 0 });
  expect(glbContents(two).run).toBe(hasRun(read(two)));
  expect(glbContents(two).run).toBe(true);
});
