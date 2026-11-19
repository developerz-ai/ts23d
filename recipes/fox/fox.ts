// Red fox — an adult Vulpes vulpes standing alert in winter coat, the wolf's canid family member:
// the wolf spec (recipes/wolf) supplies the skeleton, build and face; `familyMember` scales them
// to the fox's sourced numbers (README.md) with head-body allometry. Wikidata Q8332 (CC0) pins the
// shoulder height; the rest is cited from Wikipedia: Red fox. What makes it a fox and not a small
// wolf is here: the long white-tipped brush, big black-backed ears, slim muzzle, black stockings.

import {
  CREATURE_MATERIALS,
  type CreatureSpec,
  defineMaterial,
  familyMember,
  hex,
} from '@developerz.ai/ts23d';
import { citeWikidata, quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { defineWildCreature, type Wild } from '../_lib/creature/wild.ts';
import { mix, nearChain, smooth } from '../_lib/creature/wild-paint.ts';
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
    face: { preset: 'canid', muzzle: 0.52, width: 0.5, ears: 'erect', pupil: 'slit' },
    // A shallower, lighter chest than the wolf's. The brush's fullness is long card fur
    // (FOX_WILD.coat), not flesh: a thicker tail chain weighs as solid and tips the balance onto
    // the hind feet (fore share under 55 %). The winter coat fills the waist's tuck (0.88) and
    // thickens the stockings (limbs 1.06 × the bare allometric limb; the body cell follows the
    // limb, which brings LOD0 inside the creature band's 150 k).
    build: { depth: 0.48, width: 0.62, limbs: 1.06, tailGirth: 3.3, ruff: 0.022, tuck: 0.88 },
    // Atlas → C7 scaled from a wolf's skeleton (0.28 m on 1.15 m head-body; the wolf recipe
    // carries its own neck shorter under the winter ruff).
    neck: (0.28 * REAL.headBody) / 1.15,
    coat: 0.022,
    // A fox's coat is an even pile: more of the kind's short undercoat cards, a third of its
    // long guard locks (at the wolf's 520 per m² they stood off this small body as stray wires).
    fur: { density: 2600, guard: 170 },
    pose: { head: 10, neck: 36, tail: 'level' },
  },
});

/**
 * The fox's winter: the brush and back dusted with snow knocked off the brush it pushed through,
 * thaw mud drying pale on the black stockings, wet fur under the belly, the right ear nicked and a
 * healed bite on the left of the muzzle. Colour blocks the kind's zones miss are painted first:
 * the hind thigh and upper arm are red (the cream belly zone climbed over them), and the black
 * stockings start at the elbow and hock at every LOD.
 */
export const FOX_WILD: Wild = {
  wear: (info) => {
    const H = info.bones.height;
    const l = info.head;
    const muzzle = l.L - l.lc;
    const h = info.bones.head;
    const tailRoot = info.bones.tailRoot;
    const [c, s] = [Math.cos(h.pitch), Math.sin(h.pitch)];
    const onHead = (p: readonly [number, number, number]): [number, number, number] => [
      h.atlas[0] + c * p[0] + s * p[2],
      h.atlas[1] + p[1],
      h.atlas[2] - s * p[0] + c * p[2],
    ];
    return {
      seed: 8332,
      settle: {
        colour: [0.86, 0.89, 0.93],
        strength: 0.5,
        above: H * 0.7,
        patch: 0.028,
        // The back and shoulders, thinning to nothing on the face and the brush.
        mask: (p) =>
          smooth(tailRoot[0] - 0.02, tailRoot[0] + 0.05, p[0]) *
          smooth(h.atlas[0] + 0.03, h.atlas[0] - 0.04, p[0]),
      },
      mud: { top: H * 0.15, colour: hex('#6e5c48'), strength: 0.75 },
      damp: { top: H * 0.3, belly: H * 0.66, strength: 0.3 },
      scars: [
        {
          a: onHead([l.lc + muzzle * 0.2, l.rt * 0.7, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.62, l.rt * 0.3, l.zt + l.rt]),
          width: 0.0022,
          axis: 2,
          reach: 0.02,
        },
      ],
    };
  },
  base: (info) => {
    const H = info.bones.height;
    const col = FOX.colours;
    const black = col.legs ?? col.coat;
    const leg = (name: 'fore' | 'hind') => info.bones.legs.find((x) => x.name === name);
    const fore = leg('fore');
    const hind = leg('hind');
    const r = info.bones.limbR;
    // Upper segments (shoulder → elbow, hip → stifle) and the lower chains to the paws.
    const upper = [fore, hind].map((x) => nearChain(x ? x.joints.slice(0, 2) : [], r * 1.5));
    const lower = [fore, hind].map((x) =>
      nearChain(x ? [...x.joints.slice(1), x.foot] : [], r * 1.3),
    );
    return ({ p, n, c, part }) => {
      if (part !== 'body' && part !== 'fur') return c;
      // Outward-facing skin of the upper limb: red like the flank, not the belly's cream.
      const out = smooth(-0.1, 0.35, n[1] * Math.sign(p[1]));
      const thigh = Math.max(upper[0]?.(p) ?? 0, upper[1]?.(p) ?? 0) * out;
      let k = mix(c, col.coat, thigh * smooth(H * 0.42, H * 0.55, p[2]));
      // Stockings: black from just under the elbow and hock down, the same edge at every LOD
      // (the far leg tubes carry a ring where the colour turns).
      const top = H * 0.52;
      const sock = Math.max(lower[0]?.(p) ?? 0, lower[1]?.(p) ?? 0);
      k = mix(k, black, sock * smooth(top, top - H * 0.14, p[2]));
      return k;
    };
  },
  coat: (info) => {
    const H = info.bones.height;
    const tail = info.bones.tail;
    const girth = Math.max(...tail.map((t) => t.r), 0.01);
    const along = nearChain(
      tail.slice(1).map((t) => t.at),
      girth,
    );
    const brush = (p: readonly [number, number, number]): number =>
      along([p[0], 0, p[2]]) * smooth(0.012, 0, Math.abs(p[1]) - girth);
    return {
      // Dense and short: a fox's coat is a soft even pile, not a few guard hairs on bare skin.
      density: 5200,
      // The brush: guard hair three times the body's, standing off the tail all round.
      length: (p) => 0.019 + 0.04 * brush(p),
      width: 0.0052,
      where: (p, n) =>
        Math.max(brush(p), smooth(H * 0.5, H * 0.6, p[2]) * smooth(-0.35, 0.05, n[2])),
    };
  },
  whiskers: { count: 12, length: 0.05, radius: 0.00045, colour: [0.07, 0.06, 0.055], brow: 1 },
  nick: -1,
  sheen: [0.14, 0.08, 0.05],
};

export const fox = defineWildCreature(
  {
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
    // The kind's default body cell follows the limb radius: 4.4 mm on a 6 kg fox, 94 k body
    // triangles for an animal 68 cm long. 5.9 mm on the body and 3.1 mm on the head hold the
    // toes, the lids and the ear cups.
    options: { strip: FUR, cells: { body: [1.35, 1, 1], head: [1.15, 1, 1] } },
    real: {
      length: 1.11,
      width: 0.16,
      height: 0.52,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.3,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'friendly', grounded: true },
  },
  FOX_WILD,
);
