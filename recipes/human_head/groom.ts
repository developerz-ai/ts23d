// The human's LOD0 hair from the Blender groom (ADR 014, recipes/_lib/face/hair-groom.ts): guides
// traced on the swept mid layer of the card style (hair.ts: side parting, crown whorl), combed
// back, the parting filled, the crown puffed and grown, the nape cut short, then clumped into
// ~300 locks with a little curl and frizz by Blender's hair node groups; beard, moustache, brows
// and the hairline wisps stay cards in the same `hair` part. The groom output is cached in
// neural/ (`t3d neural run recipes/human_head/human_head.ts`); a miss builds the card hair.

import type { GroomOp, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { SK } from '../_lib/bust/human/spec.ts';
import type { GroomStyle } from '../_lib/face/hair-groom.ts';

/** The parting's y (the man's left), as the card comb's. */
const PART = 0.03;

const zones = {
  crown: (p: Vec3) => dmath.hypot(p[0] - (SK.occiput[0] + 0.05), p[1], p[2] - SK.crown[2]) - 0.05,
  nape: (p: Vec3) => Math.max(p[0] - (SK.occiput[0] + 0.035), p[2] - (SK.euryon[2] - 0.005)),
  part: (p: Vec3) => Math.abs(p[1] - PART) - 0.012 + Math.max(0, SK.euryon[2] + 0.02 - p[2]),
  // The front lock: the first 4 cm behind the hairline over the forehead.
  front: (p: Vec3) => dmath.hypot(p[0] - (SK.glabella[0] - 0.03), p[1] * 0.7) - 0.045,
};

const ops: GroomOp[] = [
  { op: 'comb', toward: [-1, 0, -0.2], strength: 0.25 },
  { op: 'add', count: 80, region: 'part', seed: 4 },
  { op: 'puff', amount: 0.3, region: 'crown' },
  // The front lock lifted off the forehead before it sweeps back: a stronger outline.
  { op: 'puff', amount: 0.45, region: 'front' },
  { op: 'grow', factor: 1.15, region: 'front' },
  { op: 'grow', factor: 1.1, region: 'crown' },
  { op: 'cut', length: 0.045, region: 'nape' },
  { op: 'smooth', iterations: 3 },
  { op: 'clump', locks: 300, strength: 0.7, seed: 1 },
  { op: 'curl', radius: 0.002, turns: 1.2, seed: 2 },
  { op: 'frizz', amount: 0.0008, seed: 3 },
];

export const HUMAN_GROOM: GroomStyle = {
  from: 'hair_mid',
  keep: ['beard', 'moustache', 'brows', 'hair_edge'],
  guides: 4000,
  segments: 8,
  ops,
  zones,
  children: 14,
  cards: 300,
  wisps: 30,
  wispWidth: 0.003,
  points: 6,
  width: [0.017, 0.007],
  fold: 0.5,
  maxTriangles: 7500,
  tone: [0.55, 1.1],
  tint: [1.08, 1.0, 0.86],
  seed: 7,
};
