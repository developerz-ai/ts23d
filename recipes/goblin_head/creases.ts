// The goblin bust's intended creases, from the geometry that sculpts them
// (../_lib/bust/creases.ts): lids, nose wings, lip line, nasolabial folds, the huge ears; the
// grin and its teeth; the worried brow; each wart and wisp root; the scarf band, knot and tails;
// the vest and hood edges; the shirt crease. Every region ≤ 3 cm. Anything else QA `connections`
// finds is a seam to blend.

import { type IntendedCrease, sculptField } from '@developerz.ai/ts23d';
import { cutCreases, torsoCreases } from '../_lib/bust/anatomy-creases.ts';
import { bustEdits, bustScalp } from '../_lib/bust/bust.ts';
import { creaseAt, creaseCurve, edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { graftLine } from '../_lib/bust/ear-graft.ts';
import { spline, surface, type V } from '../_lib/bust/kit.ts';
import { skullCreases } from '../_lib/face/skull-creases.ts';
import { GOBLIN_BUST } from './build.ts';
import {
  BACK,
  hoodRegion,
  outfitCreases,
  PARTS,
  scarfKnot,
  scarfRing,
  scarfTails,
  shirtCreases,
  toggleLine,
  vestRegion,
} from './clothes.ts';
import { browLines, grinLine, WARTS } from './features.ts';
import { WISPS, wispLine } from './hair.ts';
import { GRAFT, H, LT as L, SK, SPEC, TORSO } from './spec.ts';
import { bodyEdits } from './torso.ts';

function creases(): IntendedCrease[] {
  const { skin } = bustEdits(GOBLIN_BUST, 2, 0);
  const scalp = surface(bustScalp(GOBLIN_BUST, 0));
  const body = sculptField(bodyEdits(), {
    color: SPEC.skin,
    mirror: 'y',
  }).field;
  const box: [V, V] = [
    [-0.3, -0.3, 0.06],
    [0.3, 0.3, L.mz + 0.02],
  ];
  return [
    // Every garment edge the cloth tailoring (clothes.ts) stands off the layer beneath.
    ...outfitCreases(skin),
    ...skullCreases(SK, H),
    ...creaseCurve(
      'ear_blade',
      'head',
      graftLine(SK, GRAFT),
      0.028,
      'the ear’s leaf: its rolled helix, antihelix, concha and notches',
      true,
    ),
    ...torsoCreases(L, TORSO),
    ...creaseCurve('grin', 'head', grinLine(), 0.02, 'the grin’s slit and its pointed teeth', true),
    ...browLines().flatMap((l, i) =>
      creaseCurve(`brow${i}`, 'head', l, 0.015, 'a worried-brow crease', true),
    ),
    ...WARTS.flatMap(([p, r], i) =>
      creaseAt(`wart${i}`, 'head', p, Math.max(0.008, r * H * 1.6), 'a wart’s rim on the skin'),
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
    ...PARTS.flatMap((part) => [
      ...ringCreases(`scarf_${part}`, part, scarfRing(skin.field), 0.025, 'the scarf band'),
      ...creaseAt(`scarf_knot_${part}`, part, scarfKnot(skin), 0.025, 'the scarf knot'),
      ...scarfTails(skin).flatMap((t, i) =>
        creaseCurve(`scarf_tail${i}_${part}`, part, t, 0.02, 'a scarf tail on the vest'),
      ),
    ]),
    ...shirtCreases().flatMap((l, i) =>
      creaseCurve(`shirt${i}`, 'clothes', l, 0.015, 'shirt crease at the vest opening', true),
    ),
    ...PARTS.flatMap((part) => [
      ...edgeCreases(`vest_edge_${part}`, part, body, vestRegion, box, 0.025, 'the vest’s edge'),
      ...edgeCreases(`hood_edge_${part}`, part, body, hoodRegion, box, 0.025, 'the hood’s edge'),
    ]),
    // Where the stiff back panel, hanging clear of the body, ends at each armhole.
    ...creaseAt(
      'vest_back_corner',
      'clothes',
      [BACK.x, BACK.halfY, TORSO.cutZ + 0.012],
      0.025,
      'the hanging back panel’s corner at the armhole',
      true,
    ),
    // The thong where it loops the horn toggle and bends over the vest's edges.
    ...creaseCurve('toggle', 'toggle', toggleLine(skin), 0.012, 'the thong round the toggle'),
    ...cutCreases(body, TORSO.cutZ),
  ];
}

export const GOBLIN_CREASES: readonly IntendedCrease[] = creases();
