// Grey wolf — an adult Eurasian wolf (Canis lupus lupus) standing relaxed in winter coat, built
// with the `creature` kind from a handful of sourced numbers (README.md: measurements, coat logic,
// photos per view). Everything else — skeleton landmarks, digitigrade legs, allometric limb
// thickness, head with seated eyes and grown ears, coat zones, creases, densities, balance — is
// the kind's job; this file is the dossier as data.

import {
  CREATURE_MATERIALS,
  type CreatureInfo,
  type CreatureSpec,
  defineMaterial,
  hex,
  type Vec3,
} from '@developerz.ai/ts23d';
import { defineWildCreature, type Wild } from '../_lib/creature/wild.ts';
import { mix, smooth } from '../_lib/creature/wild-paint.ts';

// D24: a neutral-albedo fur strip, so the grizzled grey/ochre vertex colour is not muddied.
const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

/** The real numbers (README table). */
export const REAL = {
  /** Head + body, nose → tail root (105–160 cm total length; mid-sized adult). */
  headBody: 1.15,
  shoulder: 0.8,
  tail: 0.42,
  /** Adult mean ≈ 36–38.5 kg; males 40. */
  mass: 40,
  /** Skull 230–280 mm; the furred head ≈ +1 cm: a large male's 270 mm skull. */
  head: 0.275,
  /** Ear height 90–110 mm: the short end, half buried in the winter ruff. */
  ear: 0.09,
} as const;

export const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  // Canid defaults: orbit convergence 50.4° (Heesy 2004, Canis), 5 digits fore (the dewclaw) and
  // 4 hind, fore share 55–66 % (dogs 60.4 %): docs/research/animal-anatomy.md.
  family: 'canid',
  stance: 'digitigrade',
  mass: REAL.mass,
  length: REAL.headBody,
  height: REAL.shoulder,
  head: REAL.head,
  // Atlas → C7 along the neck (estimate from skeleton photos, unverified); short under the winter
  // ruff, so the bigger head stays over the forelegs (fore share ≤ 66 %).
  neck: 0.25,
  tail: REAL.tail,
  // Chest depth just over ½ the withers (a wolf is deeper through the chest than a coyote; the
  // elbow at the chest floor), a narrow chest (0.54 × depth keeps the coated width at the sourced
  // 0.29 m), the waist tucked under the winter coat; sturdy legs (1.07 × the allometric limb);
  // bushy winter tail; the shoulder/neck mane (110–130 mm hair).
  // The hock at ¼ of the withers (the kind's digitigrade default 0.28 gave a long hind cannon:
  // README skeleton photos put the calcaneus at ≈ 20 cm on an 80 cm wolf).
  build: {
    depth: 0.51,
    width: 0.54,
    limbs: 1.07,
    tailGirth: 3.2,
    ruff: 0.045,
    tuck: 0.76,
    hock: 0.25,
    // Standing square: the hock 0.07 of the trunk behind the hip (the default 0.13 is a dog
    // stretched; with the broader head it put 67 % of the weight on the forelegs).
    heel: 0.07,
  },
  face: {
    preset: 'canid',
    // Stop → nose ≈ 0.43 of the furred head in side photos (the forehead fur and the ruff shorten
    // it from the skull's 0.48): a longer muzzle on this head read as a coyote.
    muzzle: 0.41,
    // Skull 130–150 mm wide on 230–280 mm long: 0.55 (a big male's 150 on 270); the winter coat
    // over the zygomata adds ~1.2 cm a side: 0.64 of the furred head (a broad wedge, the wolf's
    // mark against the coyote's 0.5).
    width: 0.64,
    // Nose pad ≈ 4 cm wide and a deep, blunt muzzle end (a slim tip read as a coyote's).
    tip: 0.128,
    stop: 0.24,
    // A full winter ruff (≥ 0.15 grows the lifted ruff cards); more than 0.16 on this broader
    // skull carries the cheek locks past the sourced 0.29 m width.
    cheek: 0.16,
    ears: 'erect',
    earLength: REAL.ear / REAL.head,
    pupil: 'round',
    fangs: true,
  },
  surface: 'fur',
  // Winter guard hair 60–70 mm on the back lies flat: ≈ 3 cm effective shell over the skin.
  coat: 0.03,
  colours: {
    // Tawny-grey flanks and legs under a grizzled dark saddle; cream belly, throat, cheeks and
    // muzzle sides; a tawny bridge (README colour notes, reference photos).
    coat: hex('#a48e72'),
    back: hex('#5e564d'),
    // Warm cream: a neutral grey-white went lilac under the cool key light.
    belly: hex('#e6d8bc'),
    legs: hex('#b49874'),
    muzzle: hex('#eadfc8'),
    bridge: hex('#a8845e'),
    tip: hex('#1e1b18'),
    nose: hex('#141110'),
    iris: hex('#c8902a'),
    keratin: hex('#2a2420'),
    mark: hex('#26221f'),
    // The dark line down the front of the forelegs and the grey mask round the eyes.
    foreline: hex('#6a5e52'),
    mask: hex('#4e4842'),
  },
  // Agouti grizzle: banded guard hairs, dark tips dense on the saddle, none on the belly.
  pattern: { kind: 'agouti', scale: 0.012, coverage: 0.45, seed: 41 },
  // Head carried a little up and back off the shoulders: alert, and the balance stays canid.
  pose: { head: 12, neck: 42, tail: 'hang' },
};

/** Head-local point (+X to the nose, origin at the atlas) → world. */
const onHead = (info: CreatureInfo, p: Vec3): Vec3 => {
  const h = info.bones.head;
  const [c, s] = [Math.cos(h.pitch), Math.sin(h.pitch)];
  return [h.atlas[0] + c * p[0] + s * p[2], h.atlas[1] + p[1], h.atlas[2] - s * p[0] + c * p[2]];
};

/**
 * The wolf's season outdoors: thaw mud caked on the paws and splashed up the cannons, wet darker
 * fur to the hocks and under the belly, the flank and breeches matted into clumps, an old bite
 * scar across the right shoulder and a claw line down the right side of the muzzle, the left ear
 * nicked. At LOD2 the coarse cells lose the saddle: it is painted back as one dark block.
 */
export const WOLF_WILD: Wild = {
  wear: (info) => {
    const H = info.bones.height;
    const fore = info.bones.legs.find((l) => l.name === 'fore');
    const hind = info.bones.legs.find((l) => l.name === 'hind');
    const shoulder = fore?.joints[0] ?? [0.38, 0.075, 0.56];
    const hip = hind?.joints[0] ?? [-0.24, 0.075, 0.65];
    const l = info.head;
    const muzzle = l.L - l.lc;
    return {
      seed: 41,
      mud: { top: H * 0.2, colour: hex('#43352a'), strength: 0.88 },
      damp: { top: H * 0.36, belly: H * 0.62, strength: 0.34 },
      matted: {
        zones: [
          { at: [(shoulder[0] + hip[0]) / 2, 0.1, H * 0.66], radius: H * 0.24 },
          { at: [hip[0] - 0.03, 0.1, H * 0.6], radius: H * 0.2 },
          { at: [shoulder[0] + 0.02, 0.1, H * 0.55], radius: H * 0.16 },
        ],
        strength: 0.6,
      },
      scars: [
        {
          a: [shoulder[0] + 0.07, -0.12, shoulder[2] + 0.1],
          b: [shoulder[0] - 0.06, -0.12, shoulder[2] - 0.03],
          width: 0.006,
          axis: 1,
          reach: 0.07,
        },
        {
          a: [shoulder[0] + 0.035, -0.12, shoulder[2] + 0.105],
          b: [shoulder[0] - 0.05, -0.12, shoulder[2] + 0.03],
          width: 0.004,
          axis: 1,
          reach: 0.07,
        },
        {
          a: onHead(info, [l.lc + muzzle * 0.15, -l.rt * 0.75, l.zt + l.rt]),
          b: onHead(info, [l.lc + muzzle * 0.7, -l.rt * 0.35, l.zt + l.rt]),
          width: 0.0035,
          axis: 2,
          reach: 0.035,
        },
      ],
    };
  },
  base: (info) => {
    const H = info.bones.height;
    const back = WOLF.colours.back ?? WOLF.colours.coat;
    const legs = WOLF.colours.legs ?? WOLF.colours.coat;
    return ({ p, n, c, lod, part }) => {
      if (lod !== 2 || part !== 'body') return c;
      // The grizzled saddle as one block: up-facing trunk above the elbows, withers to croup.
      const k = smooth(0, 0.5, n[2]) * smooth(H * 0.58, H * 0.74, p[2]);
      // The leg tubes carry one colour per joint ring: the elbow and stifle rings sample the pale
      // inner thigh, so the whole tube went cream. Below the trunk the leg takes its tawny.
      const leg = smooth(H * 0.56, H * 0.4, p[2]) * smooth(0.02, 0.05, Math.abs(p[1]));
      return mix(mix(c, back, k * 0.9), [legs[0] * 0.8, legs[1] * 0.8, legs[2] * 0.8], leg);
    };
  },
  coat: (info) => {
    const H = info.bones.height;
    return {
      density: 2300,
      length: 0.03,
      width: 0.008,
      // Flanks, shoulders and haunches: the smooth painted skin between the kind's guard-hair
      // zones. Not the underside (the fringe hangs there) nor the legs below the elbow.
      where: (p, n) => smooth(H * 0.48, H * 0.58, p[2]) * smooth(-0.35, 0.05, n[2]),
    };
  },
  whiskers: { count: 12, length: 0.085, radius: 0.0011, colour: [0.82, 0.8, 0.74] },
  nick: 1,
  // Pale guard-hair tips catching the light.
  sheen: [0.12, 0.11, 0.09],
};

export const wolf = defineWildCreature(
  {
    name: 'wolf',
    description:
      'Adult grey wolf (Canis lupus lupus) standing relaxed in winter coat: 1.15 m head and body, 0.42 m tail, 0.80 m at the shoulder, 40 kg; built with the creature kind from sourced numbers',
    tags: ['creature', 'animal', 'mammal', 'canid', 'wolf', 'sculpt'],
    license: 'CC0-1.0',
    sources: [
      'https://en.wikipedia.org/wiki/Wolf (length, shoulder height, tail, mass, skull, ears, fur, colour; after Heptner & Naumov 1998, Mech 1970)',
      'Campione & Evans 2012, BMC Biology 10:60 (limb allometry, via the creature kind)',
      'recipes/wolf/README.md (dossier, photos per view)',
    ],
    spec: WOLF,
    // Cells set directly: the default (0.165 × the limb radius, 8.4 mm) spent 74 k triangles on
    // smooth flanks under the cards; 10 mm on the body and 5.1 mm on the head hold every form.
    options: { strip: FUR, cells: { body: [1.2, 1, 1], head: [1.1, 1, 1] } },
    // Overall box measured off the posed skeleton (nose → hanging tail, paws → ear tips). Width is
    // the coated width: the README's 0.27 m is the body; winter guard hair (60–70 mm mid-back, up to 110–130 mm on the mane;
    // README coat table) stands ~1 cm proud on each flank, so the outline is ~0.29 m.
    real: {
      length: 1.31,
      width: 0.29,
      height: 0.9,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.25,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'friendly', grounded: true },
  },
  WOLF_WILD,
);
