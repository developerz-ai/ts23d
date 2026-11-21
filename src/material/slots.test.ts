import { afterAll, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { CC0_MATERIALS } from './cc0.ts';
import { CREATURE_MATERIALS } from './creature.ts';
import { defineMaterial, materialSnapshot, resetMaterials } from './define.ts';
import type { MaterialDef } from './material-def.ts';
import { customIds, customIndex, homeSlot } from './slots.ts';
import { CUSTOM_STRIP_SLOTS, type StripId, stripRect } from './trim-sheet.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();

afterAll(restoreMaterials);

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
    throw e;
  }
  return 'no error';
}

const vOf = (id: string): number => stripRect(id as StripId).v0;

it('keeps a custom strip row whatever the process registered before it', () => {
  resetMaterials();
  const fur = defineMaterial(CREATURE_MATERIALS.fur_neutral);
  const alone = vOf(fur);
  resetMaterials();
  defineMaterial(CREATURE_MATERIALS.reptile_scales);
  defineMaterial({ id: 'unrelated_paint', roughness: 0.5 });
  defineMaterial(CREATURE_MATERIALS.fur_neutral);
  expect(vOf(fur)).toBe(alone);
});

it('lets any number of ids hold one row, in either order, each on the row its definition gives', () => {
  const home = homeSlot('clash_a', CUSTOM_STRIP_SLOTS);
  let other = 'clash_b0';
  for (let k = 1; homeSlot(other, CUSTOM_STRIP_SLOTS) !== home; k++) other = `clash_b${k}`;
  for (const [first, second] of [
    ['clash_a', other],
    [other, 'clash_a'],
  ] as const) {
    resetMaterials();
    // Refused before D299 (T3D_MATERIAL_CONFLICT): the rows belonged to the process.
    defineMaterial({ id: first, roughness: 0.5 });
    defineMaterial({ id: second, roughness: 0.5 });
    defineMaterial({ id: 'clash_placed', roughness: 0.5, row: home });
    expect(customIds()).toEqual(['clash_a', other, 'clash_placed'].sort());
    expect(customIds().map(customIndex)).toEqual([home, home, home]);
    expect(vOf(first)).toBe(vOf(second));
  }
});

it('rejects a row outside the custom rows', () => {
  for (const row of [-1, CUSTOM_STRIP_SLOTS, 1.5, Number.NaN])
    expect(codeOf(() => defineMaterial({ id: 'bad_row', roughness: 0.5, row }))).toBe(
      'T3D_MATERIAL_INVALID',
    );
});

it('puts a material on the row it names, whatever was registered before', () => {
  const free = (homeSlot('row_first', CUSTOM_STRIP_SLOTS) + 1) % CUSTOM_STRIP_SLOTS;
  resetMaterials();
  defineMaterial({ id: 'row_moved', roughness: 0.5, row: free });
  const alone = vOf('row_moved');
  resetMaterials();
  defineMaterial({ id: 'row_first', roughness: 0.5 });
  defineMaterial({ id: 'row_moved', roughness: 0.5, row: free });
  expect(vOf('row_moved')).toBe(alone);
  expect(customIndex('row_moved')).toBe(free);
  // The same id with another row is a different definition, not a silent move.
  expect(codeOf(() => defineMaterial({ id: 'row_moved', roughness: 0.5 }))).toBe(
    'T3D_MATERIAL_CONFLICT',
  );
});

it('registers every library material together, in either order, on the same rows', () => {
  const defs = [...Object.values(CREATURE_MATERIALS), ...CC0_MATERIALS];
  const rowsOf = (order: readonly MaterialDef[]): string => {
    resetMaterials();
    for (const d of order) defineMaterial(d);
    return defs.map((d) => `${d.id}:${customIndex(d.id)}`).join(' ');
  };
  const forward = rowsOf(defs);
  expect(rowsOf([...defs].reverse())).toBe(forward);
  expect(new Set(forward.split(' ').map((s) => s.split(':')[1])).size).toBe(defs.length);
});
