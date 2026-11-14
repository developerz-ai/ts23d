import { afterAll, expect, it } from 'bun:test';
import { CC0_MATERIALS } from './cc0.ts';
import { CREATURE_MATERIALS } from './creature.ts';
import { defineMaterial, resetMaterials } from './define.ts';
import { customIds, homeSlot } from './slots.ts';
import { CUSTOM_STRIP_SLOTS, type StripId, stripRect } from './trim-sheet.ts';

afterAll(resetMaterials);

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

it('never moves a row already given out, even on a hash clash', () => {
  resetMaterials();
  const home = homeSlot('clash_a', CUSTOM_STRIP_SLOTS);
  let other = 'clash_b0';
  for (let k = 1; homeSlot(other, CUSTOM_STRIP_SLOTS) !== home; k++) other = `clash_b${k}`;
  defineMaterial({ id: 'clash_a', roughness: 0.5 });
  const a = vOf('clash_a');
  defineMaterial({ id: other, roughness: 0.5 });
  expect(vOf('clash_a')).toBe(a);
  expect(vOf(other)).not.toBe(a);
  expect(customIds()).toHaveLength(2);
});

it('gives every shipped material its own home row, so none depends on order', () => {
  const ids = [...Object.values(CREATURE_MATERIALS), ...CC0_MATERIALS].map((d) => d.id);
  const homes = new Set(ids.map((id) => homeSlot(id, CUSTOM_STRIP_SLOTS)));
  expect(homes.size).toBe(ids.length);
});
