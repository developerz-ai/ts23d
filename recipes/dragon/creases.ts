// The folds Cinderhorn is sculpted with, declared for QA `connections`. Its seam check flags
// junction lines tighter than 2.5 cm (or folding ≥ 40° in one edge) on big shells; every fold left
// here is anatomy the sculpt carves on purpose: the body's grooves (body.ts GROOVES), the hock's
// flexion fold, the lip, gum and palate lines, the nostrils, the brow tip, the eyelids and the
// tongue on the mouth floor. Each is declared as a string of small beads laid ON the fold (from the
// same coordinates the sculpt edits use), never a blanket sphere over a region: a new accidental
// join next to a declared fold still fails. Accidental joins were fixed in the geometry instead.

import type { IntendedCrease, Vec3 } from '@developerz.ai/ts23d';
import { GROOVES } from './body.ts';
import { lipWidth, MOUTH_Z } from './head.ts';
import { SK } from './skeleton.ts';

const H = SK.head;
const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Points every ≤ `step` metres from a to b, both ends included. */
function along(a: Vec3, b: Vec3, step: number): Vec3[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
  return Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
}

/** One bead per point, left side and its mirror. */
function beads(
  part: string,
  name: string,
  pts: readonly Vec3[],
  radius: number,
  why: string,
): IntendedCrease[] {
  return pts.flatMap((at, i) => [
    { name: `${name}_${i}_l`, part, at, radius, why },
    { name: `${name}_${i}_r`, part, at: flip(at), radius, why },
  ]);
}

/** The carved body grooves: beads along each capsule, as wide as the groove and its blend. */
function body(): IntendedCrease[] {
  const grooves = GROOVES.flatMap((g) =>
    beads('body', g.name, along(g.a, g.b, 0.06), g.r * 2.2 + 0.02, g.why),
  );
  // Hock: the flexion fold across the front of the ankle, where the shin meets the metatarsus.
  const k = SK.hind.hock;
  const hock = beads(
    'body',
    'hock',
    along([k[0] + 0.17, k[1] - 0.1, k[2] - 0.04], [k[0] + 0.17, k[1] + 0.1, k[2] - 0.04], 0.05),
    0.06,
    'flexion fold across the front of the hock',
  );
  return [...grooves, ...hock];
}

/** The upper head: lip and gum lines, palate, nostril, brow tip. */
function head(): IntendedCrease[] {
  const xs = along([2.5, 0, 0], [H.nose[0] - 0.06, 0, 0], 0.06).map((p) => p[0]);
  return [
    // Lip ridge over the cheek, then the gum line inside it (head.ts lipLine at +3.5 / −0.5 cm).
    ...beads(
      'head',
      'lip',
      xs.map((x): Vec3 => [x, lipWidth(x), MOUTH_Z + 0.06]),
      0.07,
      'upper lip ridge meeting the cheek, mouth corner to snout',
    ),
    ...beads(
      'head',
      'gum',
      xs.map((x): Vec3 => [x, Math.max(0.03, lipWidth(x) - 0.05), MOUTH_Z]),
      0.07,
      'gum line inside the lip, where the palate is cut and the teeth root',
    ),
    ...beads(
      'head',
      'throat',
      [[2.62, 0.04, MOUTH_Z]],
      0.06,
      'back of the palate meeting the throat mass behind the teeth',
    ),
    ...beads(
      'head',
      'nostril',
      [[H.nose[0] - 0.06, 0.08, 3.385]],
      0.06,
      'nostril bored into the nose boss',
    ),
    ...beads(
      'head',
      'brow',
      [[H.eye[0] + 0.1, H.eye[1] - 0.065, H.eye[2] + 0.02]],
      0.06,
      "brow ridge tip overhanging the eye's front corner",
    ),
  ];
}

/** Jaw hinge frame → world: the jaw is sculpted at the hinge, then opened by the rest angle. */
function jawWorld(x: number, y: number, z: number): Vec3 {
  const a = (H.open * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [H.hinge[0] + x * c + z * s, H.hinge[1] + y, H.hinge[2] - x * s + z * c];
}

/** The lower jaw: the tongue lying in the gum trough of the mouth floor (jaw.ts). */
function jaw(): IntendedCrease[] {
  const pts = along([0.15, 0, 0], [1.15, 0, 0], 0.08).map((p) => jawWorld(p[0], 0, -0.025));
  return pts.map((at, i) => ({
    name: `mouth_floor_${i}`,
    part: 'jaw',
    at,
    radius: 0.12,
    why: 'tongue lying in the gum trough of the mouth floor',
  }));
}

/** Every intended crease of the dragon. */
export function dragonCreases(): IntendedCrease[] {
  const eyelid = (s: 'l' | 'r'): IntendedCrease => ({
    name: `eyelids_${s}`,
    part: `eye_socket_${s}`,
    at: s === 'l' ? H.eye : flip(H.eye),
    // The lids are an 8 cm sphere round the eye; the outer socket rim stays checked.
    radius: 0.09,
    why: 'upper and lower lids folding over the eye',
  });
  return [...body(), ...head(), ...jaw(), eyelid('l'), eyelid('r')];
}
