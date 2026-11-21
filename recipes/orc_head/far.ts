// The orc's far LOD (LOD2) gear, built as clean low-poly solids instead of sculpts at a coarse
// cell (D549: a 9 cm dome meshed at a 3.2 cm cell came out as torn shards, the spikes as lumps
// and the card beard as a perforated patch): each pauldron a closed revolved dome with its rim
// and one solid lame band, each bone spike a revolved cone in its iron collar, the beard one
// sculpted mass in the beard's colour, parted round the tusks.

import { createRng, dmath, type Field, type Mesh, merge, sculpt } from '@developerz.ai/ts23d';
import { add, mul, norm, sub, type V } from '../_lib/bust/kit.ts';
import { plateProfile, revolvePlate } from '../_lib/bust/plates.ts';
import { cap, capPoint, LAME_R, lameAxis, SPIKES, spikeEnd } from './fittings.ts';
import { beardRegion } from './hair.ts';
import { C, PLATE_STRIP } from './palette.ts';
import { SK } from './spec.ts';

type P2 = readonly [number, number];

/** Rings round a far solid: enough for a round outline at 30 px. */
const STEPS = 9;

/** The far pauldron (s = +1 left, −1 right): the dome as a closed solid of revolution (crown,
 *  three meridian rings, the flared lip, a flat underside) and the two lames as one thick band
 *  round the arm, sunk into it. */
export function farPauldron(s: number): Mesh {
  const { at, axis, R, H } = cap(s);
  const dome: P2[] = [[0.004, H]];
  for (const deg of [28, 54, 76, 90])
    dome.push([R * dmath.sin((deg * Math.PI) / 180), H * dmath.cos((deg * Math.PI) / 180)]);
  // The lip, its lower edge, then back under the dome to the axis.
  dome.push([R * 1.09, -0.014], [R * 1.07, -0.024], [R * 0.8, -0.022], [0.004, -0.018]);
  const rim = dome.length - 4;
  const shell = revolvePlate(dome, {
    at,
    axis,
    ref: [1, 0, 0],
    from: 0,
    to: 360,
    steps: STEPS,
    color: C.plate,
    strip: PLATE_STRIP,
    // The lip's two rings in the worn rim's lighter iron: the near LODs' bright bead.
    wear: {
      rng: createRng(0x0fa2),
      from: rim,
      to: rim + 2,
      edge: C.bareIron,
      bare: C.bareIron,
      chip: 0,
      rust: C.rust,
      drip: [],
      length: 0,
    },
  });
  const { at: armAt, axis: armAxis } = lameAxis(s);
  const outer: P2[] = [
    [LAME_R + 0.004, 0.232],
    [LAME_R + 0.014, 0.19],
    [LAME_R + 0.024, 0.15],
  ];
  const band = revolvePlate(plateProfile(outer, 0.024, 2), {
    at: armAt,
    axis: armAxis,
    ref: [0, s, 0],
    from: -105,
    to: 105,
    steps: 5,
    color: C.plate,
    strip: PLATE_STRIP,
  });
  return merge([shell, band]);
}

/** The far bone spikes of one pauldron: a cone of revolution each, its foot the iron collar. */
export function farSpikes(s: number): Mesh {
  const { at: capAt, axis: capAxis } = cap(s);
  return merge(
    SPIKES.map(([phi, theta, full, r], i) => {
      const { len, tip } = spikeEnd(s, i, full);
      const root = capPoint(s, phi, theta * s, -0.004);
      const out = norm(sub(root, capAt));
      const dir = norm(add(mul(out, 0.6), mul(capAxis, 0.8)));
      const cone: P2[] = [
        // (A 3 mm flat on the tip: the section closes down the axis, and a needle point would
        // share its normals between the cone's outside and that hidden inside.)
        [0.0012, len],
        [tip + 0.001, len],
        [r * 0.62, len * 0.42],
        [r, 0.01],
        [r + 0.012, -0.006],
        // (The foot turns under in two steps: one sharp fold there shades inside out.)
        [r + 0.011, -0.011],
        [r * 0.6, -0.014],
        [0.0015, -0.014],
      ];
      return revolvePlate(cone, {
        at: root,
        axis: dir,
        ref: [1, 0, 0],
        from: 0,
        to: 360,
        steps: 5,
        color: C.bone,
        wear: {
          rng: createRng(0x0fa3),
          from: 4,
          to: 8,
          edge: C.collar,
          bare: C.bareIron,
          chip: 0,
          rust: C.rust,
          drip: [],
          length: 0,
        },
      });
    }),
  );
}

/** The far beard: the card beard's volume as one mass in its mean colour. A shell 1.7 cm proud
 *  of the finished `face` over the beard's own region (chin and jaw, parted round the tusks, clear
 *  of the lips) and the fall hanging from the chin to the chest, its tips lighter. */
export function farBeard(face: Field): Mesh {
  const chin = SK.menton;
  const tone = (t: number): V => [
    C.hairRoot[0] + (C.hairTip[0] - C.hairRoot[0]) * t,
    C.hairRoot[1] + (C.hairTip[1] - C.hairRoot[1]) * t,
    C.hairRoot[2] + (C.hairTip[2] - C.hairRoot[2]) * t,
  ];
  const fall: V = [chin[0] + 0.004, 0, chin[2] - 0.022];
  return sculpt({
    edits: [
      {
        group: [
          {
            field: (p) => Math.max(face(p) - 0.017, beardRegion(p), -face(p) - 0.04),
            bounds: [
              [0, -0.14, 0.24],
              [0.24, 0.14, 0.4],
            ],
          },
          // (Kept to the jaw: the shell otherwise runs out over the neck's flank as a fin.)
          {
            shape: 'ellipsoid',
            at: [chin[0] - 0.04, 0, chin[2] + 0.035],
            size: [0.115, 0.1, 0.085],
            op: 'intersect',
            blend: 0.01,
          },
        ],
      },
      { shape: 'ellipsoid', at: fall, size: [0.05, 0.068, 0.05], blend: 0.016 },
      {
        shape: 'ellipsoid',
        at: [fall[0], 0, fall[2] - 0.04],
        size: [0.07, 0.09, 0.03],
        op: 'paint',
        color: tone(0.5),
        blend: 0.03,
      },
    ],
    resolution: 0.03,
    color: tone(0.12),
    strip: 'plain',
  });
}
