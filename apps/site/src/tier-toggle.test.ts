import { describe, expect, test } from 'bun:test';
import { baseOf, gridItems, pairOf } from './tier-toggle.ts';

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
