// The orc bust's intended creases, from the landmarks and the geometry that sculpts them
// (../_lib/bust/creases.ts helpers): lids and the brow shelf, nose, nasolabial folds, mouth line
// over the underbite, tusk roots, cheekbone arch, jawline, skull base, nuchal furrow, scars, the
// big ears; the pectoral and deltoid borders and throat; spike collars; the baldric and buckle;
// the fur clumps' roots; the scalp lock, bun turns, wraps and tail locks. Every region ≤ 3 cm.

import type { IntendedCrease } from '@developerz.ai/ts23d';
import { creaseAt, creaseCurve, ringCreases } from '../_lib/bust/creases.ts';
import { add, cross, mul, norm, spline, sub, type V } from '../_lib/bust/kit.ts';
import { bodySurface } from './build.ts';
import { atEar, earRings } from './ears.ts';
import { BALDRIC, cap, capPoint, SPIKES } from './fittings.ts';
import { seamRing } from './fur.ts';
import { KNOT, tailPath } from './hair.ts';
import { tuskStroke } from './jaw.ts';
import { L } from './landmarks.ts';

const why = {
  lids: 'lid folds round the small deep-set eye under the brow shelf',
  brow: 'the brow shelf overhanging the sockets and its top edge on the forehead',
  nose: 'the broad nose: bridge, alae and the nasolabial fold to the mouth corner',
  mouth: 'the mouth line over the underbite, lips and chin',
  tusk: 'a lower tusk growing out of the jaw beside the lip',
  face: 'cheekbone arch, jawline over the neck, occipital line, nuchal furrow',
  ear: 'the pointed ear: helix rim, concha, root and the iron rings through it',
};

function head(): IntendedCrease[] {
  const [ex, ey, ez] = L.eye;
  const R = L.eyeR;
  const tusk = tuskStroke().pts;
  return [
    ...creaseCurve(
      'lids',
      'head',
      [
        [ex + R * 0.4, ey - R * 1.3, ez],
        [ex + R * 0.9, ey, ez + R * 0.8],
        [ex + R * 0.4, ey + R * 1.3, ez],
        [ex + R * 0.9, ey, ez - R * 0.7],
        [ex + R * 0.4, ey - R * 1.3, ez],
      ],
      0.016,
      why.lids,
      true,
    ),
    ...creaseCurve('brow', 'head', [L.glabella, L.browOuter, L.temple], 0.02, why.brow, true),
    ...creaseCurve(
      'brow_top',
      'head',
      [add(L.glabella, [-0.03, 0, 0.026]), add(L.browOuter, [-0.012, 0, 0.016]), L.temple],
      0.02,
      why.brow,
      true,
    ),
    ...creaseCurve('nose', 'head', [L.noseRoot, L.noseTip, L.subnasale], 0.02, why.nose),
    ...creaseCurve('nose_side', 'head', [L.noseRoot, L.ala, L.mouthCorner], 0.02, why.nose, true),
    ...creaseCurve('mouth', 'head', [L.upperLip, L.mouthCorner], 0.02, why.mouth, true),
    ...creaseCurve(
      'underbite',
      'head',
      [L.lowerLip, add(L.mouthCorner, [0.02, 0, -0.025]), L.chin],
      0.02,
      why.mouth,
      true,
    ),
    ...creaseCurve('tusk', 'head', tusk, 0.02, why.tusk, true),
    ...creaseCurve(
      'lip_upper',
      'head',
      [add(L.upperLip, [0.006, 0, 0]), [0.13, 0.036, 0.364], L.mouthCorner],
      0.02,
      why.mouth,
      true,
    ),
    ...creaseCurve('chin', 'head', [L.lowerLip, L.chin], 0.02, why.mouth),
    ...creaseCurve('cheek_arch', 'head', [L.zygoma, L.zygion, L.ear], 0.02, why.face, true),
    ...creaseCurve(
      'jawline',
      'head',
      [L.gonion, [0.06, 0.09, 0.3], L.menton],
      0.025,
      why.face,
      true,
    ),
    ...creaseCurve(
      'jaw_hinge',
      'head',
      [add(L.ear, [0.012, 0.012, -0.01]), add(L.gonion, [-0.005, 0.005, 0.03])],
      0.02,
      why.face,
      true,
    ),
    ...creaseCurve(
      'skull_base',
      'head',
      [L.ear, [-0.08, 0.056, 0.456], [-0.112, 0, 0.453]],
      0.025,
      why.face,
      true,
    ),
    ...creaseCurve(
      'nuchal_furrow',
      'head',
      [
        [-0.112, 0, 0.453],
        [-0.126, 0, 0.405],
      ],
      0.015,
      why.face,
    ),
    // Ear (× its scale): along the blade's midline and both rims, the root, the rings.
    ...[0, 0.026, -0.024].flatMap((v, k) =>
      creaseCurve(
        `ear${k}`,
        'head',
        [0, 0.025, 0.05, 0.075, 0.1].map((u) => atEar(u, v * Math.min(1, u * 40 + 0.4), 0)),
        0.02,
        why.ear,
        true,
      ),
    ),
    ...earRings().flatMap((r, i) => creaseAt(`ear_ring${i}`, 'head', r.c, 0.015, why.ear, true)),
  ];
}

function bust(): IntendedCrease[] {
  const pecWhy = 'pectoral and deltoid borders and the throat under the necklace';
  return [
    ...creaseCurve(
      'deltopectoral',
      'bust',
      [L.acromion, [0.03, 0.18, 0.215], [0.06, 0.13, 0.17]],
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
      'hair',
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
    ...clumps.flatMap((c, i) =>
      creaseCurve(`fur_clump${i}`, 'mantle', c, 0.025, 'a fur clump shingled over its neighbours'),
    ),
    ...ringCreases('bun', 'hair', bunRing(), 0.02, 'the lock wound round the knot'),
    ...creaseCurve(
      'scalp_lock',
      'hair',
      [body.off([0, 0, 0.58], 0.002), add(KNOT, [0.012, 0, 0.012])],
      0.02,
      'scalp-lock separations converging on the knot',
    ),
    ...creaseAt('wraps', 'hair', add(KNOT, [-0.003, 0, 0.036]), 0.02, 'two leather wraps'),
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
