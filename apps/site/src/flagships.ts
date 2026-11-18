// The flagship assets, in showcase and grid order. Plain data so it is testable without the
// site's virtual media module; `scripts/lib/critique.ts` keeps its own, separate gate list.

/** The wolf (both tiers), the ranger (model-first), the swimmers and chain creatures, then the rest. */
export const FLAGSHIPS: readonly string[] = [
  'wolf',
  'ranger',
  'great_white',
  'bluefin_tuna',
  'common_octopus',
  'king_cobra',
  'hydra',
  'human_head',
  'orc_head',
  'elf_head',
  'goblin_head',
  'amur_tiger',
  'dragon',
  'fox',
  'brown_bear',
  'city_block',
];

/** Position among the flagships; every other asset ranks after them all. */
export function flagshipRank(name: string): number {
  const at = FLAGSHIPS.indexOf(name);
  return at < 0 ? FLAGSHIPS.length : at;
}
