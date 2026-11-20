// The tiger outdoors (world frame unless said): what a wild male carries that a sculpt does not.
//   wear      thaw mud caked on the paws and splashed to the wrists and hocks, wet darker fur
//             above it and along the belly fringe, the flank and breeches matted, three parallel
//             claw rakes healed across the right shoulder, a cut across the bridge of the nose
//             and one over the left brow (old fights with other males)
//   coat      strand cards over the painted sculpt, so the coat breaks light as fur: a short
//             undercoat over the trunk and upper legs, long clumped guard hair on the nape,
//             throat, chest, belly fringe, elbows and breeches (Geptner & Sludskij 1972: winter
//             back 40–50 mm, nape 70–110, belly 65–105); the cheek ruff's locks on the head
//   whiskers  the mystacial rows growing from the follicle spots on the pads, and brow whiskers
// Cards take the skin's colour under their root, so the stripes run on through the fur.

import {
  CREATURE_MATERIALS,
  chainSeed,
  defineMaterial,
  dmath,
  grime,
  hairFlow,
  type Lod,
  type Mesh,
  place,
  type Rng,
  strandCells,
  type Vec3,
} from '@developerz.ai/ts23d';
import { recolour } from '../_lib/creature/wild.ts';
import {
  lockShade,
  lockTone,
  mix,
  smooth,
  type WearSpec,
  wearPaint,
} from '../_lib/creature/wild-paint.ts';
import { type GroomLayer, groom, strands } from '../_lib/creature/wild-parts.ts';
import { bodyPaint } from './coat.ts';
import { whiskerSpots } from './face.ts';
import { C } from './palette.ts';
import { HEAD, HEAD_PITCH, HEAD_SCALE, headToWorld, SK } from './skeleton.ts';
import { bodyStripe, legStripe } from './stripes.ts';
import { FORE_CHAIN, HIND_CHAIN } from './zones.ts';

/** The ruff's warm white in the light. */
const CREAM: Vec3 = [0.9, 0.84, 0.72];

// The cutout strand atlas the cards map into.
defineMaterial(CREATURE_MATERIALS.fur_clumps);

/** Cards weigh as a thin keratin sheet and never collide. */
export const HAIR = { shell: 0.0002, density: 1300, collider: 'none' } as const;

const sh = SK.fore.shoulder;

export const WEAR: WearSpec = {
  seed: 1931,
  // Thaw mud: wet and dark on the paws, a grey-brown crust drying at its ragged edge up the
  // cannons, splashed over the white of the inner legs and the belly fringe.
  mud: { top: 0.3, colour: [0.2, 0.155, 0.11], strength: 0.92 },
  damp: { top: 0.44, belly: 0.56, strength: 0.42 },
  matted: {
    zones: [
      { at: [-0.3, 0.15, 0.56], radius: 0.22 },
      { at: [-0.68, 0.16, 0.55], radius: 0.2 },
      { at: [0.45, 0.15, 0.5], radius: 0.16 },
    ],
    strength: 0.6,
    width: 0.022,
  },
  // Healed skin, hairless: pale pink against the orange, wide enough to read across a clearing.
  scarColour: [0.62, 0.46, 0.42],
  scars: [
    // Three claw rakes down the right shoulder (projected along Y onto whatever faces out).
    ...[0, 1, 2].map((k) => ({
      a: [sh[0] - 0.02 - k * 0.05, -0.2, sh[2] + 0.22 - k * 0.012] as Vec3,
      b: [sh[0] - 0.16 - k * 0.05, -0.2, sh[2] - 0.02 + k * 0.01] as Vec3,
      width: 0.011 - k * 0.0015,
      axis: 1 as const,
      reach: 0.12,
    })),
    // Across the bridge of the nose, from the right brow toward the left whisker pad.
    {
      a: headToWorld([0.22, -0.03, 0.09]),
      b: headToWorld([0.3, 0.012, 0.05]),
      width: 0.006,
      axis: 2,
      reach: 0.06,
    },
    // Over the left brow.
    {
      a: headToWorld([0.19, 0.035, 0.12]),
      b: headToWorld([0.235, 0.075, 0.1]),
      width: 0.005,
      axis: 2,
      reach: 0.05,
    },
  ],
};

const wear = wearPaint(WEAR);
/** The far mesh's wear: the broad layers only (flecks and scars alias on 8 cm cells). */
const wearFar = wearPaint(WEAR, true);

/** The coat's lie in the world: back along the trunk and neck, down the legs, gravity on the
 *  flanks (the cards' flow and the painted locks share it). */
const flip = (c: readonly Vec3[]): Vec3[] => c.map((p): Vec3 => [p[0], -p[1], p[2]]);
const LIE = chainSeed(
  [
    { points: [[0.78, 0, 0.85], ...SK.spine, SK.tailRoot] },
    { points: [...FORE_CHAIN], weight: 1.5 },
    { points: flip(FORE_CHAIN), weight: 1.5 },
    { points: [...HIND_CHAIN], weight: 1.5 },
    { points: flip(HIND_CHAIN), weight: 1.5 },
  ],
  { gravity: 0.35 },
);
/** Locks painted under the cards: 3.3 cm across on the body (2.5 cells), 1.6 cm on the head
 *  (back from the nose along the pitched skull), so the coat between the cards reads as fur. */
const bodyLocks = lockTone((p) => LIE(p, [0, 0, 1]), { size: 0.033, strength: 0.3, seed: 1931 });
const headLocks = lockTone(() => [-dmath.cos(HEAD_PITCH), 0, dmath.sin(HEAD_PITCH) - 0.15], {
  size: 0.016,
  strength: 0.3,
  seed: 1932,
});

/** A part's mesh with the locks (`locks`: body or head; never the far LOD) and the wear painted
 *  in (`at` = the part's world offset) and, for parts in the world frame, the ground grade.
 *  `far`: the far LOD's coarse mesh. */
export function worn(mesh: Mesh, at: Vec3 = [0, 0, 0], far = false, locks?: 'body' | 'head'): Mesh {
  const tone = far || !locks ? null : locks === 'body' ? bodyLocks : headLocks;
  const paint = far ? wearFar : wear;
  const m = recolour(mesh, at, (p, n, c) => paint(p, n, tone ? lockShade(c, tone(p), 0.3) : c));
  return at[0] === 0 && at[1] === 0 && at[2] === 0
    ? grime(m, { ground: 0.3, groundStrength: 0.22 })
    : m;
}

const dist = (p: Vec3, q: Vec3): number =>
  dmath.hypot(p[0] - q[0], Math.abs(p[1]) - Math.abs(q[1]), p[2] - q[2]);
const ball = (p: Vec3, at: Vec3, r: number): number =>
  Math.max(0, 1 - dmath.pow(dist(p, at) / r, 2));

/** The body's coat cards (LOD0 and LOD1; the far mesh carries none). */
export function coat(body: Mesh, lod: Lod, rng: Rng): Mesh | null {
  if (lod === 2) return null;
  const k = lod === 0 ? 1 : 0.16;
  const wide = lod === 0 ? 1 : 1.6;
  // Long-fur zones: nape mane, throat and chest, elbows, breeches.
  const nape = (p: Vec3): number => ball(p, [0.6, 0, 0.9], 0.2);
  const chest = (p: Vec3): number => ball(p, [0.68, 0, 0.6], 0.2);
  const elbow = (p: Vec3): number => ball(p, [0.36, 0.14, 0.45], 0.1);
  const breeches = (p: Vec3): number => ball(p, [-0.76, 0.1, 0.6], 0.2);
  const fringe = (p: Vec3, n: Vec3): number =>
    smooth(-0.3, -0.75, n[2]) * smooth(0.42, 0.5, p[2]) * smooth(0.62, 0.52, p[2]);
  // Short tight fur from the wrists and hocks down; none on the paws.
  const leg = (p: Vec3): number => smooth(0.14, 0.36, p[2]);
  // …and none round the tail root: the tail sways there.
  const paw = (p: Vec3): number =>
    smooth(0.09, 0.14, p[2]) * smooth(0.12, 0.2, dist(p, SK.tailRoot));
  const long = (p: Vec3, n: Vec3): number =>
    Math.max(nape(p), chest(p) * 0.9, elbow(p) * 0.7, breeches(p) * 0.8, fringe(p, n));
  // The up-facing back, withers to croup.
  const topline = (p: Vec3, n: Vec3): number =>
    smooth(0.55, 0.9, n[2]) * smooth(0.5, 0.35, p[0]) * smooth(0.8, 0.9, p[2]);
  const ground = (p: Vec3, c: Vec3): Vec3 => wear(p, [0, 0, 1], bodyPaint(lod, false)(p, c));
  const stripeAt = (p: Vec3): number => Math.max(bodyStripe(p, lod), legStripe(p, lod));
  const layers: GroomLayer[] = [
    {
      name: 'undercoat',
      density: (p) => 760 * k * paw(p),
      length: (p) => 0.016 + 0.016 * leg(p),
      width: 0.0105 * wide,
      lift: 0.26,
      bend: 0.62,
      droop: 0.03,
      roll: 0.3,
      cells: strandCells('fur_clumps', 'fur'),
      // Shadowed roots, lit tips: each card a lock in the pile.
      tone: [0.82, 1.24],
      sink: 0.0025,
      segments: 2,
      // A card rooted in a stripe is black for its whole length and lies along the body, across
      // the stripe: it carried the black out over the orange as a scratch. In a stripe the cards
      // take the ground colour past the stripe's core, so the stripe stays painted on the coat.
      color: (p, skin) => mix(skin, ground(p, C.orange), smooth(0.25, 0.7, stripeAt(p)) * 0.85),
    },
    {
      name: 'guard',
      density: (p, n) => 130 * k * paw(p) * (0.5 + 5 * long(p, n)) * (1 - 0.6 * topline(p, n)),
      // Short and close along the back (40–50 mm lying flat: a smooth topline, not quills).
      length: (p, n) =>
        (0.04 + 0.055 * long(p, n)) * (0.35 + 0.65 * leg(p)) * (1 - 0.45 * topline(p, n)),
      width: 0.016 * wide,
      lift: 0.3,
      bend: 0.68,
      droop: 0.16,
      roll: 0.7,
      clump: 4,
      fold: lod === 0 ? 0.6 : 0,
      cells: strandCells('fur_clumps', 'guard'),
      tone: [0.85, 1.3],
      sink: 0.003,
      segments: lod === 0 ? 3 : 2,
      // Long hair never carries a stripe off the body: it shows the ground colour.
      color: (p, skin) => mix(skin, ground(p, C.orange), smooth(0.1, 0.5, stripeAt(p))),
    },
  ];
  const flow = hairFlow(body, LIE);
  // The dossier's box: 0.47 m ruff to ruff; no lock past 0.235 m off the midline.
  return groom(body, flow, layers, rng, { y: 0.232, z: 1.03 });
}

/** Head part frame (pitched, scaled, about the atlas) → head-local. */
function headLocal(p: Vec3): Vec3 {
  const c = dmath.cos(HEAD_PITCH);
  const s = dmath.sin(HEAD_PITCH);
  return [
    (c * p[0] - s * p[2]) / HEAD_SCALE,
    p[1] / HEAD_SCALE,
    (s * p[0] + c * p[2]) / HEAD_SCALE,
  ];
}

/** The cheek ruff's locks and short crown fur on the head part's own mesh (its frame). */
export function ruffCards(head: Mesh, lod: Lod, rng: Rng): Mesh | null {
  if (lod === 2) return null;
  const k = lod === 0 ? 1 : 0.16;
  const wide = lod === 0 ? 1 : 1.6;
  const E = HEAD.eye;
  // Behind the eyes only: the face, lips, teeth and mouth stay bare of cards.
  const behind = (q: Vec3): number => smooth(E[0] - 0.035, E[0] - 0.075, q[0]);
  const cheek = (q: Vec3): number =>
    behind(q) * smooth(0.05, 0.085, Math.abs(q[1])) * smooth(E[2] + 0.01, E[2] - 0.04, q[2]);
  // Forward of the crown layer: forehead, bridge and cheeks, clear of the eyes, the nose and
  // the lips (everything from the whisker pads forward and down stays sculpt).
  const faceFur = (q: Vec3): number =>
    (1 - behind(q)) *
    smooth(HEAD.nose[0] - 0.045, HEAD.nose[0] - 0.075, q[0]) *
    smooth(HEAD.mouthZ + 0.03, HEAD.mouthZ + 0.055, q[2]) *
    smooth(0.03, 0.042, dmath.hypot(q[0] - E[0], Math.abs(q[1]) - E[1], q[2] - E[2]));
  const layers: GroomLayer[] = [
    {
      name: 'crown',
      density: (p) => 1500 * k * behind(headLocal(p)),
      length: 0.02,
      width: 0.008 * wide,
      lift: 0.26,
      bend: 0.6,
      droop: 0.03,
      roll: 0.3,
      cells: strandCells('fur_clumps', 'fur'),
      tone: [0.95, 1.2],
      sink: 0.002,
      segments: 2,
    },
    {
      name: 'ruff',
      density: (p) => 1300 * k * smooth(0.2, 0.7, cheek(headLocal(p))),
      length: (p) => 0.04 + 0.045 * cheek(headLocal(p)),
      width: 0.014 * wide,
      lift: 0.42,
      bend: 0.55,
      droop: 0.12,
      roll: 0.7,
      clump: 4,
      fold: lod === 0 ? 0.6 : 0,
      cells: strandCells('fur_clumps', 'guard'),
      // Cream, lit at the tips: the white ruff read as grey straw where its cards took the
      // skin's shaded value.
      tone: [1, 1.3],
      // A lock rooted in one of the cheek's black bars would carry it out over the white as a
      // floating stroke: the bars stay painted on the skin under the ruff.
      color: (_p, skin) => {
        const v = (skin[0] + skin[2]) / 2;
        return mix(skin, CREAM, Math.max(0.55 * smooth(0.25, 0.6, v), 0.9 * smooth(0.22, 0.1, v)));
      },
      sink: 0.003,
      segments: lod === 0 ? 3 : 2,
    },
    {
      // The face itself: a velvet of very short cards over the forehead, bridge and cheeks
      // (bare: the nose leather, lips, eye rims and whisker pads), so it breaks light as fur.
      name: 'face',
      density: (p) => 2600 * k * faceFur(headLocal(p)),
      length: 0.011,
      width: 0.0055 * wide,
      lift: 0.3,
      bend: 0.6,
      droop: 0.02,
      roll: 0.3,
      cells: strandCells('fur_clumps', 'fur'),
      tone: [0.82, 1.25],
      sink: 0.0015,
      segments: 1,
    },
  ];
  // Back from the face, flaring out and down over the cheeks (head-local → the part's frame).
  const c = dmath.cos(HEAD_PITCH);
  const s = dmath.sin(HEAD_PITCH);
  const flow = hairFlow(head, (p) => {
    const q = headLocal(p);
    const f = cheek(q);
    const d: Vec3 = [-1, Math.sign(q[1]) * (0.15 + 0.7 * f), -0.1 - 0.5 * f];
    return [c * d[0] + s * d[2], d[1], -s * d[0] + c * d[2]];
  });
  // The dossier's 0.47 m ruff to ruff holds on the scaled head: no lock past 0.238 m.
  return groom(head, flow, layers, rng, { y: 0.238 });
}

/** Whiskers in the head part's frame: one from each follicle spot on the pads, the rear and
 *  lower ones longest, and three over each brow. LOD1 keeps every other one, twice as thick. */
export function whiskerMesh(lod: Lod, rng: Rng): Mesh | null {
  if (lod === 2) return null;
  const paths: Vec3[][] = [];
  const steps = lod === 0 ? 6 : 3;
  const grow = (root: Vec3, dir: Vec3, len: number, droop: number): void => {
    const dl = dmath.hypot(dir[0], dir[1], dir[2]) || 1;
    const pts: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([
        root[0] + (dir[0] / dl) * len * t - len * 0.2 * t * t,
        root[1] + (dir[1] / dl) * len * t,
        root[2] + (dir[2] / dl) * len * t - len * droop * t * t,
      ]);
    }
    paths.push(pts);
  };
  for (const side of [1, -1]) {
    whiskerSpots().forEach((w, i) => {
      if (lod === 1 && i % 2 === 1) return;
      // Spots are painted on the pad's surface; the follicle is 6 mm under it.
      const root: Vec3 = [w[0], (w[1] - 0.006) * side, w[2]];
      const back = (0.33 - w[0]) / 0.06;
      const len = (0.07 + 0.07 * back) * (0.85 + 0.3 * rng.next());
      grow(root, [0.3 - 0.5 * back, side, 0.12 - (-0.016 - w[2]) * 6 + 0.1 * rng.next()], len, 0.2);
    });
    for (let i = 0; i < (lod === 0 ? 3 : 1); i++) {
      const E = HEAD.eye;
      const root: Vec3 = [E[0] - 0.008 - i * 0.012, (E[1] - 0.004) * side, E[2] + 0.022];
      grow(root, [0.15, 0.5 * side, 1], 0.05 * (0.85 + 0.3 * rng.next()), -0.05);
    }
  }
  const local = strands(paths, lod === 0 ? 0.0011 : 0.0022, [0.9, 0.88, 0.82]);
  return place(local, { pitch: HEAD_PITCH, scale: HEAD_SCALE });
}
