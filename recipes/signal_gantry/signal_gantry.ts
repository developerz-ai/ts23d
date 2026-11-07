// Semaphore signal bridge, US lattice type (c. 1905–1915): box-lattice posts on concrete footings,
// a lattice girder 22 ft over the rails with knee braces, a plank walkway, and one pipe mast per
// track carrying lower-quadrant arms (home + distant) on spectacles in front of oil lamps. Tracks
// run along X, the bridge spans Y, signals face +X (the approaching driver). Rail top z = 0.
// A family over the number of tracks. Dossier: ./README.md.

import {
  beam,
  box,
  type Check,
  type CheckFinding,
  cylinder,
  defineFamily,
  grime,
  hex,
  type Lod,
  lathe,
  lattice,
  type Mesh,
  merge,
  place,
  prism,
  type Vec2,
  worldMeshes,
} from '@developerz.ai/ts23d';

const FT = 0.3048;
const TRACK_CENTRES = 13 * FT; // 3.962
const POST_CLEAR = 8.5 * FT; // post centre ↔ outer track centre, 2.591
const CLEARANCE = 22 * FT; // 6.706 under the girder
const GIRDER_D = 1.5;
const GIRDER_W = 1.0;
const CHORD = 0.12;
const ZB = CLEARANCE + CHORD / 2; // girder base chord centreline
const DECK_Z = ZB + GIRDER_D + CHORD / 2 + 0.05; // walkway top
const FOOT_H = 0.4;
const BLADE_L = 5 * FT; // 1.524
const BLADE_0 = 0.15; // blade starts this far right of the pivot
const ARM_X = 0.1; // front face of the mast + clearance: arms live in x ∈ [0.1, 0.14]
const LOW_ARM = 1.75; // pivot over the deck: the swept blade (r ≈ 1.67) clears the walkway
const ARM_GAP = 2.35; // the upper spectacle clears the lower blade's sweep
const MAST_H = LOW_ARM + ARM_GAP + 0.45;

const steel = hex('#2d3033');
const steelDark = hex('#1f2123');
const concrete = hex('#b5afa3');
const plank = hex('#6d5a45');
const red = hex('#b0261c');
const white = hex('#ece9e0');
const lens = hex('#ffcf7a');

const halfSpan = (tracks: number): number => ((tracks - 1) / 2) * TRACK_CENTRES + POST_CLEAR;
const trackYs = (tracks: number): number[] =>
  Array.from({ length: tracks }, (_, i) => (i - (tracks - 1) / 2) * TRACK_CENTRES);

/** Holds the 22 ft × 10 ft 8 in clearance envelope over every track: nothing may sag into it. */
const clearanceEnvelope =
  (tracks: number): Check =>
  (asset) => {
    const out: CheckFinding[] = [];
    for (const [name, m] of worldMeshes(asset.parts)) {
      for (let i = 0; i < m.positions.length; i += 3) {
        const y = m.positions[i + 1] ?? 0;
        const z = m.positions[i + 2] ?? 0;
        if (
          z > 0.05 &&
          z < CLEARANCE - 0.005 &&
          trackYs(tracks).some((t) => Math.abs(y - t) < 1.63)
        ) {
          out.push({
            message: `'${name}' enters the clearance envelope at z ${z.toFixed(2)} m`,
            fix: 'keep everything 22 ft over the rail and 5 ft 4 in either side of each track centre',
            part: name,
          });
          break;
        }
      }
    }
    return out;
  };

/** One semaphore arm in its pivot's space (pivot at the origin, swings about +X): blade to +Y,
 *  spectacle with red / green roundels below-left, hub to the mast. Modelled at stop (horizontal). */
function arm(kind: 'home' | 'distant', lod: Lod): { blade: Mesh; spectacle: Mesh } {
  const end = BLADE_0 + BLADE_L;
  const profile: Vec2[] =
    kind === 'home'
      ? [
          [BLADE_0, -0.11],
          [end, -0.1],
          [end, 0.1],
          [BLADE_0, 0.11],
        ]
      : [
          [BLADE_0, -0.11],
          [end, -0.12],
          [end - 0.18, 0],
          [end, 0.12],
          [BLADE_0, 0.11],
        ];
  const blade: Mesh[] = [
    place(prism({ profile, depth: 0.02, plane: 'yz', color: red, strip: 'iron' }), {
      at: [ARM_X + 0.03, 0, 0],
    }),
  ];
  if (lod < 2) {
    // White band 0.25 m from the end (front face only), black-and-white back.
    const b0 = end - (kind === 'home' ? 0.42 : 0.55);
    blade.push(box({ size: [0.004, 0.12, 0.2], at: [ARM_X + 0.042, b0, -0.1], color: white }));
    blade.push(
      box({
        size: [0.004, BLADE_L, 0.2],
        at: [ARM_X + 0.018, BLADE_0 + BLADE_L / 2, -0.1],
        color: white,
      }),
    );
  }
  const rg: Mesh[] = [
    // Hub on the spindle (touches the mast face) and the cast spectacle plate.
    cylinder({
      radius: 0.06,
      length: ARM_X + 0.05 - 0.075,
      segments: lod === 2 ? 4 : 8,
      axis: 'x',
      at: [(0.075 + ARM_X + 0.05) / 2, 0, 0],
      color: steelDark,
    }),
    place(
      prism({
        profile: [
          [-0.42, -0.12],
          [0.22, -0.48],
          [0.3, -0.36],
          [0.12, 0.08],
          [-0.06, 0.08],
          [-0.42, 0.04],
        ],
        depth: 0.025,
        plane: 'yz',
        color: steelDark,
        strip: 'iron',
      }),
      { at: [ARM_X + 0.0125, 0, 0] },
    ),
  ];
  if (lod < 2) {
    const red0: Vec2 = [-0.25, -0.25];
    const a = Math.PI / 3; // green comes in front of the lamp when the blade drops 60°
    const green0: Vec2 = [
      red0[0] * Math.cos(a) - red0[1] * Math.sin(a),
      red0[0] * Math.sin(a) + red0[1] * Math.cos(a),
    ];
    for (const [[y, z], c] of [
      [red0, hex('#c4231b')],
      [green0, hex('#1f8f5a')],
    ] as const)
      rg.push(
        cylinder({
          radius: 0.105,
          length: 0.015,
          segments: lod === 0 ? 12 : 6,
          axis: 'x',
          at: [ARM_X + 0.032, y, z],
          color: c,
        }),
      );
  }
  return { blade: merge(blade), spectacle: merge(rg) };
}

interface Params {
  readonly tracks: number;
}

const bridge = defineFamily({
  kind: 'prop',
  tags: ['railroad', 'signal', 'semaphore', 'lineside', 'usa', '1910s'],
  license: 'CC0-1.0',
  sources: [
    'https://commons.wikimedia.org/wiki/File:Signal_bridge_-_Discs_%26_semaphores_1909.jpg',
    'https://regulations.justia.com/states/pennsylvania/title-52/part-i/subpart-b/chapter-33/subchapter-b/safety-bridges-tunnels-trestles-and-switches/section-33-41',
    'https://en.wikipedia.org/wiki/Track_spacing',
    'https://www.railroadsignals.us/signals/sem/',
    'https://en.wikipedia.org/wiki/Railway_semaphore_signal',
    'https://www.irm.org/?p=19319',
  ],
  real: {
    length: GIRDER_W + 0.12, // walkway + hand rail
    width: 2 * halfSpan(2) + 0.9,
    height: DECK_Z + MAST_H + 0.2,
    measures: [
      {
        label: 'track centres (13 ft)',
        value: TRACK_CENTRES,
        axis: 'y',
        between: ['mast_0', 'mast_1'],
        source: 'Track spacing',
      },
      {
        label: 'post to track centre (8 ft 6 in)',
        value: POST_CLEAR,
        axis: 'y',
        between: ['post_r', 'mast_0'],
        source: 'Illinois 92 §1500',
      },
      {
        label: 'blade length (5 ft)',
        value: BLADE_L,
        axis: 'y',
        parts: ['arm_0_home_blade'],
        source: 'railroadsignals.us',
      },
    ],
  },
  budget: { triangles: [10000, 4400, 830] },
  glow: [{ parts: ['lamp_*_lens'], color: [1, 0.78, 0.45], strength: 4 }],
  defaults: { tracks: 2 } as Params,
  build(ctx, p) {
    const lod = ctx.lod;
    const hs = halfSpan(p.tracks);
    const dirt = (m: Mesh): Mesh => grime(m, { ground: 1.2, groundStrength: 0.35 });
    const section = lod === 0 ? 'angle' : 'square';

    // ---- posts on footings: box lattice (LOD0/1), plain columns far away.
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const y = s * hs;
      ctx.part(
        `footing_${side}`,
        box({
          size: [0.95, 0.8, FOOT_H],
          at: [0, y, 0],
          color: concrete,
          strip: 'concrete',
          omit: ['bottom'],
        }),
      );
      const top = ZB + GIRDER_D;
      const post =
        lod === 2
          ? box({
              size: [0.6, 0.45, top - FOOT_H],
              at: [0, y, FOOT_H],
              color: steel,
              strip: 'iron',
            })
          : lattice({
              from: [0, y, FOOT_H],
              to: [0, y, top],
              depth: 0.6,
              width: 0.45,
              centred: true,
              chord: 0.09,
              web: 0.05,
              pattern: 'x',
              bays: ctx.pick([16, 9, 4]),
              section,
              color: steel,
              strip: 'iron',
            });
      const plate = box({ size: [0.75, 0.6, 0.04], at: [0, y, FOOT_H], color: steelDark });
      ctx.part(`post_${side}`, dirt(merge([post, plate])));
      // Knee braces from the post into the girder soffit, front and back faces.
      const knees = (lod === 2 ? [0] : [-GIRDER_W / 2 + 0.05, GIRDER_W / 2 - 0.05]).map((x) =>
        beam({
          from: [x, y - s * 0.22, ZB - 0.9],
          to: [x, y - s * 1.0, ZB],
          width: 0.1,
          height: 0.1,
          color: steel,
          strip: 'iron',
        }),
      );
      ctx.part(`knee_${side}`, merge(knees));
    }

    // ---- girder: box lattice (warren), plank walkway on top, hand rail on the back edge.
    const girder =
      lod === 2
        ? lattice({
            from: [0, -hs, ZB],
            to: [0, hs, ZB],
            up: [0, 0, 1],
            depth: GIRDER_D,
            chord: CHORD,
            pattern: 'x',
            bays: Math.round(hs * 0.8),
            color: steel,
          })
        : lattice({
            from: [0, -hs, ZB],
            to: [0, hs, ZB],
            up: [0, 0, 1],
            depth: GIRDER_D,
            width: GIRDER_W,
            chord: CHORD,
            web: 0.07,
            pattern: lod === 0 ? 'x' : 'warren', // the 1909 bridge is a dense X lattice
            bays: ctx.pick([Math.round(hs * 1.4), Math.round(hs * 0.8), 4]),
            section,
            color: steel,
            strip: 'iron',
          });
    ctx.part('girder', girder);
    const deck: Mesh[] = [
      box({
        size: [GIRDER_W + 0.1, 2 * hs + 0.45, 0.05],
        at: [0, 0, DECK_Z - 0.05],
        color: plank,
        strip: 'wood',
      }),
    ];
    if (lod === 2)
      for (const y of [-hs, hs])
        deck.push(
          box({ size: [0.05, 0.05, 1.02], at: [-GIRDER_W / 2 - 0.02, y, DECK_Z], color: steel }),
        );
    if (lod === 2)
      deck.push(
        box({
          size: [0.05, 2 * hs, 0.05],
          at: [-GIRDER_W / 2 - 0.02, 0, DECK_Z + 0.97],
          color: steel,
        }),
      );
    if (lod < 2) {
      const railX = -GIRDER_W / 2 - 0.02;
      deck.push(
        beam({
          from: [railX, -hs, DECK_Z + 1.0],
          to: [railX, hs, DECK_Z + 1.0],
          width: 0.045,
          segments: lod === 0 ? 6 : 0,
          color: steel,
        }),
      );
      deck.push(
        beam({
          from: [railX, -hs, DECK_Z + 0.5],
          to: [railX, hs, DECK_Z + 0.5],
          width: 0.035,
          color: steel,
        }),
      );
      const n = Math.round((2 * hs) / 1.5);
      for (let i = 0; i <= n; i++) {
        const y = -hs + (2 * hs * i) / n;
        deck.push(box({ size: [0.05, 0.05, 1.02], at: [railX, y, DECK_Z], color: steel }));
      }
    }
    ctx.part('walkway', merge(deck));

    // ---- ladder up the right post to the walkway.
    if (lod < 2) {
      const ly = -hs - 0.32;
      const lad: Mesh[] = [];
      for (const x of [-0.2, 0.2])
        lad.push(box({ size: [0.05, 0.04, DECK_Z - FOOT_H], at: [x, ly, FOOT_H], color: steel }));
      for (let z = FOOT_H + 0.3; z < DECK_Z - 0.05; z += lod === 0 ? 0.3 : 0.6)
        lad.push(
          cylinder({
            radius: 0.012,
            length: 0.4,
            segments: lod === 0 ? 6 : 4,
            axis: 'x',
            at: [0, ly, z],
            color: steel,
          }),
        );
      for (const z of [FOOT_H + 1.5, ZB - 1, ZB + 0.6])
        for (const x of [-0.2, 0.2])
          lad.push(box({ size: [0.04, 0.12, 0.04], at: [x, ly + 0.08, z], color: steel })); // stand-off brackets
      ctx.part('ladder', merge(lad));
    }

    // ---- masts, arms, spectacles and lamps: one mast per track.
    const segs = ctx.pick([10, 8, 5]);
    trackYs(p.tracks).forEach((y, t) => {
      const mast: Mesh[] = [
        box({ size: [0.36, 0.36, 0.06], at: [0, y, DECK_Z], color: steelDark }),
        lathe({
          profile: [
            [0.09, DECK_Z],
            [0.075, DECK_Z + 0.4],
            [0.065, DECK_Z + MAST_H],
          ],
          segments: segs,
          color: steel,
          at: [0, y, 0],
        }),
        lathe({
          profile: [
            [0, DECK_Z + MAST_H - 0.02],
            [0.08, DECK_Z + MAST_H + 0.06],
            [0.06, DECK_Z + MAST_H + 0.15],
            [0, DECK_Z + MAST_H + 0.18],
          ],
          segments: segs,
          color: steelDark,
          at: [0, y, 0],
        }), // ball finial
      ];
      if (lod === 0) {
        // Step bolts up the back of the mast; mechanism cases behind each arm.
        for (let z = DECK_Z + 0.4; z < DECK_Z + MAST_H - 0.4; z += 0.38)
          mast.push(
            box({
              size: [0.2, 0.025, 0.025],
              at: [-0.13, y + (Math.round(z * 10) % 2 ? 0.03 : -0.03), z],
              color: steel,
            }),
          );
      }
      for (const [k, kind] of [
        [0, 'home'],
        [1, 'distant'],
      ] as const) {
        const pz = DECK_Z + LOW_ARM + (kind === 'home' ? ARM_GAP : 0);
        if (lod < 2)
          mast.push(box({ size: [0.2, 0.22, 0.32], at: [-0.17, y, pz - 0.2], color: steelDark })); // mechanism case
        // Lamp behind the red roundel's stop position, on a bracket from the mast.
        const ly = y - 0.25;
        const lz = pz - 0.25;
        ctx.part(
          `lamp_${t}_${kind}`,
          merge([
            box({ size: [0.2, 0.24, 0.3], at: [-0.02, ly, lz - 0.15], color: steelDark }),
            lathe({
              profile: [
                [0.07, lz + 0.15],
                [0.05, lz + 0.26],
                [0, lz + 0.29],
              ],
              segments: lod === 2 ? 3 : 6,
              color: steelDark,
              at: [-0.02, ly, 0],
            }), // chimney
            box({ size: [0.05, 0.12, 0.05], at: [-0.02, y - 0.09, lz - 0.05], color: steelDark }), // bracket to the mast
          ]),
        );
        ctx.part(
          `lamp_${t}_${kind}_lens`,
          cylinder({
            radius: 0.06,
            length: 0.01,
            segments: lod === 2 ? 4 : 8,
            axis: 'x',
            at: [0.085, ly, lz],
            color: lens,
          }),
        );
        ctx.socket(`lamp_${t}_${kind}_light`, {
          kind: 'light',
          at: [0.1, ly, lz],
          dir: [1, 0, 0],
          data: { aspect: kind },
        });
        const a = arm(kind, lod);
        const name = `arm_${t}_${kind}`;
        ctx.group(name, {
          at: [0, y, pz],
          // Lower quadrant: about −X the blade (+Y) drops; stop → 60° clear → stop.
          motion: {
            kind: 'sway',
            axis: [-1, 0, 0],
            degrees: 60,
            hz: 0.08 + 0.02 * k,
            oneWay: true,
          },
        });
        ctx.part(`${name}_spectacle`, a.spectacle, { parent: name });
        ctx.part(`${name}_blade`, a.blade, { parent: name });
      }
      ctx.part(`mast_${t}`, merge(mast));
    });
  },
});

export const signal_gantry = bridge.variant({
  name: 'signal_gantry',
  description:
    'US lattice semaphore signal bridge over two tracks (c. 1910): lattice posts and girder, walkway, a mast per track with lower-quadrant home and distant arms, spectacles and lamps.',
  checks: [clearanceEnvelope(2)],
});

export const signal_gantry_4 = bridge.variant({
  name: 'signal_gantry_4',
  description: 'The same signal bridge over four tracks, as in the 1909 photograph.',
  params: { tracks: 4 },
  real: {
    length: GIRDER_W + 0.12, // walkway + hand rail
    width: 2 * halfSpan(4) + 0.9,
    height: DECK_Z + MAST_H + 0.2,
    measures: [
      {
        label: 'track centres (13 ft)',
        value: TRACK_CENTRES,
        axis: 'y',
        between: ['mast_0', 'mast_1'],
        source: 'Track spacing',
      },
      {
        label: 'post to track centre (8 ft 6 in)',
        value: POST_CLEAR,
        axis: 'y',
        between: ['post_r', 'mast_0'],
        source: 'Illinois 92 §1500',
      },
      {
        label: 'blade length (5 ft)',
        value: BLADE_L,
        axis: 'y',
        parts: ['arm_0_home_blade'],
        source: 'railroadsignals.us',
      },
    ],
  },
  budget: { triangles: [13000, 5900, 1460] },
  checks: [clearanceEnvelope(4)],
});
