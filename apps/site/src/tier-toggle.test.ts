import { describe, expect, test } from 'bun:test';
import {
  baseOf,
  gridItems,
  modelOnly,
  pairOf,
  parseHash,
  payloadOf,
  SHOWCASE_MODEL_BYTES,
  selfTiered,
  showcaseItems,
} from './tier-toggle.ts';

const item = (name: string, folder = name) => ({ name, folder });
const ITEMS = [
  item('wolf'),
  item('wolf_hybrid'),
  item('human_head'),
  item('human_head_hybrid'),
  item('fox'),
  item('ghost_hybrid'),
];
const NEURAL = { wolf_hybrid: [{ key: 'a' }] };

describe('baseOf', () => {
  test('only a `<name>_hybrid` has a base', () => {
    expect(baseOf('wolf_hybrid')).toBe('wolf');
    expect(baseOf('wolf')).toBeNull();
    expect(baseOf('_hybrid')).toBeNull();
  });
});

describe('pairOf: the switch shows only when a pair exists', () => {
  test('a CPU asset with a hybrid that has committed neural records is paired', () => {
    expect(pairOf(item('wolf'), ITEMS, NEURAL)?.name).toBe('wolf_hybrid');
  });

  test('no hybrid recipe → no switch (a CPU-only asset)', () => {
    expect(pairOf(item('fox'), ITEMS, NEURAL)).toBeNull();
  });

  test('a hybrid with no committed neural cache → no switch (it would compile as the CPU asset)', () => {
    expect(pairOf(item('human_head'), ITEMS, NEURAL)).toBeNull();
    expect(pairOf(item('human_head'), ITEMS, { human_head_hybrid: [] })).toBeNull();
  });

  test('a hybrid is never itself a base', () => {
    expect(pairOf(item('wolf_hybrid'), ITEMS, NEURAL)).toBeNull();
  });
});

describe('gridItems: hybrids are hidden from the grid', () => {
  test('a hybrid whose CPU asset is listed has no card; an orphan hybrid keeps one', () => {
    expect(gridItems(ITEMS).map((i) => i.name)).toEqual([
      'wolf',
      'human_head',
      'fox',
      'ghost_hybrid',
    ]);
  });
});

describe('selfTiered: one recipe that holds both tiers', () => {
  const OWN = { ...NEURAL, ranger: [{ key: 'b' }], fox: [] };

  test('no committed records in its own folder → one tier only', () => {
    expect(selfTiered(item('fox'), OWN)).toBe(false);
    expect(selfTiered(item('wolf'), OWN)).toBe(false);
  });

  test('a hybrid is the model tier of its pair, never a recipe with both', () => {
    expect(selfTiered(item('wolf_hybrid'), OWN)).toBe(false);
  });

  test('records in the recipe’s own folder → both tiers; `@cpu` asks for the fallback', () => {
    expect(selfTiered(item('ranger'), OWN)).toBe(true);
    expect(parseHash('ranger')).toEqual(['ranger', null]);
    expect(parseHash('ranger@cpu')).toEqual(['ranger', 'cpu']);
  });

  test('the payload is the sum of the published bytes', () => {
    expect(payloadOf([])).toBe(0);
    expect(payloadOf([{ bytes: 936_142 }, { bytes: 10_159_868 }])).toBe(11_096_010);
  });

  test('the home showcase never takes a recipe whose model outputs are a heavy download', () => {
    const heavy = { ranger: [{ bytes: 936_142 }, { bytes: 10_159_868 }] };
    const list = [item('wolf'), item('ranger'), item('human_head')];
    expect(showcaseItems(list, heavy).map((i) => i.name)).toEqual(['wolf', 'human_head']);
    const light = { human_head: [{ bytes: 224_319 }], ranger: [{ bytes: SHOWCASE_MODEL_BYTES }] };
    expect(showcaseItems(list, light).map((i) => i.name)).toEqual(['wolf', 'ranger', 'human_head']);
  });
});

describe('modelOnly: a hybrid with no listed CPU asset is its own model tier (D339)', () => {
  const LIST = [item('wolf'), item('wolf_hybrid'), item('brown_bear'), item('bear_hybrid')];
  const HELD = { wolf_hybrid: [{ key: 'a' }], bear_hybrid: [{ key: 'b' }] };

  test('bear_hybrid has no `bear` to pair with: it opens on its model outputs', () => {
    expect(modelOnly(item('bear_hybrid'), LIST, HELD)).toBe(true);
  });

  test('a paired hybrid, a plain asset and a hybrid without records are not', () => {
    expect(modelOnly(item('wolf_hybrid'), LIST, HELD)).toBe(false);
    expect(modelOnly(item('brown_bear'), LIST, HELD)).toBe(false);
    expect(modelOnly(item('bear_hybrid'), LIST, { bear_hybrid: [] })).toBe(false);
  });
});
