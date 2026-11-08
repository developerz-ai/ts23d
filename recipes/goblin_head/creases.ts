// The goblin bust's intended creases, from the geometry that sculpts them
// (../_lib/bust/creases.ts): lids, nose wings, lip line, nasolabial folds, the huge ears; the
// grin and its teeth; the worried brow; each wart and wisp root; the scarf band, knot and tails;
// the vest and hood edges; the shirt crease. Every region ≤ 3 cm. Anything else QA `connections`
// finds is a seam to blend.

import { type IntendedCrease, sculptField } from '@developerz.ai/ts23d';
import { anatomyCreases, cutCreases, torsoCreases } from '../_lib/bust/anatomy-creases.ts';
import { bustEdits } from '../_lib/bust/bust.ts';
import { creaseAt, creaseCurve, edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { headBlock } from '../_lib/bust/head.ts';
import { spline, surface, type V } from '../_lib/bust/kit.ts';
import { torsoEdits } from '../_lib/bust/torso.ts';
import { GOBLIN_BUST } from './build.ts';
import {
  hoodRegion,
  scarfKnot,
  scarfRing,
  scarfTails,
  shirtCreases,
  vestRegion,
} from './clothes.ts';
import { browLines, grinLine, WARTS } from './features.ts';
import { WISPS, wispLine } from './hair.ts';
import { EAR, H, L, SPEC, TORSO } from './spec.ts';

function creases(): IntendedCrease[] {
  const { skin } = bustEdits(GOBLIN_BUST, 2, 0);
  const scalp = surface(sculptField([headBlock(SPEC, 2)], { color: SPEC.skin, mirror: 'y' }).field);
  const body = sculptField(torsoEdits(L, TORSO), { color: SPEC.skin, mirror: 'y' }).field;
  const box: [V, V] = [
    [-0.3, -0.3, 0.06],
    [0.3, 0.3, L.mz + 0.02],
  ];
  return [
    ...anatomyCreases(SPEC, L, EAR),
    ...torsoCreases(L, TORSO),
    ...creaseCurve('grin', 'head', grinLine(), 0.02, 'the grin’s slit and its pointed teeth', true),
    ...browLines().flatMap((l, i) =>
      creaseCurve(`brow${i}`, 'head', l, 0.015, 'a worried-brow crease', true),
    ),
    ...WARTS.flatMap(([p, r], i) =>
      creaseAt(`wart${i}`, 'head', p, Math.max(0.012, r * H * 2), 'a wart’s rim on the skin'),
    ),
    ...WISPS.flatMap(([dx, dy, len, lean], i) =>
      creaseCurve(
        `wisp${i}`,
        'head',
        spline(wispLine(scalp, dx, dy, len, lean), 10),
        0.012,
        'a hair wisp: its root in the scalp and the bends of the strand',
      ),
    ),
    ...['head', 'bust'].flatMap((part) => [
      ...ringCreases(`scarf_${part}`, part, scarfRing(skin.field), 0.025, 'the scarf band'),
      ...creaseAt(`scarf_knot_${part}`, part, scarfKnot(skin), 0.025, 'the scarf knot'),
      ...scarfTails(skin).flatMap((t, i) =>
        creaseCurve(`scarf_tail${i}_${part}`, part, t, 0.02, 'a scarf tail on the vest'),
      ),
    ]),
    ...shirtCreases().flatMap((l, i) =>
      creaseCurve(`shirt${i}`, 'bust', l, 0.015, 'shirt crease at the vest opening', true),
    ),
    ...['head', 'bust'].flatMap((part) => [
      ...edgeCreases(`vest_edge_${part}`, part, body, vestRegion, box, 0.025, 'the vest’s edge'),
      ...edgeCreases(`hood_edge_${part}`, part, body, hoodRegion, box, 0.025, 'the hood’s edge'),
    ]),
    ...cutCreases(body, TORSO.cutZ),
  ];
}

export const GOBLIN_CREASES: readonly IntendedCrease[] = creases();
