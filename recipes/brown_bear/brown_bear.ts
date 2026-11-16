// Brown bear — an adult male Eurasian brown bear (Ursus arctos arctos) standing on all fours, the
// wolf's ursid family member: `familyMember` takes the wolf spec's skeleton (recipes/wolf) and
// swaps in the ursid preset — plantigrade feet with five clawed toes, a broad dished head with
// round ears, a short thick neck, the shoulder hump, a barrel body with no tuck — at the bear's
// sourced numbers (README.md). Wikidata Q36341 (CC0) pins a mass; Wikipedia gives the ranges.

import {
  CREATURE_MATERIALS,
  type CreatureSpec,
  defineCreature,
  defineMaterial,
  FAMILY_PRESETS,
  familyMember,
  hex,
} from '@developerz.ai/ts23d';
import { citeWikidata, crossCheck, quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { WOLF } from '../wolf/wolf.ts';
import bearJson from './data/wikidata-Q36341.json';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

export const BEAR_DATA = readWikidata(bearJson, 'data/wikidata-Q36341.json');

/** The real numbers (README table). */
export const REAL = {
  /** Head + body 1.0–2.8 m (Wikipedia: Brown bear); a mid-sized adult male. */
  headBody: 2.1,
  /** Shoulder up to 1.5 m; a male on all fours ≈ 1.1 (README: photo-measured, estimate). */
  shoulder: 1.1,
  /** Tail 6–22 cm. */
  tail: 0.12,
  /** Eurasian males average 350–500 kg (Wikipedia: Eurasian brown bear); 400 declared. */
  mass: 400,
  /** Male skull 31.5–45.5 cm (Russian bears); the furred head ≈ +3 cm. */
  head: 0.45,
  /** Ear ≈ 12–14 cm with its fur (estimate from photos, unverified). */
  ear: 0.13,
} as const;

/** Wikidata's single mass (500 kg, no qualifier) is the top of the male average: within 25 %. */
export const MASS_CONFLICTS = crossCheck(BEAR_DATA, { mass: REAL.mass }, 0.25);
export const WIKIDATA_MASS = quantity(BEAR_DATA, 'mass');

export const BEAR: CreatureSpec = familyMember(WOLF, {
  family: 'ursid',
  mass: REAL.mass,
  length: REAL.headBody,
  height: REAL.shoulder,
  tail: REAL.tail,
  head: REAL.head,
  ear: REAL.ear,
  colours: {
    coat: hex('#6b4a2e'),
    back: hex('#5e4026'),
    belly: hex('#4a3322'),
    legs: hex('#2a1c13'),
    muzzle: hex('#8f6e4e'),
    tip: hex('#3a281b'),
    nose: hex('#141110'),
    iris: hex('#3a2414'),
    keratin: hex('#b9ad98'),
  },
  // Guard-hair tips grizzle the coat: pale-tipped hairs dense on the hump and flanks.
  pattern: { kind: 'agouti', scale: 0.02, coverage: 0.3, seed: 7 },
  overrides: {
    coat: 0.045,
    // Zygomatic width 17.5–27.7 cm on a 31.5–45.5 cm skull (Wikipedia: Brown bear): ≈ 0.6.
    face: { ...FAMILY_PRESETS.ursid.face, width: 0.62, muzzle: 0.38 },
    build: { ...FAMILY_PRESETS.ursid.build, ruff: 0.045 },
  },
});

export const brown_bear = defineCreature({
  name: 'brown_bear',
  description:
    'Adult male Eurasian brown bear (Ursus arctos arctos) standing on all fours: 2.1 m head and body, 1.1 m at the shoulder, 400 kg; the grey wolf’s ursid family member — plantigrade, the shoulder hump, broad head, round ears',
  tags: ['creature', 'animal', 'mammal', 'ursid', 'bear', 'family-member', 'sculpt'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/Brown_bear (head-body, shoulder, tail, mass range, skull, claws, hump)',
    'https://en.wikipedia.org/wiki/Eurasian_brown_bear (male mass 350–500 kg, coat colour)',
    citeWikidata(BEAR_DATA),
    'recipes/wolf (family base: skeleton) via familyMember, ursid preset',
    'recipes/brown_bear/README.md (dossier, photos per view)',
  ],
  spec: BEAR,
  options: { strip: FUR },
  real: {
    length: 2.3,
    width: 0.7,
    height: 1.25,
    tolerance: 0.05,
    mass: REAL.mass,
    massTolerance: 0.3,
  },
  budget: { triangles: [170000, 35000, 4000] },
  art: { focal: 'head', shape: 'stable', grounded: true },
});
