import { describe, expect, test } from 'bun:test';
import { FLAGSHIPS, flagshipRank } from './flagships.ts';

describe('flagships', () => {
  test('an unlisted asset ranks after every flagship', () => {
    expect(flagshipRank('not_a_flagship')).toBe(FLAGSHIPS.length);
    expect(flagshipRank('city_block')).toBeLessThan(FLAGSHIPS.length);
  });

  test('no flagship is listed twice', () => {
    expect(new Set(FLAGSHIPS).size).toBe(FLAGSHIPS.length);
  });

  test('the shark leads the new creatures, right after the two tier demos', () => {
    expect(FLAGSHIPS.slice(0, 7)).toEqual([
      'wolf',
      'ranger',
      'great_white',
      'bluefin_tuna',
      'common_octopus',
      'king_cobra',
      'hydra',
    ]);
  });

  test('the earlier flagships keep their relative order', () => {
    const earlier = FLAGSHIPS.filter((n) => flagshipRank(n) < 2 || flagshipRank(n) > 6);
    expect(earlier).toEqual([
      'wolf',
      'ranger',
      'human_head',
      'orc_head',
      'elf_head',
      'goblin_head',
      'amur_tiger',
      'dragon',
      'fox',
      'brown_bear',
      'city_block',
    ]);
  });
});
