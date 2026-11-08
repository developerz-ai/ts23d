// The human bust's intended creases, from the geometry that sculpts them (../_lib/bust/creases.ts):
// lids, nose wings, lip line, nasolabial folds, ears; each swept hair lock and beard lock and the
// moustache; the hairline and beard edge; the collar roll; the tunic folds; the mantle's edge;
// the brooch. Every region ≤ 3 cm. Anything else QA `connections` finds is a seam to blend.

import { type IntendedCrease, sculptField } from '@developerz.ai/ts23d';
import { anatomyCreases, cutCreases, torsoCreases } from '../_lib/bust/anatomy-creases.ts';
import { bustEdits } from '../_lib/bust/bust.ts';
import { creaseAt, creaseCurve, edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { headBlock } from '../_lib/bust/head.ts';
import { collarRing, mantleRegion, tunicFolds } from '../_lib/bust/human/clothes.ts';
import { EAR, H, L, SPEC, TORSO } from '../_lib/bust/human/spec.ts';
import { surface, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';
import { HUMAN_BUST } from './build.ts';
import { beardLines, beardline, hairLines, hairline, moustache } from './hair.ts';

function creases(): IntendedCrease[] {
  const { skin } = bustEdits(HUMAN_BUST, 2, 0);
  const scalp = sculptField([headBlock(SPEC, 2)], { color: SPEC.skin, mirror: 'y' }).field;
  const body = sculptField(torsoEdits(L, TORSO), { color: SPEC.skin, mirror: 'y' }).field;
  const headBox: [[number, number, number], [number, number, number]] = [
    [L.back - 0.02, -0.12, L.mz - 0.06 * H],
    [L.gx + 0.04, 0.12, L.crown + 0.02],
  ];
  const ring = collarRing(skin.field);
  // Lock lines lie on the hair: project them onto the scalp pushed out by the mass's thickness.
  const onHair = (line: V[], t: number): V[] => line.map((p) => sc.off(p, t));
  const sc = surface(scalp);
  return [
    ...anatomyCreases(SPEC, L, EAR),
    ...torsoCreases(L, TORSO),
    ...hairLines().flatMap((l, i) =>
      creaseCurve(
        `hair_lock${i}`,
        'head',
        onHair(l, 0.008),
        0.02,
        'groove beside a swept hair lock',
        true,
      ),
    ),
    ...beardLines().flatMap((l, i) =>
      creaseCurve(
        `beard_lock${i}`,
        'head',
        onHair(l, 0.006),
        0.02,
        'groove beside a beard lock',
        true,
      ),
    ),
    ...creaseCurve('moustache', 'head', moustache(), 0.015, 'moustache lock on the lip', true),
    // Where each mass's surface (the scalp pushed out, inside its line) meets the skin.
    ...edgeCreases(
      'hairline',
      'head',
      skin.field,
      (p) => Math.max(scalp(p) - 0.008, hairline(p)),
      headBox,
      0.02,
      'edge of the hair mass',
    ),
    ...edgeCreases(
      'beard_edge',
      'head',
      skin.field,
      (p) => Math.max(scalp(p) - 0.006, beardline(p)),
      headBox,
      0.02,
      'edge of the beard',
    ),
    ...['head', 'bust'].flatMap((part) =>
      ringCreases(`collar_${part}`, part, ring, 0.025, 'leather collar roll on the neck seam'),
    ),
    ...tunicFolds().flatMap((f, i) =>
      creaseCurve(`tunic_fold${i}`, 'bust', f, 0.02, 'tunic fold under the collar', true),
    ),
    ...edgeCreases(
      'mantle_edge',
      'bust',
      body,
      mantleRegion,
      [
        [-0.3, -0.35, 0.08],
        [0.3, 0.35, L.mz],
      ],
      0.025,
      'the mantle’s edge standing 16 mm off the tunic',
    ),
    ...cutCreases(body, TORSO.cutZ),
    ...creaseAt(
      'brooch',
      'brooch',
      [L.gx - 0.12 * H, 0.08, L.mz - 0.3 * H - 0.035],
      0.02,
      'ring and boss of the brooch',
      true,
    ),
  ];
}

export const HUMAN_CREASES: readonly IntendedCrease[] = creases();
