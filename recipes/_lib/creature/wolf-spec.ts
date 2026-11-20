// The grey wolf's dossier as data: the sourced numbers (recipes/wolf/README.md) and the creature
// spec built from them. Shared: the wolf recipe builds it, and the fox and the brown bear derive
// their specs from it with `familyMember` (a recipe may not import another asset's modules).

import { type CreatureSpec, hex } from '@developerz.ai/ts23d';

/** The real numbers (README table). */
export const WOLF_REAL = {
  /** Head + body, nose → tail root (105–160 cm total length; mid-sized adult). */
  headBody: 1.15,
  shoulder: 0.8,
  tail: 0.42,
  /** Adult mean ≈ 36–38.5 kg; males 40. */
  mass: 40,
  /** Skull 230–280 mm; the furred head ≈ +1 cm: a large male's 280 mm skull. */
  head: 0.29,
  /** Ear height 90–110 mm: the short end, its root in the winter ruff. */
  ear: 0.09,
} as const;

export const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  // Canid defaults: orbit convergence 50.4° (Heesy 2004, Canis), 5 digits fore (the dewclaw) and
  // 4 hind, fore share 55–66 % (dogs 60.4 %): docs/research/animal-anatomy.md.
  family: 'canid',
  stance: 'digitigrade',
  mass: WOLF_REAL.mass,
  length: WOLF_REAL.headBody,
  height: WOLF_REAL.shoulder,
  head: WOLF_REAL.head,
  // Atlas → C7 along the neck (estimate from skeleton photos, unverified); short under the winter
  // ruff, so the bigger head stays over the forelegs (fore share ≤ 66 %).
  neck: 0.23,
  tail: WOLF_REAL.tail,
  // Chest depth just over ½ the withers (a wolf is deeper through the chest than a coyote; the
  // elbow at the chest floor), a narrow chest (0.54 × depth keeps the coated width at the sourced
  // 0.29 m), the waist tucked under the winter coat; sturdy legs (1.15 × the allometric limb:
  // thinner forearms read spindly under the coat; past 1.15 the limbs outweigh the Campione &
  // Evans band for 40 kg, and past ≈ 1.2 the far LOD2 wrist fails `deform`);
  // bushy winter tail; the shoulder/neck mane (110–130 mm hair).
  // The hock at ¼ of the withers (the kind's digitigrade default 0.28 gave a long hind cannon:
  // README skeleton photos put the calcaneus at ≈ 20 cm on an 80 cm wolf).
  build: {
    depth: 0.54,
    width: 0.5,
    limbs: 1.15,
    tailGirth: 3.2,
    ruff: 0.052,
    tuck: 0.78,
    track: 0.31,
    hock: 0.25,
    // Standing square: the hock 0.07 of the trunk behind the hip (the default 0.13 is a dog
    // stretched; with the broader head it put 67 % of the weight on the forelegs).
    heel: 0.04,
    // A level back: the croup's muscle mass raised (side photos: withers and croup within ~3 cm
    // on a standing wolf; without it the sculpt fell 6 cm from shoulder to hip, a hyena's line).
    topline: [{ at: 0.18, rise: 0.08, span: 0.5, width: 0.85 }],
  },
  face: {
    preset: 'canid',
    // Stop → nose ≈ 0.43 of the furred head in side photos (the forehead fur and the ruff shorten
    // it from the skull's 0.48); the cheek ruff and the deep muzzle cone shorten its read again:
    // 0.39 still read as a coyote's long thin snout.
    muzzle: 0.36,
    // Skull 130–150 mm wide on 230–280 mm long: 0.55 (a big male's 150 on 270); the winter coat
    // over the zygomata and the cheek ruff add ~2.3 cm a side: 0.72 of the furred head (a broad
    // wedge, the wolf's mark against the coyote's 0.5; 0.66 still read narrow).
    width: 0.72,
    // Nose pad ≈ 4 cm wide and a deep, blunt muzzle end (a slim tip read as a coyote's).
    tip: 0.15,
    stop: 0.27,
    // A full winter ruff (≥ 0.15 grows the lifted ruff cards); more than 0.16 on this broader
    // skull carries the cheek locks past the sourced 0.29 m width.
    cheek: 0.16,
    ears: 'erect',
    earLength: WOLF_REAL.ear / WOLF_REAL.head,
    // Short, broad-based and thick with fur: a wolf's ear is nearly as wide as it is tall.
    earWidth: 1.4,
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
  pose: { head: 14, neck: 44, tail: 'hang' },
};
