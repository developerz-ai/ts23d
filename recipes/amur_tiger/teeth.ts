// Teeth (head-local frame): the canines that read — the longest of any cat (6.4–7.6 cm total,
// Wikipedia: Tiger), ~4.5 cm of crown showing — rooted in the gum under the lip, slightly curved
// back; the lower canines sit in front of the uppers when the mouth closes. A row of small
// incisors between them. Tubes (hornTube), meshed finer than any sculpt cell could.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { merge, place } from '@developerz.ai/ts23d';
import { v3 } from '../_lib/creature/curve.ts';
import { clawHorn, type HornOptions, hornTube } from '../_lib/creature/horn.ts';
import { TOOTH } from './palette.ts';
import { HEAD } from './skeleton.ts';

const M = HEAD.mouthZ;

/** Upper canine (left): root hidden in the gum above the lip line, crown curving down and back. */
export const UPPER_CANINE = {
  root: [0.286, 0.03, M + 0.022] as Vec3,
  dir: v3.norm([0.12, 0.02, -1]),
  length: 0.056,
  radius: 0.0085,
};

/** Lower canine (left) in the jaw's closed frame: root in the jaw, crown pointing up and out. */
export const LOWER_CANINE = {
  root: [0.298, 0.021, M - 0.03] as Vec3,
  dir: v3.norm([0.12, 0.08, 1]),
  length: 0.042,
  radius: 0.0072,
};

function canine(o: typeof UPPER_CANINE, back: Vec3, segs: number): HornOptions {
  return clawHorn({
    base: o.root,
    dir: o.dir,
    down: back,
    length: o.length,
    radius: o.radius,
    segments: segs,
    colors: TOOTH,
    curl: 22,
    tip: 0.0012,
  });
}

const both = (m: Mesh): Mesh => merge([m, place(m, { scale: [1, -1, 1] })]);

/** Upper canines, head-local (the incisors sit behind the lip at rest: not emitted). */
export function upperTeeth(lod: 0 | 1 | 2): Mesh {
  const segs = [8, 4, 2][lod] ?? 2;
  const sides = [10, 6, 4][lod] ?? 4;
  return both(hornTube(canine(UPPER_CANINE, [-1, 0, 0], segs), sides));
}

/** Lower canines in the jaw's closed frame (head-local); the lower incisors stay hidden behind
 *  the lip at rest, so they are not emitted. */
export function lowerTeeth(lod: 0 | 1 | 2): Mesh {
  const segs = [8, 4, 2][lod] ?? 2;
  const sides = [10, 6, 4][lod] ?? 4;
  return both(hornTube(canine(LOWER_CANINE, [-1, 0, 0.2], segs), sides));
}
