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
  type Vec3,
} from '@developerz.ai/ts23d';
import { citeWikidata, quantity, readWikidata } from '@developerz.ai/ts23d/data';
import { defineWildCreature, type Wild } from '../_lib/creature/wild.ts';
import { mix, nearChain, noise3, smooth } from '../_lib/creature/wild-paint.ts';
import { WOLF } from '../wolf/wolf.ts';
import foxJson from './data/wikidata-Q8332.json';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

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
      earWidth: 1.15,
      pupil: 'slit',
    },
    // A shallower, lighter chest than the wolf's. The brush's fullness is long card fur
    // (FOX_WILD.coat), not flesh: a thicker tail chain weighs as solid and tips the balance onto
    // the hind feet (fore share under 55 %). The winter coat fills the waist's tuck (0.88) and
    // thickens the stockings (limbs 1.06 × the bare allometric limb; the body cell follows the
    // limb, which brings LOD0 inside the creature band's 150 k).
    build: { depth: 0.53, width: 0.6, limbs: 1.1, tailGirth: 3.3, ruff: 0.03, tuck: 0.9 },
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
      // A thin frost of fine flecks under the snowed hair tips (FOX_WILD.coat), not blobs.
      settle: {
        colour: [0.86, 0.89, 0.93],
        strength: 0.3,
        above: H * 0.78,
        patch: 0.016,
        // The back and shoulders, thinning to nothing on the face and the brush.
        mask: (p) =>
          smooth(tailRoot[0] - 0.02, tailRoot[0] + 0.05, p[0]) *
          smooth(h.atlas[0] + 0.03, h.atlas[0] - 0.04, p[0]),
      },
      // Clay drying pale on the black stockings, splashed to the elbows and the belly fringe.
      mud: { top: H * 0.3, colour: hex('#9a866c'), strength: 0.9 },
      damp: { top: H * 0.4, belly: H * 0.6, strength: 0.4 },
      matted: {
        zones: [
          { at: [tailRoot[0] + 0.14, 0.05, H * 0.62], radius: H * 0.3 },
          { at: [h.atlas[0] - 0.2, 0.05, H * 0.6], radius: H * 0.26 },
        ],
        strength: 0.5,
        width: 0.012,
      },
      scarColour: hex('#c9a79a'),
      scars: [
        {
          a: onHead([l.lc + muzzle * 0.2, l.rt * 0.7, l.zt + l.rt]),
          b: onHead([l.lc + muzzle * 0.62, l.rt * 0.3, l.zt + l.rt]),
          width: 0.004,
          axis: 2,
          reach: 0.02,
        },
        // A healed bite across the right haunch.
        {
          a: [tailRoot[0] + 0.1, -0.1, H * 0.86],
          b: [tailRoot[0] + 0.2, -0.1, H * 0.62],
          width: 0.007,
          axis: 1,
          reach: 0.06,
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
    const [back, belly] = [col.back ?? col.coat, col.belly ?? col.coat];
    const rump = info.bones.tailRoot[0];
    return ({ p, n, c: given, lod, part }) => {
      if (part !== 'body' && part !== 'fur') return given;
      let c = given;
      if (lod === 2 && part === 'body') {
        // The far mesh's 4 cm cells turn the sculpt's per-vertex tone into facets: its coat is
        // the animal's blocks (russet back, red flank, cream underside and chest), with a
        // fifth of the sculpt's shading; the brush keeps its own paint and white tip.
        let k = mix(col.coat, back, smooth(0.1, 0.6, n[2]) * smooth(H * 0.7, H * 0.85, p[2]));
        k = mix(k, belly, smooth(-0.2, -0.7, n[2]) * smooth(H * 0.4, H * 0.55, p[2]));
        const chest = smooth(0.35, 0.8, n[0]) * smooth(H * 0.5, H * 0.62, p[2]);
        k = mix(k, belly, chest * smooth(H * 1.0, H * 0.85, p[2]) * 0.85);
        c = mix(k, given, 0.2 + 0.8 * smooth(rump + 0.01, rump - 0.03, p[0]));
      }
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
    const atlas = info.bones.head.atlas[0];
    const root = info.bones.tailRoot[0];
    // Snow on the hair tips along the topline, withers to croup: every second or third lock.
    const snowed = (p: Vec3): number =>
      smooth(H * 0.84, H * 0.96, p[2]) *
      smooth(root, root + 0.05, p[0]) *
      smooth(atlas - 0.02, atlas - 0.08, p[0]) *
      smooth(0.56, 0.66, noise3(p[0] / 0.014, p[1] / 0.014, p[2] / 0.014, 8332));
    return {
      // Dense and short: a fox's coat is a soft even pile, not a few guard hairs on bare skin.
      density: 9000,
      // The brush: guard hair three times the body's, standing off the tail all round.
      length: (p) => 0.02 + 0.04 * brush(p),
      width: 0.0055,
      // Trunk, shoulders and thighs down to the elbow and stifle; the stockings stay sleek.
      where: (p, n) =>
        Math.max(brush(p), smooth(H * 0.4, H * 0.52, p[2]) * smooth(-0.35, 0.05, n[2])),
      tone: [0.8, 1.28],
      // Longer guard hair in clumped locks, pale at the tips: the winter coat's loft.
      guard: { density: 1700, length: 0.034, width: 0.008, tone: [0.76, 1.4] },
      color: (p, skin) => mix(skin, [0.9, 0.92, 0.95], snowed(p) * 0.8),
      // Far: a fringe along the back and the brush's ragged edge.
      far: {
        density: 700,
        length: 0.035,
        width: 0.02,
        where: (p, n) =>
          Math.max(brush(p) * 0.8, smooth(0.3, 0.75, n[2]) * smooth(H * 0.86, H * 0.95, p[2])),
      },
    };
  },
  // Locks 1.9 cm across (2.5 body cells) along the coat's lie.
  locks: { size: 0.019, strength: 0.45, seed: 8332 },
  // The coated width (README: 0.18 m): no lock past 9.2 cm off the midline.
  box: { y: 0.092 },
  whiskers: { count: 12, length: 0.05, radius: 0.00045, colour: [0.07, 0.06, 0.055], brow: 1 },
  nick: -1,
  sheen: [0.14, 0.08, 0.05],
};

export const fox = defineWildCreature(
  {
    name: 'fox',
    description:
      'Adult red fox (Vulpes vulpes) standing alert in winter coat: 0.74 m head and body, 0.42 m brush, 0.425 m at the shoulder, 7.5 kg; the grey wolf’s canid family member, scaled from its skeleton',
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
    options: { strip: FUR, cells: { body: [1.6, 1.1, 0.9], head: [1.5, 1, 0.8] } },
    real: {
      length: 1.2,
      width: 0.18,
      height: 0.56,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.3,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'friendly', grounded: true },
    // Side-on enough for the brush, the stockings and the snowed back to read at once.
    hero: { azDeg: -55, elDeg: 10 },
  },
  FOX_WILD,
);
