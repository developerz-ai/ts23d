// Stylised elf bust — an original design in the fantasy-MMO idiom (no specific character): the
// measured human proportions made slender (narrow jaw, pointed chin, high cheekbones, refined
// nose, almond eyes) with long pointed ears built on human ear anatomy (helix, antihelix, concha,
// tragus, lobe) and the helix drawn out to a swept point; long pale-gold hair as sculpted locks
// falling behind the ears; green gold-trimmed tunic with a high collar, teal cloak, silver clasp;
// a turned plinth. Sculpted by the shared bust library; dossier: recipes/elf_head/README.md.

import { defineAsset, headClips } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { proportionCheck } from '../_lib/face/proportions.ts';
import { scalpCoverCheck } from '../_lib/face/scalp-check.ts';
import { buildElf, ELF_BUST, SCALP } from './build.ts';
import { ELF_CREASES } from './creases.ts';
import { hairline } from './hair.ts';
import { C, ELF_PROPORTIONS, SK } from './spec.ts';

export const elf_head = defineAsset({
  clips: headClips('face'),
  name: 'elf_head',
  kind: 'character',
  description:
    'Stylised elf bust: slender face, high cheekbones, almond eyes, long swept pointed ears with real ear structure, long hair as sculpted locks, gold-trimmed tunic, teal cloak, silver clasp',
  tags: ['character', 'fantasy', 'elf', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: [
    'recipes/elf_head/README.md (design dossier: proportions, exaggerations, palette)',
    'docs/research/head-analysis.md (human anchor ratios, Lee Perry-Smith scan, CC BY 3.0)',
  ],
  // Design spec (an invented character): overall size as built; the measure is the eye spacing.
  // (Width is the cloaked shoulders, sawn off at the shoulder point; length nose tip → the hair's fall.)
  real: {
    length: 0.283,
    width: 0.316,
    height: 0.573,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.064,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: 'interpupil 0.278 H (human 0.265 × 1.05) × 0.23 m',
      },
    ],
  },
  // LOD0: the head's skin ≈ 31k (head 28k, bust 2.7k), the hair cards ≈ 15k, tunic, cloak and
  // braid ≈ 20k.
  // Draws: skin, face-node cloth, static fittings, corneas, hair cards.
  budget: { triangles: [74000, 20000, 3400], draws: 5 },
  // The eyeballs' cornea (a clear lacquer over the painted iris) and the skin: the pore strip's
  // own roughness (matte cheeks, a glossier T-zone) under a soft grazing sheen. The silk and the
  // wool are strips of their own (../_lib/bust/cloth-strips.ts): smooth against matte, no finish.
  finishes: {
    cornea: { clearcoat: 1, clearcoatRoughness: 0.04 },
    skin: { sheen: { colour: '#a08c80', roughness: 0.45 } },
  },
  art: { focal: 'head', shape: 'friendly' },
  // Intended creases (QA `connections` skips them): one small region per sculpted fold, from the
  // geometry that sculpts it (creases.ts) — never an area.
  creases: ELF_CREASES,
  // Measured facial proportions against sourced bands (README "Proportions"), every LOD.
  checks: [
    proportionCheck('elf_head', SK, () => bustEdits(ELF_BUST, 2, 1).skin.field, ELF_PROPORTIONS),
    // No bare skin under the hair (D57): the scalp inside the hairline is the cap's gold.
    scalpCoverCheck({ part: 'head', line: hairline, hair: SCALP, skin: C.skin }),
  ],
  build(ctx) {
    buildElf(ctx);
  },
});
