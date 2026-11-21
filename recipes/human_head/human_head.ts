// Stylised human hero bust — an original design: the MEASURED human proportions (ratios from a head
// scan, docs/research/head-analysis.md) pushed slightly heroic (jaw ×1.06, chin ×1.1, brow ×1.1),
// sculpted in stages like the orc (block-out → planes → features → lines) by the shared bust
// library: socketed eyes with lids, wet line and caruncle; anatomical ears (helix, antihelix,
// concha, tragus, lobe); swept-back hair and a clipped beard of sculpted locks; a blue tunic with
// a standing leather collar, a red mantle pinned by a brass brooch; a turned plinth.
// Design dossier: recipes/human_head/README.md.

import { defineAsset, headClips } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { portrait } from '../_lib/bust/hero.ts';
import { C, SK } from '../_lib/bust/human/spec.ts';
import { HUMAN_PROPORTIONS, proportionCheck } from '../_lib/face/proportions.ts';
import { scalpCoverCheck } from '../_lib/face/scalp-check.ts';
import { skinFinish } from '../_lib/face/skin-strip.ts';
import { buildHuman, HUMAN_BUST, SCALP } from './build.ts';
import { HUMAN_CREASES } from './creases.ts';
import { hairline } from './hair.ts';

export const human_head = defineAsset({
  clips: headClips('face'),
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
    width: 0.342,
    height: 0.581,
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
  // LOD0: the head's skin ≈ 28k (eyes, ears and mouth meshed finer), hair ≈ 10k, the garments
  // ≈ 21k. Draws: skin, face-node cloth, static fittings, corneas, hair cards.
  // (LOD2 from 3100: its face box holds the sockets, nose and lips, ~400–630 triangles, D551.)
  budget: { triangles: [72000, 20500, 3500], draws: 5 },
  // The eyeballs' cornea (a clear lacquer over the painted iris) and the skin: the pore strip's
  // own roughness (matte cheeks, a glossier T-zone) under a soft grazing sheen. The wool and the
  // linen are strips of their own (../_lib/bust/cloth-strips.ts), no finish.
  // A portrait: the bust fills the frame (the default orbit leaves the face a thumbnail).
  hero: portrait(0.581, { fill: 1.45, at: 0.7 }),
  finishes: {
    cornea: { clearcoat: 1, clearcoatRoughness: 0.04 },
    skin: skinFinish('#8c7b72'),
  },
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
    // No bare skin under the hair (D57): the scalp inside the hairline is hair-coloured.
    scalpCoverCheck({ part: 'head', line: hairline, hair: SCALP, skin: C.skin }),
  ],
  build(ctx) {
    buildHuman(ctx);
  },
});
