// The brown bear's dossier as data: Wikidata Q36341's mass cross-checked against the sourced
// numbers (README.md), the creature spec (the grey wolf's ursid family member via `familyMember`)
// and where the recipe's own ear discs sit.

import {
  type CreatureSpec,
  creaturePlan,
  FAMILY_PRESETS,
  familyMember,
  hex,
  type Vec3,
} from '@developerz.ai/ts23d';
import { crossCheck, quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { pitched } from '../_lib/creature/wild-parts.ts';
import { WOLF } from '../_lib/creature/wolf-spec.ts';
import bearJson from './data/wikidata-Q36341.json';
import { HUMP } from './groom.ts';
import { earDisc } from './head.ts';

export const BEAR_DATA = readWikidata(bearJson, 'data/wikidata-Q36341.json');

/** The real numbers (README table). */
export const REAL = {
  /** Head + body 1.0–2.8 m (Wikipedia: Brown bear); a mid-sized adult male. */
  headBody: 2.05,
  /** Shoulder up to 1.5 m; a male on all fours ≈ 1.1 (README: photo-measured, estimate). */
  shoulder: 1.1,
  /** Tail 6–22 cm. */
  tail: 0.12,
  /** Eurasian males average 350–500 kg (Wikipedia: Eurasian brown bear); 400 declared. */
  mass: 400,
  /** Male skull 31.5–45.5 cm (Russian bears); nose leather and the occiput's fur add ≈ 4.5 cm
   *  to the top of that range. */
  head: 0.5,
  /** Ear ≈ 12–14 cm with its fur (estimate from photos, unverified). */
  ear: 0.14,
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
    // A darker brown muzzle than the cheeks (a tan one read as a plastic mask).
    muzzle: hex('#755638'),
    tip: hex('#3a281b'),
    nose: hex('#141110'),
    iris: hex('#3a2414'),
    // Horn-brown claws, darker than the pale tips older photos show (they read on muddy paws).
    keratin: hex('#8a7a64'),
  },
  // Guard-hair tips grizzle the coat: pale-tipped hairs dense on the hump and flanks.
  pattern: { kind: 'agouti', scale: 0.02, coverage: 0.3, seed: 7 },
  overrides: {
    coat: 0.045,
    // Zygomatic width 17.5–27.7 cm on a 31.5–45.5 cm skull (Wikipedia: Brown bear): ≈ 0.6 bare;
    // a big male's 27.7 cm plus the cheek fur gives 0.72 of the furred head. The muzzle is under a third of the
    // head, short and blunt with a broad nose pad, under a dished forehead (a longer, narrower
    // one read as a wolverine).
    face: {
      ...FAMILY_PRESETS.ursid.face,
      // Up to 27.7 cm across the zygomata on a 45 cm skull, + ~2.5 cm of cheek fur a side.
      width: 0.8,
      muzzle: 0.33,
      // A deep blunt muzzle end with a broad nose pad (≈ 8 cm).
      tip: 0.155,
      stop: 0.3,
      cheek: 0.22,
      // The ears are the recipe's own thick discs (head.ts): the kind's cupped blade is thinner
      // than this head's sculpt cell.
      ears: 'none',
    },
    build: {
      ...FAMILY_PRESETS.ursid.build,
      // 6 cm of mane on the nape (`ruff` thickens it from the withers forward; the hump is no
      // longer faked with it).
      ruff: 0.06,
      // The hump: the long-fibred muscle over the scapulae that powers digging, a mass 7 % of
      // the shoulder height proud of the back just behind the withers (groom.ts stands the
      // mane on it), so the back slopes from hump to rump.
      topline: [{ at: HUMP.at, rise: HUMP.rise, span: 0.34, width: 0.75 }],
      // Plantigrade: the heel all but under the hip (the kind's default trails it 0.13 of the
      // trunk, a dog's stretched stance; at 0 the forelegs carry under 55 % of the weight).
      heel: 0.025,
      // Forearms and shanks 17 % over the bare allometric limb, and the legs set that much
      // closer to the midline: the stance stays inside the sourced 0.70 m.
      limbs: 1.17,
      track: 0.3,
      // A chest 0.56 of the shoulder height deep (the preset's 0.6 left legs 0.4 H long: a
      // dachshund's bear), as broad as before (0.9 × the depth).
      depth: 0.56,
      width: 0.9,
    },
    // Every lock is placed by groom.ts.
    cards: false,
    // A short thick neck, the head carried low off the hump.
    neck: 0.2,
  },
});

/** The left ear disc's centre in the asset frame and its radius (head.ts sculpts it). */
export const EAR = (() => {
  const h = creaturePlan(BEAR).bones.head;
  const lc = (1 - (BEAR.face?.muzzle ?? 0.33)) * h.length;
  const disc = earDisc({ L: h.length, W: h.width, H: h.height, lc });
  const p = pitched(h, disc.at);
  return { at: [h.atlas[0] + p[0], h.atlas[1] + p[1], h.atlas[2] + p[2]] as Vec3, r: disc.r };
})();
