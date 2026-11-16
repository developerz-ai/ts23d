// Red fox — an adult Vulpes vulpes standing alert in winter coat, the wolf's canid family member:
// the wolf spec (recipes/wolf) supplies the skeleton, build and face; `familyMember` scales them
// to the fox's sourced numbers (README.md) with head-body allometry. Wikidata Q8332 (CC0) pins the
// shoulder height; the rest is cited from Wikipedia: Red fox. What makes it a fox and not a small
// wolf is here: the long white-tipped brush, big black-backed ears, slim muzzle, black stockings.

import {
  CREATURE_MATERIALS,
  type CreatureSpec,
  defineCreature,
  defineMaterial,
  familyMember,
  hex,
} from '@developerz.ai/ts23d';
import { citeWikidata, quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { WOLF } from '../wolf/wolf.ts';
import foxJson from './data/wikidata-Q8332.json';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

export const FOX_DATA = readWikidata(foxJson, 'data/wikidata-Q8332.json');

/** The real numbers (README table). */
export const REAL = {
  /** Head + body 45–90 cm (Wikipedia: Red fox); a mid-sized adult dog fox. */
  headBody: 0.68,
  /** Shoulder 35–50 cm; Wikidata Q8332 P2048 = 0.425 m. */
  shoulder: quantity(FOX_DATA, 'height'),
  /** Tail 30–55.5 cm, "longer than half the body length". */
  tail: 0.42,
  /** 2.2–14 kg; vixens 15–20 % lighter. */
  mass: 6,
  /** Male skull 129–167 mm; the furred head ≈ +1 cm. */
  head: 0.16,
  /** Ears 7.7–12.5 cm. */
  ear: 0.095,
} as const;

export const FOX: CreatureSpec = familyMember(WOLF, {
  family: 'canid',
  mass: REAL.mass,
  length: REAL.headBody,
  height: REAL.shoulder,
  tail: REAL.tail,
  head: REAL.head,
  ear: REAL.ear,
  colours: {
    coat: hex('#b6552a'),
    back: hex('#9a4824'),
    belly: hex('#d4b597'),
    // Rusty upper limbs, black paws: the "stockings" start below the elbow and hock.
    legs: hex('#2b211c'),
    muzzle: hex('#ece5d8'),
    tip: hex('#1d1714'),
    tailTip: hex('#efe9df'),
    nose: hex('#141110'),
    iris: hex('#c88a22'),
    keratin: hex('#2a2420'),
  },
  overrides: {
    // The fox's slim face and big ears, vertical slit pupils (Wikipedia: Red fox, "Senses").
    face: { preset: 'canid', muzzle: 0.52, width: 0.5, ears: 'erect', pupil: 'slit' },
    // A shallower, lighter chest than the wolf's; the brush is the fullest part of the outline.
    build: { depth: 0.48, width: 0.64, limbs: 1, tailGirth: 3.3, ruff: 0.015, tuck: 0.7 },
    coat: 0.022,
    pose: { head: 10, neck: 36, tail: 'level' },
  },
});

export const fox = defineCreature({
  name: 'fox',
  description:
    'Adult red fox (Vulpes vulpes) standing alert in winter coat: 0.68 m head and body, 0.42 m brush, 0.425 m at the shoulder, 6 kg; the grey wolf’s canid family member, scaled from its skeleton',
  tags: ['creature', 'animal', 'mammal', 'canid', 'fox', 'family-member', 'sculpt'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/Red_fox (head-body, tail, shoulder, mass, skull, ears, coat)',
    citeWikidata(FOX_DATA),
    'recipes/wolf (family base: skeleton, build, face) via familyMember',
    'recipes/fox/README.md (dossier, photos per view)',
  ],
  spec: FOX,
  options: { strip: FUR },
  real: {
    length: 1.11,
    width: 0.16,
    height: 0.52,
    tolerance: 0.05,
    mass: REAL.mass,
    massTolerance: 0.3,
  },
  budget: { triangles: [160000, 30000, 4000] },
  art: { focal: 'head', shape: 'friendly', grounded: true },
});
