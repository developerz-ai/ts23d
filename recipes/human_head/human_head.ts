// Stylised human hero bust — an original design: the MEASURED human proportions (ratios from a head
// scan, docs/research/head-analysis.md) pushed slightly heroic (jaw ×1.06, chin ×1.1, brow ×1.1),
// sculpted in stages like the orc (block-out → planes → features → lines) by the shared bust
// library: socketed eyes with lids, wet line and caruncle; anatomical ears (helix, antihelix,
// concha, tragus, lobe); swept-back hair and a clipped beard of sculpted locks; a blue tunic with
// a standing leather collar, a red mantle pinned by a brass brooch; a turned plinth.
// Design dossier: recipes/human_head/README.md.

import { defineAsset } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { SK } from '../_lib/bust/human/spec.ts';
import { HUMAN_PROPORTIONS, proportionCheck } from '../_lib/face/proportions.ts';
import { buildHuman, HUMAN_BUST } from './build.ts';
import { HUMAN_CREASES } from './creases.ts';

export const human_head = defineAsset({
  name: 'human_head',
  kind: 'character',
  description:
    'Stylised human hero bust: measured human proportions pushed heroic, swept-back hair and clipped beard as sculpted locks, socketed eyes, blue tunic with leather collar, red mantle and brass brooch',
  tags: ['character', 'fantasy', 'human', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: [
    'recipes/human_head/README.md (design dossier: proportions, palette, references)',
    'docs/research/head-analysis.md (human ratios measured on the Lee Perry-Smith scan, CC BY 3.0)',
  ],
  // Design spec (an invented character): overall size as built; the measure is the eye spacing.
  real: {
    length: 0.268,
    width: 0.558,
    height: 0.566,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.063,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: 'adult interpupillary distance mean 63.4 mm (Dodgson 2004); ANSUR II male 64.6 mm',
      },
    ],
  },
  budget: { triangles: [100000, 32000, 4200] },
  finishes: { cornea: { clearcoat: 1, clearcoatRoughness: 0.04 } },
  art: { focal: 'head', shape: 'stable' },
  // Intended creases (QA `connections` skips them): one small region per sculpted fold, from the
  // geometry that sculpts it (creases.ts) — never an area.
  creases: HUMAN_CREASES,
  // Measured facial proportions against sourced bands (README "Proportions"), every LOD.
  checks: [
    proportionCheck(
      'human_head',
      SK,
      () => bustEdits(HUMAN_BUST, 2, 1).skin.field,
      HUMAN_PROPORTIONS,
    ),
  ],
  build(ctx) {
    buildHuman(ctx);
  },
});
