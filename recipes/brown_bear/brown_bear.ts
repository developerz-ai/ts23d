// Brown bear — an adult male Eurasian brown bear (Ursus arctos arctos) standing on all fours, the
// wolf's ursid family member: `familyMember` takes the wolf spec's skeleton (recipes/wolf) and
// swaps in the ursid preset — plantigrade feet with five clawed toes, a broad dished head with
// round ears, a short thick neck, the shoulder hump, a barrel body with no tuck — at the bear's
// sourced numbers (README.md). Wikidata Q36341 (CC0) pins a mass; Wikipedia gives the ranges.

import {
  CREATURE_MATERIALS,
  type CreatureSpec,
  creaturePlan,
  defineMaterial,
  dmath,
  FAMILY_PRESETS,
  familyMember,
  hex,
  type Vec3,
} from '@developerz.ai/ts23d';
import { citeWikidata, crossCheck, quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { defineWildCreature, type Wild } from '../_lib/creature/wild.ts';
import { mix, smooth } from '../_lib/creature/wild-paint.ts';
import { pitched } from '../_lib/creature/wild-parts.ts';
import { WOLF } from '../wolf/wolf.ts';
import bearJson from './data/wikidata-Q36341.json';
import { bearGroom, HUMP } from './groom.ts';
import { bearHead, earDisc } from './head.ts';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

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
const EAR = (() => {
  const h = creaturePlan(BEAR).bones.head;
  const lc = (1 - (BEAR.face?.muzzle ?? 0.33)) * h.length;
  const disc = earDisc({ L: h.length, W: h.width, H: h.height, lc });
  const p = pitched(h, disc.at);
  return { at: [h.atlas[0] + p[0], h.atlas[1] + p[1], h.atlas[2] + p[2]] as Vec3, r: disc.r };
})();

/**
 * A boar bear at the end of the salmon run: river mud to the elbows and hocks and smeared along
 * the belly, wet fur above it, the shoulder rubbed pale and thin on its marking tree, old fight
 * scars raked across the muzzle and the right shoulder, the coat on the flanks and breeches
 * matted. The coat itself is groom.ts.
 */
export const BEAR_WILD: Wild = {
  wear: (info) => {
    const H = info.bones.height;
    const fore = info.bones.legs.find((x) => x.name === 'fore');
    const hind = info.bones.legs.find((x) => x.name === 'hind');
    const shoulder = fore?.joints[0] ?? [0.82, 0.19, 0.7];
    const hip = hind?.joints[0] ?? [-0.53, 0.19, 0.85];
    const l = info.head;
    const muzzle = l.L - l.lc;
    const h = info.bones.head;
    const [c, s] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
    const onHead = (p: readonly [number, number, number]): [number, number, number] => [
      h.atlas[0] + c * p[0] + s * p[2],
      h.atlas[1] + p[1],
      h.atlas[2] - s * p[0] + c * p[2],
    ];
    const side = -(shoulder[1] + 0.12);
    return {
      seed: 36341,
      // Old scars on a dark coat: grey-pink skin, not white.
      scarColour: hex('#a98678'),
      // River clay: wet and dark on the paws, drying to a grey-brown crust at its ragged edge
      // on the forearms and shanks, splashed to the belly fringe.
      mud: { top: H * 0.34, colour: hex('#7a6853'), strength: 0.9 },
      damp: { top: H * 0.5, belly: H * 0.56, strength: 0.45 },
      matted: {
        zones: [
          { at: [(shoulder[0] + hip[0]) / 2, 0.25, H * 0.62], radius: H * 0.3 },
          { at: [hip[0] - 0.05, 0.25, H * 0.6], radius: H * 0.28 },
        ],
        strength: 0.7,
        width: 0.03,
      },
      patches: [
        // Rubbed on the marking tree: guard hair broken off, the paler underfur showing.
        {
          at: [shoulder[0] - 0.02, side, shoulder[2] + 0.16],
          radius: 0.2,
          colour: hex('#a88a68'),
          strength: 0.7,
        },
      ],
      scars: [
        {
          a: [shoulder[0] + 0.16, side, shoulder[2] + 0.02],
          b: [shoulder[0] - 0.04, side, shoulder[2] - 0.16],
          width: 0.02,
          axis: 1,
          reach: 0.14,
        },
        {
          a: [shoulder[0] + 0.2, side, shoulder[2] - 0.05],
          b: [shoulder[0] + 0.04, side, shoulder[2] - 0.2],
          width: 0.015,
          axis: 1,
          reach: 0.14,
        },
        {
          a: onHead([l.lc + muzzle * 0.05, -l.rt * 0.9, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.75, -l.rt * 0.25, l.zt + l.rt]),
          width: 0.008,
          axis: 2,
          reach: 0.07,
        },
        {
          a: onHead([l.lc + muzzle * 0.0, -l.rt * 0.45, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.5, l.rt * 0.1, l.zt + l.rt]),
          width: 0.008,
          axis: 2,
          reach: 0.07,
        },
      ],
    };
  },
  base: (info) => {
    const H = info.bones.height;
    const col = BEAR.colours;
    const [back, belly, legs] = [col.back ?? col.coat, col.belly ?? col.coat, col.legs ?? col.coat];
    const h = info.bones.head;
    const [cs, sn] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
    const lc = info.head.lc;
    return ({ p, n, c, lod, part }) => {
      if (part === 'head' || part === 'jaw' || part === 'head_fur') {
        // The face is the coat's brown; only the muzzle is paler (the kind's pale cheek and
        // brow zones made the whole head one tan). Head-local x: along the skull from the atlas.
        const d: Vec3 = [p[0] - h.atlas[0], p[1] - h.atlas[1], p[2] - h.atlas[2]];
        const x = cs * d[0] - sn * d[2];
        const lum = (c[0] + c[1] + c[2]) / 3;
        // Leather (nose, lips, eye rims) and the ears' dark hollows stay as painted.
        const fur = smooth(0.03, 0.08, lum);
        const face = fur * smooth(lc * 1.02, lc * 0.82, x);
        const k = mix(c, [col.coat[0] * 0.92, col.coat[1] * 0.9, col.coat[2] * 0.88], face * 0.75);
        // The muzzle, bridge included, is the paler tan a brown bear's face shows.
        return mix(k, col.muzzle ?? col.coat, fur * smooth(lc * 0.98, lc * 1.12, x) * 0.7);
      }
      if (lod !== 2 || part !== 'body') return c;
      // The far mesh's cells are 16 cm: the sculpt's per-vertex tone lands as angular light and
      // dark patches. Its coat is the bear's blocks: the grizzled back and hump, brown flanks,
      // the darker underside, near-black legs from the elbow and stifle down.
      let k = mix(col.coat, back, smooth(0.1, 0.6, n[2]) * smooth(H * 0.78, H * 0.92, p[2]));
      k = mix(k, belly, smooth(-0.1, -0.6, n[2]));
      const leg = smooth(H * 0.5, H * 0.34, p[2]) * smooth(0.05, 0.12, Math.abs(p[1]));
      k = mix(k, [legs[0] * 0.85, legs[1] * 0.85, legs[2] * 0.85], leg);
      return mix(k, c, 0.2);
    };
  },
  groom: bearGroom,
  // Locks 6 cm across (2.5 body cells), along the coat's lie, under the cards.
  locks: { size: 0.06, strength: 0.45, seed: 36341 },
  // Grizzled tips: the pale sheen a brown bear's coat shows against the light.
  sheen: [0.09, 0.07, 0.05],
};

export const brown_bear = defineWildCreature(
  {
    name: 'brown_bear',
    description:
      'Adult male Eurasian brown bear (Ursus arctos arctos) standing on all fours: 2.05 m head and body, 1.1 m at the shoulder, 400 kg; the grey wolf’s ursid family member — plantigrade, the shoulder hump, broad head, round ears',
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
    // The recipe's own ears (head.ts): the root in the crown fur and the hollow's rim are folds.
    creases: [1, -1].map((side) => ({
      name: `ear_${side > 0 ? 'l' : 'r'}`,
      part: 'head',
      at: [EAR.at[0], EAR.at[1] * side, EAR.at[2]] as Vec3,
      radius: EAR.r * 1.5,
      why: 'the ear disc rising out of the crown fur and the hollow inside it',
    })),
    // Cells set directly: 24 mm on the body and 11 mm on the head (the defaults, 21 and 8.5 mm,
    // spent 36 k triangles on a head the groom covers in cards); the far mesh a little finer
    // than the default, so the head keeps its dome and ears at the switch.
    options: { strip: FUR, cells: { body: [1.15, 1, 0.9], head: [1.3, 1, 0.8] }, head: bearHead },
    real: {
      length: 2.22,
      width: 0.71,
      height: 1.3,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.3,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'stable', grounded: true },
    // The scarred, rubbed right shoulder and the muddy forelegs to the lens, from standing height.
    hero: { azDeg: -48, elDeg: 12 },
  },
  BEAR_WILD,
);
