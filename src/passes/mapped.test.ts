// D354: a pass makes a mesh from a mesh, so it carries the materials the input says its UVs map
// onto (`Mesh.mapped`). A pass that dropped it would turn a module-level mesh back into one the
// compile cannot name. The file-level guard is src/primitives/mapped.test.ts.

import { afterAll, expect, it } from 'bun:test';
import { type Mesh, merge } from '../core/index.ts';
import {
  defineMaterial,
  materialSnapshot,
  resetMaterials,
  type StripId,
} from '../material/index.ts';
import { box } from '../primitives/index.ts';
import {
  bakeAo,
  bindRigid,
  fair,
  grime,
  imperfect,
  livery,
  optimize,
  simplify,
  subdivideTo,
  weather,
  weightedNormals,
} from './index.ts';
import { geometryOf, mergeGeometry } from './merge-geometry.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();
afterAll(restoreMaterials);

const C = [0.6, 0.6, 0.6] as const;
const crate = (strip: StripId): Mesh => box({ size: [1, 1, 1], color: C, strip });

/** Every pass that returns a mesh made from its input. A new one belongs in this table. */
const CARRIERS: Readonly<Record<string, (m: Mesh) => Mesh>> = {
  bakeAo: (m) => bakeAo(m),
  bindRigid: (m) => bindRigid(m, 0),
  fair: (m) => fair(m, { iterations: 2 }),
  geometryOf,
  grime: (m) => grime(m, { ground: 0.5 }),
  imperfect: (m) => imperfect(m, { age: 1, sag: { max: 0.006 } }).mesh,
  livery: (m) => livery(m, { base: [1, 0, 0], rules: [] }),
  mergeGeometry: (m) => mergeGeometry([m, crate('iron')]),
  optimize: (m) => optimize(m).mesh,
  simplify: (m) => simplify(m, { targetTris: 8 }).mesh,
  subdivideTo: (m) => subdivideTo(m, 0.3),
  weather: (m) => weather(m, { seed: 4, effects: { dust: { amount: 0.4 } } }).mesh,
  weightedNormals: (m) => weightedNormals(m),
};

for (const [name, pass] of Object.entries(CARRIERS))
  it(`fails before D354: ${name} keeps the materials its input was mapped onto`, () => {
    resetMaterials();
    const m = crate(defineMaterial({ id: 'pass_granite', roughness: 0.9, row: 6 }));
    expect(m.mapped?.map((u) => u.id)).toEqual(['pass_granite']);
    const out = pass(m);
    expect(out).not.toBe(m);
    expect(out.mapped).toEqual(m.mapped);
    expect(pass(crate('iron')).mapped).toBeUndefined();
  });

it('a merge of meshes on two materials names both', () => {
  resetMaterials();
  const a = crate(defineMaterial({ id: 'pass_granite', roughness: 0.9, row: 6 }));
  const b = crate(defineMaterial({ id: 'pass_bark', roughness: 0.8, row: 2 }));
  expect(optimize(merge([a, crate('iron'), b])).mesh.mapped?.map((u) => u.id)).toEqual([
    'pass_bark',
    'pass_granite',
  ]);
});
