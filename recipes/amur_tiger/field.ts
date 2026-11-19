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
import { smooth, type WearSpec, wearPaint } from '../_lib/creature/wild-paint.ts';
import { type GroomLayer, groom, strands } from '../_lib/creature/wild-parts.ts';
import { whiskerSpots } from './face.ts';
import { HEAD, HEAD_PITCH, HEAD_SCALE, headToWorld, SK } from './skeleton.ts';
import { FORE_CHAIN, HIND_CHAIN } from './zones.ts';

// The cutout strand atlas the cards map into.
defineMaterial(CREATURE_MATERIALS.fur_clumps);

/** Cards weigh as a thin keratin sheet and never collide. */
export const HAIR = { shell: 0.0002, density: 1300, collider: 'none' } as const;

const sh = SK.fore.shoulder;

export const WEAR: WearSpec = {
  seed: 1931,
  mud: { top: 0.15, colour: [0.075, 0.055, 0.04], strength: 0.8 },
  damp: { top: 0.34, belly: 0.56, strength: 0.36 },
  matted: {
    zones: [
      { at: [-0.3, 0.15, 0.56], radius: 0.22 },
      { at: [-0.68, 0.16, 0.55], radius: 0.2 },
      { at: [0.45, 0.15, 0.5], radius: 0.16 },
    ],
    strength: 0.45,
    width: 0.014,
  },
  scarColour: [0.5, 0.36, 0.33],
  scars: [
    // Three claw rakes down the right shoulder (projected along Y onto whatever faces out).
    ...[0, 1, 2].map((k) => ({
      a: [sh[0] - 0.03 - k * 0.035, -0.2, sh[2] + 0.2 - k * 0.012] as Vec3,
      b: [sh[0] - 0.13 - k * 0.035, -0.2, sh[2] + 0.02 + k * 0.01] as Vec3,
      width: 0.0055 - k * 0.0008,
      axis: 1 as const,
      reach: 0.12,
    })),
    // Across the bridge of the nose, from the right brow toward the left whisker pad.
    {
      a: headToWorld([0.22, -0.03, 0.09]),
      b: headToWorld([0.3, 0.012, 0.05]),
      width: 0.0035,
      axis: 2,
      reach: 0.06,
    },
    // Over the left brow.
    {
      a: headToWorld([0.19, 0.035, 0.12]),
      b: headToWorld([0.235, 0.075, 0.1]),
      width: 0.003,
      axis: 2,
      reach: 0.05,
    },
  ],
};

const wear = wearPaint(WEAR);

/** A part's mesh with the wear painted in (`at` = the part's world offset) and, for parts in
 *  the world frame, the ground grade. */
export function worn(mesh: Mesh, at: Vec3 = [0, 0, 0]): Mesh {
  const m = recolour(mesh, at, wear);
  return at[0] === 0 && at[1] === 0 && at[2] === 0
    ? grime(m, { ground: 0.3, groundStrength: 0.22 })
    : m;
}

const dist = (p: Vec3, q: Vec3): number =>
  Math.hypot(p[0] - q[0], Math.abs(p[1]) - Math.abs(q[1]), p[2] - q[2]);
const ball = (p: Vec3, at: Vec3, r: number): number => Math.max(0, 1 - (dist(p, at) / r) ** 2);

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
      // The cards carry the skin's value: darker cards over the coat read as scratches.
      tone: [0.95, 1.2],
      sink: 0.0025,
      segments: 2,
    },
    {
      name: 'guard',
      density: (p, n) => 130 * k * paw(p) * (0.5 + 5 * long(p, n)),
      length: (p, n) => (0.04 + 0.055 * long(p, n)) * (0.35 + 0.65 * leg(p)),
      width: 0.016 * wide,
      lift: 0.34,
      bend: 0.6,
      droop: 0.16,
      roll: 0.7,
      clump: 4,
      fold: lod === 0 ? 0.6 : 0,
      cells: strandCells('fur_clumps', 'guard'),
      tone: [0.95, 1.25],
      sink: 0.003,
      segments: lod === 0 ? 3 : 2,
    },
  ];
  // Back along the trunk and neck, down the legs, gravity on the flanks.
  const flip = (c: readonly Vec3[]): Vec3[] => c.map((p): Vec3 => [p[0], -p[1], p[2]]);
  const flow = hairFlow(
    body,
    chainSeed(
      [
        { points: [[0.78, 0, 0.85], ...SK.spine, SK.tailRoot] },
        { points: [...FORE_CHAIN], weight: 1.5 },
        { points: flip(FORE_CHAIN), weight: 1.5 },
        { points: [...HIND_CHAIN], weight: 1.5 },
        { points: flip(HIND_CHAIN), weight: 1.5 },
      ],
      { gravity: 0.35 },
    ),
  );
  // The dossier's box: 0.47 m ruff to ruff; no lock past 0.235 m off the midline.
  return groom(body, flow, layers, rng, { y: 0.232, z: 1.04 });
}

/** Head part frame (pitched, scaled, about the atlas) → head-local. */
function headLocal(p: Vec3): Vec3 {
  const c = Math.cos(HEAD_PITCH);
  const s = Math.sin(HEAD_PITCH);
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
      tone: [0.95, 1.25],
      sink: 0.003,
      segments: lod === 0 ? 3 : 2,
    },
  ];
  // Back from the face, flaring out and down over the cheeks (head-local → the part's frame).
  const c = Math.cos(HEAD_PITCH);
  const s = Math.sin(HEAD_PITCH);
  const flow = hairFlow(head, (p) => {
    const q = headLocal(p);
    const f = cheek(q);
    const d: Vec3 = [-1, Math.sign(q[1]) * (0.15 + 0.7 * f), -0.1 - 0.5 * f];
    return [c * d[0] + s * d[2], d[1], -s * d[0] + c * d[2]];
  });
  return groom(head, flow, layers, rng);
}

/** Whiskers in the head part's frame: one from each follicle spot on the pads, the rear and
 *  lower ones longest, and three over each brow. LOD1 keeps every other one, twice as thick. */
export function whiskerMesh(lod: Lod, rng: Rng): Mesh | null {
  if (lod === 2) return null;
  const paths: Vec3[][] = [];
  const steps = lod === 0 ? 6 : 3;
  const grow = (root: Vec3, dir: Vec3, len: number, droop: number): void => {
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
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
