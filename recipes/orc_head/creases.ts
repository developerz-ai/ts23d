// The orc bust's intended creases, from the geometry that sculpts them (../_lib/bust/creases.ts
// helpers): the skull stage's folds (lids, nose base, lips, ears, jaw angle, nuchal furrow), the
// orc's forehead furrows, mouth line, underbite, the jaw's underside, skull base and neck, scars,
// warts and tusk roots; the pectoral and deltoid borders and throat; spike collars; the baldric
// and buckle; the fur clumps' roots; the necklace; the scalp lock, bun turns, wraps and tail
// locks. Every region ≤ 3 cm.

import type { IntendedCrease } from '@developerz.ai/ts23d';
import { creaseAt, creaseCurve, ringCreases } from '../_lib/bust/creases.ts';
import { add, cross, mul, norm, spline, sub, type V } from '../_lib/bust/kit.ts';
import { skullCreases } from '../_lib/face/skull-creases.ts';
import { bodySurface } from './build.ts';
import { foreheadLines, lipLine, SCARS, WARTS } from './features.ts';
import { BALDRIC, cap, capPoint, SPIKES } from './fittings.ts';
import { seamRing } from './fur.ts';
import { KNOT, tailPath } from './hair.ts';
import { L } from './landmarks.ts';
import { H, SK } from './spec.ts';
import { tuskPath } from './tusks.ts';

/** The skull stage's folds (lids, nose base, lips, ears, jaw), the orc's own strokes, tusks. */
function head(): IntendedCrease[] {
  const tusk = tuskPath();
  const flip = (l: V[]): V[] => l.map((p): V => [p[0], -p[1], p[2]]);
  return [
    ...skullCreases(SK, H),
    ...foreheadLines().flatMap((l, i) =>
      creaseCurve(`forehead${i}`, 'head', l, 0.015, 'a forehead furrow under the vault', true),
    ),
    ...creaseCurve('mouth', 'head', lipLine(), 0.02, 'the closed mouth’s line', true),
    // The sternocleidomastoid's front edge where the skull's neck meets the torso's.
    ...creaseCurve(
      'scm',
      'head',
      [SK.mastoid, [0.03, 0.085, 0.31], [0.06, 0.07, 0.27], [0.08, 0.04, 0.23]],
      0.02,
      'the sternocleidomastoid’s front edge down the thick neck',
      true,
    ),
    ...SCARS.flatMap((l, i) =>
      creaseCurve(`scar${i}`, 'head', l, 0.02, 'a scar: a raised pale welt'),
    ),
    ...WARTS.flatMap(([p, r], i) =>
      creaseAt(`wart${i}`, 'head', p, Math.min(0.03, r * H * 3), 'a wart’s rim on the skin'),
    ),
    // The underbite: the lower lip pushed ahead of the upper folds under it at the lip line.
    ...creaseCurve(
      'underbite',
      'head',
      [SK.labraleSup, SK.labraleInf, SK.cheilion],
      0.02,
      'the lower lip thrust ahead of the upper (underbite), folding under it to the corner',
      true,
    ),
    // The massive jaw's underside meeting the throat, and the skull's base on the trapezius.
    ...creaseCurve(
      'submandibular',
      'head',
      [
        SK.menton,
        [SK.menton[0] - 0.035, 0, SK.menton[2] + 0.004],
        [SK.menton[0] - 0.045, 0.05, SK.menton[2] + 0.014],
        SK.gonion,
      ],
      0.025,
      'the jaw’s underside folding into the throat under the dropped mandible',
      true,
    ),
    // The jaw ×1.9 drops onto the trapezius behind its angle: a fold under the mandible's flank.
    ...creaseCurve(
      'jaw_trap',
      'head',
      [SK.gonion, [0.04, 0.1, 0.29], [0.005, 0.105, 0.285]],
      0.03,
      'the widened jaw’s flank folding onto the trapezius that rises to it',
      true,
    ),
    ...creaseCurve(
      'skull_base',
      'head',
      [
        [SK.nape[0] - 0.004, 0, SK.nape[2] + 0.12],
        [SK.nape[0] + 0.014, 0.05, SK.nape[2] + 0.1],
        [SK.nape[0] + 0.05, 0.09, SK.nape[2] + 0.085],
      ],
      0.025,
      'the skull’s base where the trapezius rises into it',
      true,
    ),
    ...[tusk, flip(tusk)].flatMap((t, i) => [
      ...creaseCurve(`tusk_root${i}`, 'head', t.slice(0, 8), 0.02, 'a tusk leaving the jaw'),
      ...creaseCurve(`tusk${i}`, 'tusks', t, 0.02, 'a tusk rooted in the jaw, through the lip'),
    ]),
  ];
}

function bust(): IntendedCrease[] {
  const pecWhy = 'pectoral and deltoid borders and the throat under the necklace';
  return [
    // Behind the shoulder, under the pauldron: the trapezius sheet draping onto the deltoid.
    ...creaseCurve(
      'trap_deltoid',
      'bust',
      [
        [-0.06, 0.2, 0.26],
        [-0.08, 0.22, 0.23],
        [-0.09, 0.23, 0.2],
      ],
      0.02,
      'the trapezius sheet draping onto the deltoid behind the shoulder',
      true,
    ),
    ...creaseCurve(
      'deltopectoral',
      'bust',
      [L.acromion, [0.03, 0.18, 0.215], [0.06, 0.17, 0.18], [0.06, 0.13, 0.17]],
      0.03,
      pecWhy,
      true,
    ),
    ...creaseCurve(
      'pec_edge',
      'bust',
      [add(L.sternum, [0, 0.01, -0.07]), add(L.pec, [0.01, 0, -0.03]), [0.03, 0.17, 0.15]],
      0.025,
      pecWhy,
      true,
    ),
    ...creaseCurve(
      'throat',
      'bust',
      [L.sternum, [0.07, 0, 0.29], add(L.sternum, [-0.02, 0.06, 0.02])],
      0.025,
      pecWhy,
      true,
    ),
  ];
}

function gear(): IntendedCrease[] {
  const body = bodySurface();
  // Spikes: each bone spike seated in its flared iron collar on the cap, root to tip.
  const spikes = [1, -1].flatMap((s) =>
    SPIKES.flatMap(([phi, theta, len], i) => {
      const root = capPoint(s, phi, theta * s, -0.004);
      const c = cap(s);
      const dir = norm(add(mul(norm(sub(root, c.at)), 0.6), mul(c.axis, 0.8)));
      return creaseCurve(
        `spike${i}_${s > 0 ? 'l' : 'r'}`,
        'spikes',
        [add(root, mul(dir, -0.012)), add(root, mul(dir, len))],
        0.025,
        'bone spike seated in its flared iron collar',
      );
    }),
  );
  // Where the two collars on one cap run into each other.
  const collars = [1, -1].flatMap((s) =>
    creaseCurve(
      `spike_collars_${s > 0 ? 'l' : 'r'}`,
      'spikes',
      SPIKES.map(([phi, theta]) => capPoint(s, phi, theta * s, -0.004)),
      0.02,
      'the two spike collars meeting on the cap',
    ),
  );
  // Baldric: the strap lying on the chest (edges ±2 cm, stitching), the buckle frame on it (its
  // corners with the frame's rounding).
  const strap = BALDRIC.map((p) => body.off(p, 0.005));
  const buckle = body.off(BALDRIC[5] ?? [0.12, 0, 0.18], 0.0085);
  const bn = body.normal(buckle);
  const raw = norm(sub(BALDRIC[6] ?? buckle, BALDRIC[4] ?? buckle));
  const along = norm(sub(raw, mul(bn, raw[0] * bn[0] + raw[1] * bn[1] + raw[2] * bn[2])));
  const across = cross(bn, along);
  const frame = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ].map(([a = 0, b = 0]) => add(buckle, add(mul(along, 0.024 * a), mul(across, 0.03 * b))));
  // Fur: the rolled base over the seam and each clump's root on it, shingled in two rows.
  const ring = seamRing(body, 26, 62, 298);
  // Each clump falls out and down from its root (fur.ts), 5–9 cm long.
  const clumps = ring.map((p) => {
    const nrm = body.normal(p);
    const out = norm([p[0] + 0.03, p[1], 0]);
    const fall = norm(add(add(mul(out, 0.55), mul(nrm, 0.35)), [0, 0, -1]));
    return [p, add(p, mul(fall, 0.035)), add(p, mul(fall, 0.075))];
  });
  // Hair: the scalp lock's lines into the knot, the bun's turns and wraps, each tail lock.
  const tails = [0, 0.016, -0.016, 0.009, -0.008].map((dy, i) =>
    creaseCurve(
      `tail${i}`,
      'hair_knot',
      spline(tailPath(body, dy, [0, 0.002, -0.002, -0.006, 0.006][i] ?? 0), 16),
      0.02,
      'a tail lock out of the wraps, down the skull',
    ),
  );
  return [
    ...spikes,
    ...collars,
    ...creaseCurve('baldric', 'harness', strap, 0.03, 'the baldric strap: its edges and stitching'),
    ...creaseCurve('buckle', 'harness', frame, 0.02, 'the iron buckle frame on the strap'),
    ...creaseCurve('fur_base', 'mantle', ring, 0.03, 'the fur mantle’s rolled base'),
    ...creaseAt(
      'fur_spine',
      'mantle',
      [-0.19, 0, 0.33],
      0.02,
      'the clumps of the two shoulders overlapping on the spine',
    ),
    ...clumps.flatMap((c, i) =>
      creaseCurve(`fur_clump${i}`, 'mantle', c, 0.025, 'a fur clump shingled over its neighbours'),
    ),
    ...ringCreases(
      'necklace',
      'necklace',
      seamRing(body, 16, -80, 80).map((p) => body.off(p, 0.004)),
      0.02,
      'the necklace cord bending round the throat between its beads',
    ),
    ...ringCreases('bun', 'hair_knot', bunRing(), 0.02, 'the lock wound round the knot'),
    ...creaseCurve(
      'scalp_lock',
      'hair_knot',
      [body.off([0, 0, 0.58], 0.002), add(KNOT, [0.012, 0, 0.012])],
      0.02,
      'scalp-lock separations converging on the knot',
    ),
    ...creaseAt('wraps', 'hair_knot', add(KNOT, [-0.003, 0, 0.036]), 0.02, 'two leather wraps'),
    ...tails.flat(),
  ];
}

/** The bun's middle turn round the knot. */
function bunRing(): V[] {
  return Array.from({ length: 12 }, (_, i): V => {
    const a = (i / 12) * Math.PI * 2;
    return add(KNOT, [0.0145 * Math.cos(a), 0.0145 * Math.sin(a), 0.009]);
  });
}

export const ORC_CREASES: readonly IntendedCrease[] = [...head(), ...bust(), ...gear()];
