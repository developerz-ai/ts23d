// Stylised elf bust — an original design in the fantasy-MMO idiom (no specific character): the
// measured human proportions made slender (narrow jaw, pointed chin, high cheekbones, refined
// nose, almond eyes) with long pointed ears built on human ear anatomy (helix, antihelix, concha,
// tragus, lobe) and the helix drawn out to a swept point; long pale-gold hair as sculpted locks
// falling behind the ears; green gold-trimmed tunic with a high collar, teal cloak, silver clasp;
// a turned plinth. Sculpted by the shared bust library; dossier: recipes/elf_head/README.md.

import { defineAsset } from '@developerz.ai/ts23d';
import { buildElf } from './build.ts';
import { ELF_CREASES } from './creases.ts';

export const elf_head = defineAsset({
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
  real: {
    length: 0.247,
    width: 0.491,
    height: 0.559,
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
  budget: { triangles: [100000, 32000, 4200] },
  finishes: { cornea: { clearcoat: 1, clearcoatRoughness: 0.04 } },
  art: { focal: 'head', shape: 'friendly' },
  // Intended creases (QA `connections` skips them): one small region per sculpted fold, from the
  // geometry that sculpts it (creases.ts) — never an area.
  creases: ELF_CREASES,
  build(ctx) {
    buildElf(ctx);
  },
});
