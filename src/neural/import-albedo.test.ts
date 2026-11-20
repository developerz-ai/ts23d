// `onSheet` replaces every UV of an import, so the mesh then maps onto the new strip alone: a
// material its old UVs were mapped onto must not stay on its record (D409).

import { afterAll, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import {
  defineMaterial,
  materialSnapshot,
  materialsOf,
  resetMaterials,
} from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { onSheet } from './import-albedo.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();
afterAll(restoreMaterials);

it('fails before D409: remapped onto material B of the same row, the mesh no longer claims A', () => {
  resetMaterials();
  const a = defineMaterial({ id: 'onsheet_moss', roughness: 0.9, albedo: '#304020', row: 5 });
  const b = defineMaterial({ id: 'onsheet_rust', roughness: 0.6, albedo: '#703010', row: 5 });
  const m = box({ size: [1, 1, 1], color: [0.6, 0.6, 0.6], strip: a });
  expect(m.mapped?.map((u) => u.id)).toEqual(['onsheet_moss']);
  const moved = onSheet(m, b);
  expect(moved.mapped?.map((u) => u.id)).toEqual(['onsheet_rust']);
  const asset = defineAsset({
    name: 'onsheet_import',
    kind: 'prop',
    budget: { triangles: [100, 100, 100] },
    build: (ctx) => ctx.part('rock', moved),
  });
  expect(materialsOf(compile(asset))).toEqual(['onsheet_rust']);
});

it('onto a built-in strip, the mesh maps onto no project material', () => {
  resetMaterials();
  const a = defineMaterial({ id: 'onsheet_moss', roughness: 0.9, albedo: '#304020', row: 5 });
  const m = box({ size: [1, 1, 1], color: [0.6, 0.6, 0.6], strip: a });
  expect(onSheet(m).mapped ?? []).toEqual([]);
});
