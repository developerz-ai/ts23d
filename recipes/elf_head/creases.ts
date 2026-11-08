// The elf bust's intended creases, from the geometry that sculpts them (../_lib/bust/creases.ts):
// lids, nose wings, lip line, ears; each long lock and front ribbon lock; the hairline; the two
// collar rolls; the cloak's edge; the clasp. Every region ≤ 3 cm. Anything else QA `connections`
// finds is a seam to blend.

import { type IntendedCrease, sculptField } from '@developerz.ai/ts23d';
import { anatomyCreases, cutCreases, torsoCreases } from '../_lib/bust/anatomy-creases.ts';
import { bustEdits } from '../_lib/bust/bust.ts';
import { creaseAt, creaseCurve, edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { headBlock } from '../_lib/bust/head.ts';
import { spline, surface, type V } from '../_lib/bust/kit.ts';
import { neckSeam, torsoEdits } from '../_lib/bust/torso.ts';
import { ELF_BUST } from './build.ts';
import { cloakRegion, collarRing } from './clothes.ts';
import { frontLocks, hairline, longLocks } from './hair.ts';
import { EAR, H, L, SPEC, TORSO } from './spec.ts';

function creases(): IntendedCrease[] {
  const { skin } = bustEdits(ELF_BUST, 2, 0);
  const scalp = sculptField([headBlock(SPEC, 2)], { color: SPEC.skin, mirror: 'y' }).field;
  const body = sculptField(torsoEdits(L, TORSO), { color: SPEC.skin, mirror: 'y' }).field;
  const hair = surface((p) => scalp(p) - 0.007);
  const ring = collarRing(skin.field);
  const upper = ring.map((p): V => [p[0], p[1] * 1.04, p[2] + 0.012]);
  const seam = neckSeam(L);
  return [
    ...anatomyCreases(SPEC, L, EAR),
    ...torsoCreases(L, TORSO),
    ...longLocks(7, hair).flatMap(({ ctrl }, i) =>
      ['head', 'bust'].flatMap((part) =>
        creaseCurve(
          `lock${i}_${part}`,
          part,
          spline(ctrl, 16),
          0.02,
          'grooves beside a long lock',
          true,
        ),
      ),
    ),
    ...frontLocks(hair).flatMap(({ ctrl }, i) =>
      ['head', 'bust'].flatMap((part) =>
        creaseCurve(
          `ribbon${i}_${part}`,
          part,
          spline(ctrl, 14),
          0.02,
          'a flat front lock’s strand grooves and its lie on the cheek',
        ),
      ),
    ),
    ...edgeCreases(
      'hairline',
      'head',
      skin.field,
      (p) => Math.max(scalp(p) - 0.007, hairline(p)),
      [
        [L.back - 0.02, -0.12, L.mz],
        [L.gx + 0.04, 0.12, L.crown + 0.02],
      ],
      0.02,
      'edge of the hair mass',
    ),
    ...['head', 'bust'].flatMap((part) => [
      ...ringCreases(
        `collar_${part}`,
        part,
        ring,
        0.025,
        'gold-trimmed collar roll on the neck seam',
      ),
      ...ringCreases(`collar_top_${part}`, part, upper, 0.025, 'the collar’s upper roll'),
    ]),
    ...edgeCreases(
      'cloak_edge',
      'bust',
      body,
      cloakRegion,
      [
        [-0.3, -0.35, 0.08],
        [0.3, 0.35, L.mz],
      ],
      0.025,
      'the cloak’s edge standing 12 mm off the tunic',
    ),
    ...cutCreases(body, TORSO.cutZ),
    ...creaseAt(
      'clasp',
      'clasp',
      [L.gx - 0.12 * H, 0, seam.at[2] - 0.03],
      0.02,
      'the leaf clasp’s rim',
    ),
  ];
}

export const ELF_CREASES: readonly IntendedCrease[] = creases();
