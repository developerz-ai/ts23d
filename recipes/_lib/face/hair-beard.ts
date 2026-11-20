// The beard for the face busts: its body, a spade of hair hanging from the chin and jaw — three
// tapering lock chains from warped landmarks that blend into one volume, for the beard locks to
// lie on (a beard is a mass before it is locks) — and its card layers: beard, cheeks, moustache.

import type { CardLayer, Field, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { lock } from '../bust/hair.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';

/** The beard's body: a spade of hair hanging from the chin and jaw (three tapering chains that
 *  blend into one volume) and the moustache's two locks over the upper lip, for the cards to lie
 *  on — a beard is a mass before it is locks. */
export function beardBody(head: FaceHead, root: Vec3, tip: Vec3, lod: number): SculptEdit[] {
  const s = head.scale;
  const pog = head.map(MIDLINE.pogonion);
  const men = head.map(MIDLINE.menton);
  const jaw = head.map(LEFT.jawline);
  const out: SculptEdit[] = [];
  const n = lod === 2 ? 4 : 8;
  const chain = (a: Vec3, r0: number): void => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        a[0] + 0.01 * s * t - 0.02 * s * t * t,
        a[1] * (1 - 0.55 * t),
        a[2] - 0.13 * s * t,
      ]);
    }
    out.push(...lock(pts, r0 * s, 0.01 * s, root, tip, { mirror: false, belly: 0.004 * s }));
  };
  chain([pog[0] - 0.012 * s, 0, (pog[2] + men[2]) / 2], 0.03);
  // The far LOD has no beard cards: a spade carved as masses instead of the jaw chains, which
  // at its 1.7 cm cell read as two sausages hanging from the jaw (and one ellipsoid as an egg
  // stuck to the chin): a broad dark root mass along the jaw, the spade's body tapering down,
  // and three lock tips (centre lowest) whose notches between them break the outline.
  if (lod === 2) out.push(...farSpade(head, root, tip));
  else
    for (const side of [1, -1])
      chain([jaw[0], side * Math.abs(jaw[1]) * 0.9, jaw[2] - 0.004 * s], 0.024);
  // The moustache's body: a lock each side from under the nose, over the upper lip, down past
  // the mouth's corner, lying ON the lip (cards hugging the head's 4.5 mm field lay under the
  // lips' bulge, and the upper lip showed bare between the nose and the beard).
  const sub = head.map(MIDLINE.subnasale);
  const lab = head.map(MIDLINE.labraleSup);
  const mouth = head.map(MIDLINE.stomionSup);
  for (const side of [1, -1]) {
    const pts: Vec3[] = [
      [sub[0] - 0.002 * s, side * 0.003 * s, sub[2] - 0.003 * s],
      [lab[0] + 0.001 * s, side * 0.011 * s, (lab[2] + sub[2]) / 2 - 0.003 * s],
      [lab[0] - 0.003 * s, side * 0.026 * s, mouth[2] - 0.002 * s],
      [lab[0] - 0.008 * s, side * 0.034 * s, mouth[2] - 0.014 * s],
    ];
    // (At the far LOD a fuller, darker mass standing proud of the lip: the 1.7 cm cell drops a
    // 5 mm lock, and the moustache is half of what says "dwarf" from across a room.)
    if (lod === 2)
      out.push(
        ...lock(
          pts.map((q): Vec3 => [q[0] + 0.004 * s, q[1], q[2]]),
          0.011 * s,
          0.007 * s,
          shade(root, 0.8),
          root,
          { mirror: false },
        ),
      );
    else out.push(...lock(pts, 0.0055 * s, 0.0025 * s, root, tip, { mirror: false }));
  }
  return out;
}

const shade = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** The far beard: root mass, tapering spade body, three lock tips; dark at the jaw, the hair's
 *  mid tone in the body, the tip colour at the points, so the far beard has value bands. */
function farSpade(head: FaceHead, root: Vec3, tip: Vec3): SculptEdit[] {
  const s = head.scale;
  const pog = head.map(MIDLINE.pogonion);
  const men = head.map(MIDLINE.menton);
  const jaw = head.map(LEFT.jawline);
  const wy = Math.abs(jaw[1]);
  const mid: Vec3 = [(root[0] + tip[0]) / 2, (root[1] + tip[1]) / 2, (root[2] + tip[2]) / 2];
  const x = pog[0] - 0.014 * s;
  const out: SculptEdit[] = [
    {
      shape: 'ellipsoid',
      at: [x, 0, men[2] - 0.006 * s],
      size: [0.032 * s, wy * 1.02, 0.04 * s],
      blend: 0.012 * s,
      color: shade(root, 0.85),
    },
    {
      shape: 'ellipsoid',
      at: [x - 0.002 * s, 0, men[2] - 0.046 * s],
      size: [0.028 * s, wy * 0.78, 0.042 * s],
      blend: 0.014 * s,
      color: mid,
    },
  ];
  for (const [y, z] of [
    [0, 0.115],
    [0.032, 0.09],
    [-0.032, 0.09],
  ] as const) {
    const pts: Vec3[] = [
      [x, y * 1.4 * s, men[2] - 0.05 * s],
      [x + 0.002 * s, y * 1.15 * s, men[2] - (0.05 + (z - 0.05) * 0.55) * s],
      [x + 0.004 * s, y * s, men[2] - z * s],
    ];
    out.push(...lock(pts, 0.016 * s, 0.007 * s, mid, tip, { mirror: false, seg: 2 }));
  }
  return out;
}

/** The moustache's roots (≤ 0 inside): the upper lip between the nose and the mouth, in front,
 *  and the tuft under the lower lip. */
export function moustacheOf(head: FaceHead): Field {
  const s = head.scale;
  const mouth = head.map(MIDLINE.stomionSup);
  const sub = head.map(MIDLINE.subnasale);
  // The upper lip, and the tuft under the lower lip down to the beard (no bare chin band).
  const lip = (p: Vec3): number =>
    Math.max(
      mouth[2] + 0.002 * s - p[2],
      p[2] - (sub[2] - 0.001 * s),
      Math.abs(p[1]) - 0.034 * s,
      mouth[0] - 0.012 * s - p[0],
    );
  const tuft = (p: Vec3): number =>
    Math.max(
      mouth[2] - 0.024 * s - p[2],
      p[2] - (mouth[2] - 0.009 * s),
      Math.abs(p[1]) - 0.022 * s,
      mouth[0] - 0.014 * s - p[0],
    );
  return (p) => Math.min(lip(p), tuft(p));
}

/** The beard's card layers (lock style: coarse cells): the hanging beard rooted on `roots`, short
 *  hair lying on the cheeks inside `line`, and a moustache rooted on the upper lip that leaves it
 *  and lies over it (combed out and down by the bust's comb), past the mouth's corners. */
export function beardLayers(head: FaceHead, roots: Field, line: Field, warm: Vec3): CardLayer[] {
  const s = head.scale;
  return [
    {
      name: 'beard',
      kind: 'beard',
      region: roots,
      density: 6000,
      length: 0.06 * s,
      width: 0.012 * s,
      lift: 0.3,
      bend: 0.6,
      droop: 0.45,
      clump: 3,
      fold: 0,
      tone: [0.6, 1.1],
      tint: warm,
    },
    // Short hair lying on the cheeks and the jaw: the beard's upper edge grows out of the
    // skin, with no bare band of the mass between the cheek line and the hanging locks.
    {
      name: 'beard_cheek',
      kind: 'beard',
      // (Lifted off the mass: cards hugging it at their 3 mm root sink lay buried in it.)
      region: line,
      density: 11000,
      length: 0.034 * s,
      width: 0.013 * s,
      lift: 0.22,
      bend: 0.7,
      droop: 0.4,
      fold: 0,
      tone: [0.6, 1.05],
      tint: warm,
      hug: 0.5,
    },
    {
      name: 'moustache',
      kind: 'beard',
      region: moustacheOf(head),
      density: 60000,
      length: 0.026 * s,
      width: 0.008 * s,
      // Out off the lip, then down over it: the field the cards root on is the head meshed at
      // 4.5 mm, which sits inside the lips' bulge, so cards hugging it lay under the visible lip.
      lift: 0.45,
      bend: 0.85,
      droop: 0.5,
      clump: 2,
      fold: 0,
      tone: [0.6, 1.05],
      tint: warm,
      hug: 0.2,
    },
  ];
}
