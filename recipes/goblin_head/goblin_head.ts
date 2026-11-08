// Stylised goblin bust — an original design: the measured human proportions bent goblin (bigger
// vault, eyes ×1.45 and wider set under heavy lids, a long hooked nose, a wide toothy grin, sharp
// small chin, huge notched leaf ears built on human ear anatomy), a worried brow, warts and pale
// wisps of hair; a skinny neck on bony shoulders in a linen shirt, open leather vest, hood worn
// down and a knotted red scarf; a turned plinth. Sculpted by the shared bust library (stages
// block-out → planes → features → lines); dossier: recipes/goblin_head/README.md.

import { defineAsset } from '@developerz.ai/ts23d';
import { buildGoblin } from './build.ts';
import { GOBLIN_CREASES } from './creases.ts';

export const goblin_head = defineAsset({
  name: 'goblin_head',
  kind: 'character',
  description:
    'Stylised goblin bust: huge notched leaf ears, long hooked nose, toothy grin, big amber eyes under heavy lids, worried brow, warts, wispy hair, linen shirt, leather vest, hood and knotted scarf',
  tags: ['character', 'fantasy', 'goblin', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: [
    'recipes/goblin_head/README.md (design dossier: proportions, exaggerations, palette)',
    'docs/research/head-analysis.md (human anchor ratios, Lee Perry-Smith scan, CC BY 3.0)',
  ],
  // Design spec (an invented character): overall size as built; the measure is the eye spacing.
  real: {
    length: 0.242,
    width: 0.456,
    height: 0.482,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.063,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: 'interpupil 0.331 H (human 0.265 × 1.25) × 0.19 m',
      },
    ],
  },
  budget: { triangles: [90000, 30000, 4400] },
  finishes: { cornea: { clearcoat: 1, clearcoatRoughness: 0.04 } },
  art: { focal: 'head', shape: 'aggressive' },
  // Intended creases (QA `connections` skips them): one small region per sculpted fold, from the
  // geometry that sculpts it (creases.ts) — never an area.
  creases: GOBLIN_CREASES,
  build(ctx) {
    buildGoblin(ctx);
  },
});
