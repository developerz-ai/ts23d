// Every default gate, made to fail once: its findings carry a `T3D_*` code and a fix (errors.md
// "Finding codes"). A gate added to DEFAULT_GATES without a row here fails the coverage test.

import { describe, expect, it } from 'bun:test';
import {
  type Asset,
  type AssetDefinition,
  type CompiledAsset,
  compile,
  defineAsset,
  type Mesh,
  merge,
} from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { clashes } from './clash.ts';
import { connections } from './connections.ts';
import { floatingParts } from './floating.ts';
import { gaps } from './gaps.ts';
import { DEFAULT_GATES, partNames, proportions, recipeChecks, triangleBudget } from './gates.ts';
import { joints } from './joints.ts';
import { DEFAULT_LOD_GATES, lodTriangles } from './lods.ts';
import { mass } from './mass.ts';
import { measures } from './measures.ts';
import { hiddenParts } from './occlusion.ts';
import { degenerateTriangles, nonFinite, normalsMatchWinding, vertexColors } from './sanity.ts';
import { treads } from './treads.ts';
import type { Finding, Gate } from './types.ts';
import { weatherGate } from './weather.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const cube = box({ size: [1, 1, 1], color: c });

const build = (
  parts: ReadonlyArray<readonly [string, Mesh, Record<string, unknown>?]>,
  extra: Partial<AssetDefinition> = {},
): CompiledAsset =>
  compile(
    defineAsset({
      name: 'fixture',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build: (ctx) => {
        for (const [name, mesh, o] of parts) ctx.part(name, mesh, o);
      },
      ...extra,
    }),
  );

const flip = (m: Mesh): Mesh => {
  const indices = new Uint32Array(m.indices);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t + 1] ?? 0;
    indices[t + 1] = indices[t + 2] ?? 0;
    indices[t + 2] = a;
  }
  return { ...m, indices };
};

const nan = new Float32Array(cube.positions);
nan[4] = Number.NaN;

/** A closed 2 m cabinet whose door leaves a 1 cm slot under its header. */
const cabinet = (): CompiledAsset =>
  build([
    ['floor', box({ size: [2, 2, 0.2], color: c })],
    ['roof', box({ size: [2, 2, 0.2], at: [0, 0, 1.8], color: c })],
    ['side_l', box({ size: [2, 0.2, 1.6], at: [0, 0.9, 0.2], color: c })],
    ['side_r', box({ size: [2, 0.2, 1.6], at: [0, -0.9, 0.2], color: c })],
    ['back', box({ size: [0.2, 2, 1.6], at: [-0.9, 0, 0.2], color: c })],
    ['door', box({ size: [0.05, 1.6, 1.59], color: c }), { at: [0.975, 0, 0.2] }],
  ]);

const wrist = (): CompiledAsset =>
  compile(
    defineAsset({
      name: 'wrist',
      kind: 'character',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        const arm = cylinder({ radius: 0.04, length: 0.3, segments: 24, axis: 'x', color: c });
        ctx.part('forearm', arm, { at: [0.15, 0, 1] });
        ctx.part('hand_palm', box({ size: [0.1, 0.08, 0.08], at: [0.4, 0, 0.96], color: c }));
        ctx.joint('wrist', { from: 'forearm', to: 'hand', at: [0.3, 0, 1], axis: [1, 0, 0] });
      },
    }),
  );

/** One failing compiled asset per default gate. */
const FAILING: ReadonlyArray<readonly [Gate, () => CompiledAsset]> = [
  [triangleBudget, () => build([['body', cube]], { budget: { triangles: [1, 1, 1] } })],
  [
    floatingParts,
    () =>
      build([
        ['base', cube],
        ['ghost', cube, { at: [0, 0, 5] }],
      ]),
  ],
  [
    connections,
    () =>
      build([
        [
          'hull',
          merge([
            box({ size: [1, 1, 0.5], color: c }),
            box({ size: [0.1, 0.1, 0.1], at: [0, 0, 0.7], color: c }),
          ]),
        ],
      ]),
  ],
  [gaps, cabinet],
  [
    clashes,
    () =>
      build([
        [
          'wheel',
          cylinder({ radius: 0.5, length: 0.2, segments: 32, axis: 'y', color: c }),
          { at: [0, 0, 0.5], motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 } },
        ],
        ['fender', box({ size: [1.2, 0.3, 0.05], at: [0, 0, 0.9], color: c })],
      ]),
  ],
  [treads, () => build([['track_l', cube]])],
  [partNames, () => build([['BadName', cube]])],
  [proportions, () => build([['body', cube]], { real: { length: 2, width: 1, height: 1 } })],
  [
    measures,
    () =>
      build([['body', cube]], {
        real: {
          length: 1,
          width: 1,
          height: 1,
          measures: [{ label: 'width', axis: 'y', value: 2, parts: ['body'] }],
        },
      }),
  ],
  [joints, wrist],
  [
    mass,
    () =>
      build([['body', box({ size: [1, 1, 1], color: c, strip: 'iron_cast' })]], {
        real: { length: 1, width: 1, height: 1, mass: 1000 },
      }),
  ],
  [
    recipeChecks,
    () => build([['body', cube]], { checks: [() => [{ message: 'no', fix: 'yes' }]] }),
  ],
  [nonFinite, () => build([['body', { ...cube, positions: nan }]])],
  [vertexColors, () => build([['body', { ...cube, colors: cube.colors.map(() => 1.4) }]])],
  [
    hiddenParts,
    () =>
      build([
        ['outer', cube],
        ['inner', box({ size: [0.3, 0.3, 0.3], at: [0, 0, 0.3], color: c })],
      ]),
  ],
  [normalsMatchWinding, () => build([['body', flip(cube)]])],
  [
    degenerateTriangles,
    () =>
      build([['body', { ...cube, indices: new Uint32Array([...cube.indices, 0, 0, 1, 2, 2, 3]) }]]),
  ],
  [
    weatherGate,
    () => ({
      ...build([['body', cube]]),
      weather: [
        {
          target: 'body',
          effect: 'dust',
          where: 'up-facing',
          lod: 0,
          amount: 0.3,
          actual: 0.1,
          area: 1,
          tolerance: 0.02,
          misplaced: 0,
        },
      ],
    }),
  ],
];

const CODE = /^T3D_[A-Z_]+$/;
const wellFormed = (found: readonly Finding[]): void => {
  expect(found.length).toBeGreaterThan(0);
  for (const f of found) {
    expect(f.code).toMatch(CODE);
    expect(f.fix.length).toBeGreaterThan(0);
  }
};

describe('finding codes', () => {
  it('cover every default gate', () => {
    const tested = new Set(FAILING.map(([g]) => g));
    expect(DEFAULT_GATES.filter((g) => !tested.has(g)).map((g) => g.name)).toEqual([]);
  });

  for (const [gate, fixture] of FAILING)
    it(`${gate.name}: every finding has a T3D code and a fix`, () => wellFormed(gate(fixture())));

  it('lifts the T3D code a message already carries', () => {
    expect(joints(wrist())[0]?.code).toMatch(/^T3D_JOINT_/);
    expect(connections(FAILING[2]?.[1]() ?? build([]))[0]?.code).toMatch(/^T3D_CONNECT_/);
    expect(floatingParts(FAILING[1]?.[1]() ?? build([]))[0]?.code).toBe('T3D_QA_FLOATING_PARTS');
  });

  it('lod gates: lod-triangles', () => {
    expect(DEFAULT_LOD_GATES).toEqual([lodTriangles]);
    const growing: Asset = defineAsset({
      name: 'growing',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build: (ctx) => {
        const segments = [8, 32, 8][ctx.lod] ?? 8;
        ctx.part('body', cylinder({ radius: 0.5, length: 1, segments, color: c }));
      },
    });
    wellFormed(lodTriangles([0, 1, 2].map((lod) => compile(growing, { lod: lod as 0 | 1 | 2 }))));
  });
});
