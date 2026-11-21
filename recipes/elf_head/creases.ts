// The elf bust's intended creases, from the geometry that sculpts them (../_lib/bust/creases.ts):
// lids, nose wings, lip line, ears; each long lock and front ribbon lock; the hairline; the two
// collar rolls; the cloak's edge; the clasp. Every region ≤ 3 cm. Anything else QA `connections`
// finds is a seam to blend.

import { type IntendedCrease, sculptField } from '@developerz.ai/ts23d';
import { cutCreases, torsoCreases } from '../_lib/bust/anatomy-creases.ts';
import { bustEdits, bustScalp } from '../_lib/bust/bust.ts';
import { creaseAt, creaseCurve, edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { graftLine } from '../_lib/bust/ear-graft.ts';
import { spline, surface, type V } from '../_lib/bust/kit.ts';
import { neckSeam } from '../_lib/bust/torso.ts';
import { skullCreases } from '../_lib/face/skull-creases.ts';
import { ELF_BUST } from './build.ts';
import {
  capeRegion,
  cloakRegion,
  cloakSurface,
  collarRing,
  neckOf,
  outfitCreases,
  PARTS,
} from './clothes.ts';
import { frontLocks, hairline, longLocks } from './hair.ts';
import { GRAFT, H, L, SK, SPEC, TORSO } from './spec.ts';
import { bodyEdits } from './torso.ts';

function creases(): IntendedCrease[] {
  const { skin } = bustEdits(ELF_BUST, 2, 0);
  const scalp = bustScalp(ELF_BUST, 0);
  const body = sculptField(bodyEdits(), {
    color: SPEC.skin,
    mirror: 'y',
  }).field;
  const hair = surface((p) => scalp(p) - 0.007);
  const ring = collarRing(skin.field);
  const upper = ring.map((p): V => [p[0], p[1] * 1.04, p[2] + 0.012]);
  const seam = neckSeam(L);
  return [
    // Every garment edge the cloth tailoring (clothes.ts) stands off the layer beneath.
    ...outfitCreases(skin),
    ...skullCreases(SK, H),
    // The fine bridge of the nose where it leaves the brow: a ridge between two steep flanks.
    ...creaseCurve(
      'nose_root',
      'head',
      [
        [SK.nasion[0], 0, SK.nasion[2] + 0.008],
        [SK.nasion[0], 0, SK.nasion[2] - 0.006],
        [SK.nasion[0] + 0.004, 0, SK.nasion[2] - 0.02],
      ],
      0.012,
      'the narrow bridge of the nose at its root, under the brow',
    ),
    ...creaseCurve(
      'ear_blade',
      'head',
      graftLine(SK, GRAFT),
      0.024,
      'the ear’s leaf: its rolled helix, antihelix and concha',
      true,
    ),
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
    ...PARTS.flatMap((part) => [
      ...ringCreases(
        `collar_${part}`,
        part,
        ring,
        0.025,
        'gold-trimmed collar roll on the neck seam',
      ),
      ...ringCreases(`collar_top_${part}`, part, upper, 0.025, 'the collar’s upper roll'),
    ]),
    ...['bust', 'clothes'].flatMap((part) =>
      edgeCreases(
        `cloak_edge_${part}`,
        part,
        body,
        cloakRegion,
        [
          [-0.3, -0.35, 0.08],
          [0.3, 0.35, L.mz],
        ],
        0.025,
        'the cloak’s edge standing 12 mm off the tunic',
      ),
    ),
    // The cape's leaf-cut hem where it lies on the hanging cloak, clear of the body.
    ...edgeCreases(
      'cape_on_cloak',
      'clothes',
      cloakSurface(skin),
      capeRegion(neckOf(skin.field)),
      [
        [-0.3, -0.35, 0.08],
        [0.3, 0.35, L.mz],
      ],
      0.025,
      'the shoulder cape’s hem on the cloak',
    ),
    ...cutCreases(body, TORSO.cutZ),
    ...creaseAt(
      'clasp',
      'clasp',
      [L.gx - 0.12 * H, 0, seam.at[2] - 0.03],
      0.012,
      'the leaf clasp’s rim',
    ),
  ];
}

export const ELF_CREASES: readonly IntendedCrease[] = creases();
