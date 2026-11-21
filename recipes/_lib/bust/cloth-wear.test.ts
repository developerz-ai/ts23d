// The dressed busts' garments paint only where wear has a cause (D580): fold valleys, edges, the
// spots the body wears, trims and seams. Failure first: noise-placed stains on open panels. At
// LOD0 the goblin's patches and the human's darn are their own fine layers and the seams carry
// real stitches (D581, D582).

import { describe, expect, it } from 'bun:test';
import { ELF_BUST } from '../../elf_head/build.ts';
import { outfitLayers as elfLayers } from '../../elf_head/clothes.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import { outfitLayers as goblinLayers } from '../../goblin_head/clothes.ts';
import { HUMAN_BUST } from '../../human_head/build.ts';
import { outfitLayers as humanLayers } from '../../human_head/clothes.ts';
import { type BustRecipe, bustEdits } from './bust.ts';
import { strayPaint } from './cloth-check.ts';
import type { Surface } from './kit.ts';
import type { GarmentLayer } from './layers.ts';

const busts: [string, BustRecipe, (s: Surface, lod: number) => GarmentLayer[]][] = [
  ['goblin', GOBLIN_BUST, goblinLayers],
  ['elf', ELF_BUST, elfLayers],
  ['human', HUMAN_BUST, humanLayers],
];

describe('garment wear', () => {
  for (const [name, b, layers] of busts)
    it(`fails on stains without a cause (D580): the ${name}'s paint stays in its wear`, () => {
      const skin = bustEdits(b, 2, 1).skin;
      for (const l of layers(skin, 1)) {
        const stray = strayPaint(l, 0.012);
        expect({ layer: l.name, stray: stray.length }).toEqual({ layer: l.name, stray: 0 });
      }
    }, 60_000);
});

describe('garment sewing at LOD0', () => {
  it('fails on patches melted into the garment (D581): each repair is its own fine slab', () => {
    for (const [name, b, layers, repair] of [
      ['goblin', GOBLIN_BUST, goblinLayers, 'patches'],
      ['human', HUMAN_BUST, humanLayers, 'darn'],
    ] as const) {
      const all = layers(bustEdits(b, 2, 0).skin, 0);
      const l = all.find((x) => x.name === repair);
      expect({ name, cell: (l?.cell[0] ?? 1) <= 0.004 }).toEqual({ name, cell: true });
    }
  }, 60_000);
  it('fails on unsewn garments (D582): every bust carries running stitches', () => {
    for (const [name, b, layers] of busts) {
      const l = layers(bustEdits(b, 2, 0).skin, 0).find((x) => x.name === 'stitches');
      expect({ name, stitches: (l?.edits.length ?? 0) >= 12 }).toEqual({ name, stitches: true });
    }
  }, 60_000);
});
