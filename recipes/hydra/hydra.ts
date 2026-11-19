// Hydra: an original five-necked reptile on four legs, designed from the anatomy of real animals
// (README.md: which animal lends each part, with numbers; everything else is a design value).
// A body plan: trunk, tail, four mirrored legs, five necks each carrying a sculpted head and jaw.

import { bodyPlan, defineBodyPlan, hydraClips } from '@developerz.ai/ts23d';
import {
  BODY_CREASES,
  HEAD_IDS,
  HYDRA_SPEC,
  JAW_IDS,
  LEG_FEET,
  NECK_IDS,
  NECKS,
} from './anatomy.ts';
import { headCreases, hydraHeads } from './head.ts';
import { hydraArmour, hydraFeet } from './limbs.ts';
import { SCALES } from './material.ts';

export const HYDRA_PLAN = bodyPlan(HYDRA_SPEC);

export const hydra = defineBodyPlan({
  name: 'hydra',
  description:
    'Original five-necked reptile on four legs: heavy monitor-lizard body under big glossy scales with dark saddles, crocodilian belly scutes, five distinct horned heads with jaws, teeth and tongues; river mud up the legs, a claw-raked neck, a bitten flank and a broken horn.',
  tags: ['creature', 'fantasy', 'reptile', 'hydra', 'many-necked', 'body-plan'],
  sources: [
    'https://en.wikipedia.org/wiki/Komodo_dragon',
    'https://en.wikipedia.org/wiki/Giraffe',
    'https://biodiversityadvisor.sanbi.org/search/detail/80956',
    'https://commons.wikimedia.org/wiki/Category:Varanus_komodoensis',
  ],
  // The design's own measured box (README): pins the proportions, measures no animal.
  real: { length: 7.71, width: 5.16, height: 4.24 },
  plan: HYDRA_PLAN,
  colours: { back: '#3a4230', belly: '#c9b98a' },
  strip: SCALES,
  paint: { skin: [1, 1, 1] },
  // LOD0 spends its triangles on heads and feet; the scales live in the strip, not the rings.
  budget: { triangles: [215000, 46000, 7500] },
  creases: [...BODY_CREASES, ...Array.from({ length: NECKS }, (_, k) => headCreases(k)).flat()],
  clips: hydraClips(HYDRA_PLAN, {
    necks: NECK_IDS,
    heads: HEAD_IDS,
    jaws: JAW_IDS,
    legs: [...LEG_FEET],
    seed: 5,
  }),
  detail: (ctx, _plan, kit) => {
    hydraHeads(ctx, kit);
    hydraFeet(ctx, kit);
    hydraArmour(ctx, kit);
  },
});
