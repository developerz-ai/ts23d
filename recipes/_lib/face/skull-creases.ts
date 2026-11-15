// Intended creases of a skull-stage head, declared from the geometry that makes them: each
// feature stroke's own path (planes.ts `featureLines`), the lid margins round the eyeball, the
// orbit behind it, the nose base and alar grooves, the lip line, each ear's rims and root from the
// warped base's ear landmarks. QA `connections` excuses only seams on these folds.

import type { IntendedCrease, Vec3 } from '@developerz.ai/ts23d';
import { creaseAt, creaseCurve } from '../bust/creases.ts';
import { featureLines } from './features.ts';
import type { SkullLandmarks } from './skull.ts';

export function skullCreases(k: SkullLandmarks, H: number, part = 'head'): IntendedCrease[] {
  const [ex, ey, ez] = k.eye;
  const R = k.eyeR;
  const ear = (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  return [
    ...featureLines(k, H).flatMap((l) =>
      creaseCurve(l.name, part, l.path, Math.max(0.006, l.radius * H * 0.8), l.why, true),
    ),
    ...creaseCurve(
      'lids',
      part,
      [
        k.endocanthion,
        [ex + R * 0.85, ey, ez + R * 0.55],
        k.exocanthion,
        [ex + R * 0.85, ey, ez - R * 0.5],
        k.endocanthion,
      ],
      R * 0.9,
      'upper and lower lid margins round the eyeball and the canthi',
      true,
    ),
    ...creaseAt('orbit', part, [ex - R * 0.5, ey, ez], R * 1.4, 'the orbit behind the ball', true),
    ...creaseCurve(
      'alae',
      part,
      [
        k.subnasale,
        k.alare,
        [k.alare[0] - 0.012 * H, k.alare[1] + 0.006 * H, k.alare[2] + 0.02 * H],
      ],
      0.012,
      'the nose base, nostril and the alar groove round the wing',
      true,
    ),
    ...creaseCurve(
      'columella',
      part,
      [k.subnasale, [(k.subnasale[0] + k.pronasale[0]) / 2 - 0.004, 0, k.pronasale[2]]],
      0.012,
      'the columella between the nostrils, under the nose tip',
    ),
    ...creaseCurve(
      'lip_line',
      part,
      [k.stomion, k.cheilion],
      0.01,
      'the lip line between the closed lips to the mouth corner',
      true,
    ),
    ...creaseCurve(
      'ear',
      part,
      [
        k.tragion,
        ear(k.tragion, k.earTop, 0.6),
        k.earTop,
        k.earTip,
        k.earOut,
        k.earBack,
        k.earLobe,
        k.tragion,
      ],
      0.018,
      'helix, antihelix, concha and the root where the ear grows from the head',
      true,
    ),
    // The jaw angle and the crisp jaw line the pinch stroke draws (planes.ts `muscleStrokes`).
    ...creaseCurve(
      'jaw_angle',
      part,
      [
        k.mastoid,
        k.gonion,
        [(k.gonion[0] + k.menton[0]) / 2, k.gonion[1] * 0.8, (k.gonion[2] + k.menton[2]) / 2],
      ],
      0.015,
      'the jaw angle and the jaw line from under the ear to under the chin',
      true,
    ),
    // The nape: the trapezius rising into the back of the neck below the skull.
    ...creaseCurve(
      'nuchal',
      part,
      [k.nape, [k.nape[0] - 0.03, 0, k.nape[2] - 0.01], [k.nape[0] - 0.06, 0, k.nape[2] - 0.02]],
      0.02,
      'the nuchal furrow where the trapezius rises into the back of the neck',
    ),
    // The root's upper arc: a long or swung-out ear folds out of the temple above its top.
    ...creaseCurve(
      'ear_root',
      part,
      [
        k.tragion,
        [k.earTop[0] + 0.004, k.earTop[1] * 0.92, k.earTop[2] + 0.025],
        [k.earBack[0] - 0.004, k.earBack[1] * 0.92, k.earBack[2] + 0.02],
        k.earLobe,
      ],
      0.02,
      'the ear root above and behind the ear, where the blade folds out of the head',
      true,
    ),
  ];
}
