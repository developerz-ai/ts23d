// The red fox's dossier as data: Wikidata Q8332's shoulder height, the sourced numbers
// (README.md) and the creature spec, the grey wolf's canid family member via `familyMember`.

import { type CreatureSpec, familyMember, hex } from '@developerz.ai/ts23d';
import { quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { WOLF } from '../_lib/creature/wolf-spec.ts';
import foxJson from './data/wikidata-Q8332.json';

export const FOX_DATA = readWikidata(foxJson, 'data/wikidata-Q8332.json');

/** The real numbers (README table). */
export const REAL = {
  /** Head + body 45–90 cm (Wikipedia: Red fox); a good-sized adult dog fox. */
  headBody: 0.74,
  /** Shoulder 35–50 cm; Wikidata Q8332 P2048 = 0.425 m. */
  shoulder: quantity(FOX_DATA, 'height'),
  /** Tail 30–55.5 cm, "longer than half the body length". */
  tail: 0.42,
  /** 2.2–14 kg; vixens 15–20 % lighter. */
  mass: 7.5,
  /** Male skull 129–167 mm; the furred head ≈ +1 cm. */
  head: 0.17,
  /** Ears 7.7–12.5 cm: big for the head, the fox's mark beside a wolf or coyote. */
  ear: 0.11,
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
    face: {
      preset: 'canid',
      muzzle: 0.5,
      // Cheek fur flares the winter face into a wedge: broad behind the eyes, the muzzle fine.
      width: 0.56,
      cheek: 0.16,
      stop: 0.2,
      ears: 'erect',
      // `overrides.face` replaces the member's face, so the sourced ear is restated here.
      earLength: REAL.ear / REAL.head,
      // Thin shells to a sharp tip.
      earWidth: 1.0,
      pupil: 'slit',
    },
    // A shallower, lighter chest than the wolf's. The brush's fullness is long card fur
    // (FOX_WILD.coat), not flesh: a thicker tail chain weighs as solid and tips the balance onto
    // the hind feet (fore share under 55 %). The winter coat fills the waist's tuck (0.88) and
    // thickens the stockings (limbs 1.06 × the bare allometric limb; the body cell follows the
    // limb, which brings LOD0 inside the creature band's 150 k).
    build: { depth: 0.53, width: 0.6, limbs: 1.1, tailGirth: 3.3, ruff: 0.03, tuck: 0.84 },
    // Atlas → C7 scaled from a wolf's skeleton (0.28 m on 1.15 m head-body; the wolf recipe
    // carries its own neck shorter under the winter ruff).
    neck: (0.25 * REAL.headBody) / 1.15,
    coat: 0.026,
    // A fox's coat is an even pile: more of the kind's short undercoat cards, a third of its
    // long guard locks (at the wolf's 520 per m² they stood off this small body as stray wires).
    fur: { density: 2600, guard: 170 },
    pose: { head: 10, neck: 36, tail: 'level' },
  },
});
