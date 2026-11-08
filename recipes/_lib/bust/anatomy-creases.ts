// The busts' anatomical intended creases, declared from the landmarks that sculpt them (creases.ts
// has the helpers): lid margins and orbit bore, the nose base and alar groove, the lip line, the
// nasolabial folds (races with lines), a long nose's root, each ear's midline and rims; the
// nuchal furrow and the armpits; the bust cut's rim.

import type { Field, IntendedCrease } from '@developerz.ai/ts23d';
import { creaseAt, creaseCurve, edgeCreases, MAX_CREASE } from './creases.ts';
import { type EarSpec, earFrame } from './ear.ts';
import { type HeadSpec, HUMAN, type Landmarks } from './head.ts';
import { at } from './kit.ts';

/** The face and ears: lid folds, nose wings and nostrils, the lip line and mouth corners, the
 *  nasolabial folds (when the race has lines), each ear's helix / antihelix / concha and root. */
export function anatomyCreases(
  s: HeadSpec,
  l: Landmarks,
  ear: EarSpec,
  part = 'head',
): IntendedCrease[] {
  const { H } = l;
  const [ex, ey, ez] = l.eye;
  const R = l.eyeR;
  const out: IntendedCrease[] = [
    // Upper and lower lid margins and the upper-lid fold, round the front of the ball.
    ...creaseCurve(
      'lids',
      part,
      [
        [ex + R * 0.5, ey - R * 1.1, ez],
        [ex + R * 0.9, ey, ez + R * 0.6],
        [ex + R * 0.5, ey + R * 1.1, ez],
        [ex + R * 0.9, ey, ez - R * 0.5],
        [ex + R * 0.5, ey - R * 1.1, ez],
      ],
      R * 1.2,
      'upper and lower lid margins, the lid fold and the canthi',
      true,
    ),
    // The orbit's bore rim round the back of the ball (hidden behind it).
    ...creaseAt(
      'orbit',
      part,
      [ex - R * 0.5, ey, ez],
      R * 1.4,
      'rim of the orbit bore seating the eyeball (behind the ball)',
      true,
    ),
    // The alar groove: from the nostril round the wing up to where it meets the cheek.
    ...creaseCurve(
      'alae',
      part,
      [
        [l.subnasale[0] + 0.005 * H, 0.05 * H, l.subnasale[2] - 0.035 * H],
        [l.subnasale[0] + 0.005 * H, 0.03 * H, l.subnasale[2] + 0.01 * H],
        [l.subnasale[0] - 0.01 * H, 0.06 * H, l.subnasale[2] + 0.03 * H],
        [l.subnasale[0] - 0.005 * H, 0.07 * H, l.subnasale[2] + 0.09 * H],
      ],
      0.045 * H,
      'the nose base on the upper lip, the nostril and the alar groove round the nose wing',
      true,
    ),
    ...creaseCurve(
      'lips',
      part,
      [
        [l.mouth[0] - 0.04 * H, 0.1 * H, l.mouth[2]],
        [l.mouth[0], 0, l.mouth[2]],
      ],
      0.03 * H,
      'the lip line between the lips and the mouth corners',
      true,
    ),
  ];
  if ((s.knobs?.lines ?? 1) > 0)
    out.push(
      ...creaseCurve(
        'nasolabial',
        part,
        [
          [l.subnasale[0] - 0.02 * H, 0.08 * H, l.subnasale[2] + 0.03 * H],
          [l.mouth[0] - 0.07 * H, 0.17 * H, l.mouth[2] - 0.03 * H],
        ],
        0.03 * H,
        'the nasolabial fold from the nose wing to the mouth corner',
        true,
      ),
    );
  // A long stylised nose (≥ 1.5 × the human projection) grows out of the brow at the nasion.
  if (s.r.noseProj > HUMAN.noseProj * 1.5)
    out.push(
      ...creaseCurve(
        'nose_root',
        part,
        [l.nasion, [l.subnasale[0] - 0.03 * H, 0, (l.nasion[2] + l.subnasale[2]) / 2]],
        0.02,
        'root of the long nose where it grows from the brow and face',
      ),
    );
  // Ear: from the root (where it grows from the head) out along the blade to the tip, along its
  // midline and both rims (front and back edge of the blade).
  const f = earFrame(ear);
  const reach = ear.length * (1 + (ear.tip ?? 0));
  const half = (ear.length * (ear.width ?? 0.55)) / 2;
  const earR = Math.min(MAX_CREASE, ear.length * 0.4);
  for (const [k, v] of [
    ['mid', 0],
    ['back', half],
    ['front', -half],
  ] as const)
    out.push(
      ...creaseCurve(
        `ear_${k}`,
        part,
        [0, 0.25, 0.5, 0.75, 1].map((t) =>
          at(f, reach * t, v * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.3))), 0),
        ),
        earR,
        'helix rim, antihelix and concha folds, and the root where the ear grows from the head',
        true,
      ),
    );
  return out;
}

/** The torso's anatomical folds: the nuchal furrow down the nape between the two trapezius
 *  (`part`, usually the head part that carries the neck) and the armpits where the arm stubs
 *  meet the rib cage (the bust part). */
export function torsoCreases(
  l: Landmarks,
  t?: { readonly shoulders: number },
  part = 'head',
): IntendedCrease[] {
  const { H } = l;
  const out = creaseCurve(
    'nuchal_furrow',
    part,
    [
      [l.back + 0.16 * H, 0, l.mz + 0.24 * H],
      [l.back + 0.2 * H, 0, l.mz - 0.15 * H],
    ],
    0.015,
    'the nuchal furrow down the nape between the trapezius',
  );
  if (!t) return out;
  const chestZ = l.mz - 0.75 * H;
  const x = l.back + 0.45 * H;
  const sh = t.shoulders;
  for (const [k, dx] of [
    ['front', 0.3],
    ['back', -0.3],
  ] as const)
    out.push(
      ...creaseCurve(
        `axilla_${k}`,
        'bust',
        [
          [x + dx * H, sh * 0.82, chestZ + 0.22 * H],
          [x + dx * 0.6 * H, sh * 0.86, chestZ],
          [x + dx * 0.3 * H, sh * 0.88, chestZ - 0.2 * H],
        ],
        0.02,
        'the armpit: the arm stub meeting the rib cage',
        true,
      ),
    );
  return out;
}

/** The bust's cut: the socle rim where the flanks meet the flat base. */
export function cutCreases(body: Field, cutZ: number, part = 'bust'): IntendedCrease[] {
  return edgeCreases(
    'cut_rim',
    part,
    body,
    (p) => p[2] - (cutZ + 0.004),
    [
      [-0.4, -0.4, cutZ - 0.01],
      [0.4, 0.4, cutZ + 0.02],
    ],
    0.025,
    'the bust cut: the flanks turning onto the flat base on the plinth',
  );
}
