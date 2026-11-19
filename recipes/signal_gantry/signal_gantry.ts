// Semaphore signal bridge, US lattice type (c. 1905–1915): box-lattice posts on concrete footings,
// a lattice girder 22 ft over the rails with knee braces, a plank walkway, and one pipe mast per
// track carrying lower-quadrant arms (home + distant) on spectacles in front of oil lamps. Tracks
// run along X, the bridge spans Y, signals face +X (the approaching driver). Rail top z = 0.
// A family over the number of tracks. Dossier: ./README.md.

import {
  type Bounds,
  beam,
  boundsOf,
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
  pointTriangleDistance,
  prism,
  type Vec2,
  type Vec3,
  worldMeshes,
} from '@developerz.ai/ts23d';
import { restrip, type StripRule, weatherer } from '../_lib/finish/finish.ts';
import { type Bleed, footWear, rustBleeds, type Shade, shade, steelWear } from './wear.ts';

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
/** Bearing boss on the mast front (x from inside the pipe to BEARING_X1) whose bore carries the
 *  arm's spindle; the spindle starts at SPINDLE_X0, clear of the pipe wall (r ≤ 0.072). */
const BEARING_X1 = 0.09;
const SPINDLE_R = 0.02;
const SPINDLE_X0 = 0.076;
const POST_D = 0.6; // post depth along X (the girder is GIRDER_W deep)
const POST_W = 0.45; // post width along Y
const KNEE_FOOT_X = POST_D / 2 - 0.045; // knee foot on the post's corner chord, not beside the post
const KNEE_Z = ZB - 0.9; // knee foot height on the post
const KNEE_W = 0.1; // knee brace section

/** Mast pipe radius at height h over the deck (the lathe profile below, linear between rings). */
const mastR = (h: number): number =>
  h <= 0.4 ? 0.09 - (0.015 * h) / 0.4 : 0.075 - (0.01 * (h - 0.4)) / (MAST_H - 0.4);

const steel = hex('#383c40');
/** Galvanised hand rail and its stanchions (renewed in the 1930s, as surviving bridges show). */
const galv = hex('#a3a7a6');
const steelDark = hex('#1f2123');
const concrete = hex('#b5afa3');
const plank = hex('#6d5a45');
const red = hex('#b0261c');
const white = hex('#ece9e0');
const lens = hex('#ffcf7a');

/** Authoring colour → material: painted steel lattice (chips show rust), weathered timber
 *  walkway, red/white painted signal arms; concrete keeps its classic strip. */
const RULES: readonly StripRule[] = [
  { from: steel, strip: 'steel_painted' },
  { from: galv, strip: 'steel_galvanised' },
  { from: steelDark, strip: 'iron_rust', color: hex('#7a6e66') },
  { from: plank, strip: 'wood_weathered', color: hex('#c8bba8') },
  { from: red, strip: 'wood_painted' },
  { from: white, strip: 'wood_painted' },
];

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

/** Knee-brace centreline ends on one side (`s` = +1 left, −1 right): foot on the post's inner
 *  face, head in the girder's bottom chord. LOD2 keeps one brace on the centre plane. */
function kneeEnds(y: number, s: number, lod: Lod): readonly (readonly [Vec3, Vec3])[] {
  return (lod === 2 ? [0] : [-1, 1]).map((side) => [
    [side * KNEE_FOOT_X, y - s * 0.22, KNEE_Z],
    [side * (GIRDER_W / 2 - 0.05), y - s * 1.0, ZB],
  ]);
}

/** Distance from `p` to the nearest triangle of `m` (its actual surface, not its bounding box). */
function surfaceGap(p: Vec3, m: Mesh): number {
  const v = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  let best = Infinity;
  for (let t = 0; t < m.indices.length; t += 3)
    best = Math.min(
      best,
      pointTriangleDistance(
        p,
        v(m.indices[t] ?? 0),
        v(m.indices[t + 1] ?? 0),
        v(m.indices[t + 2] ?? 0),
      ),
    );
  return best;
}

/** Both ends of every knee brace land on what they brace: the foot on a member of its post (its
 *  surface within the brace's half-width, so a foot in the air between a post's uprights fails),
 *  the head on the girder. `floating-parts` passes a brace that touches at one end only (D41). */
const kneesLand =
  (tracks: number): Check =>
  (asset) => {
    const out: CheckFinding[] = [];
    const world = worldMeshes(asset.parts);
    const girder = world.get('girder');
    const gap = (p: Vec3, b: Bounds | undefined): number => {
      if (!b) return Infinity;
      const out = (k: 0 | 1 | 2): number => Math.max(b.min[k] - p[k], 0, p[k] - b.max[k]);
      return Math.hypot(out(0), out(1), out(2));
    };
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const y = s * halfSpan(tracks);
      const post = world.get(`post_${side}`);
      for (const [foot, head] of kneeEnds(y, s, asset.lod)) {
        for (const [end, support, d, tol] of [
          [foot, `post_${side}`, post ? surfaceGap(foot, post) : Infinity, KNEE_W / 2 + 0.01],
          [head, 'girder', gap(head, girder && boundsOf(girder)), 0.02],
        ] as const) {
          if (d > tol)
            out.push({
              message: `'knee_${side}' end [${end.map((v) => v.toFixed(2)).join(', ')}] is ${d.toFixed(3)} m clear of '${support}'`,
              fix: `move the brace end onto a member of '${support}' (or give it one there)`,
              part: `knee_${side}`,
            });
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
  // Hub on the spindle and the cast spectacle plate. LOD0/1: the hub runs just clear of the
  // mast's bearing boss, carried by the spindle turning in the boss bore; LOD2 has no bearing,
  // so its hub reaches back to the mast face.
  const hub0 = lod === 2 ? 0.075 : BEARING_X1 + 0.001;
  const rg: Mesh[] = [
    cylinder({
      radius: 0.06,
      length: ARM_X + 0.05 - hub0,
      segments: lod === 2 ? 4 : 8,
      axis: 'x',
      at: [(hub0 + ARM_X + 0.05) / 2, 0, 0],
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
  if (lod < 2)
    rg.push(
      lathe({
        // Spindle: from just in front of the pipe (it must not sweep the pipe wall) through
        // the bore into the hub, 0.5 mm smaller than the bore so it turns.
        profile: [
          [0, SPINDLE_X0],
          [SPINDLE_R - 0.0005, SPINDLE_X0],
          [SPINDLE_R - 0.0005, ARM_X + 0.05],
          [0, ARM_X + 0.05],
        ],
        segments: lod === 0 ? 8 : 6,
        axis: 'x',
        color: steelDark,
      }),
    );
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

/**
 * Far post: an open frame (four corner angles, a batten across each Y face at the knee height and
 * the cap plate) instead of a solid column, so the posts stay see-through at distance like the lattice
 * they stand for.
 */
function farPost(y: number, top: number): Mesh {
  // Cap plate across the head: the planar far girder lands on it, the deck bears on it.
  const out: Mesh[] = [
    box({
      size: [POST_D + 0.09, POST_W + 0.09, DECK_Z - 0.05 - top],
      at: [0, y, top],
      color: steel,
      omit: ['bottom'],
    }),
  ];
  const c = 0.09;
  for (const dx of [-1, 1])
    for (const dy of [-1, 1])
      out.push(
        beam({
          from: [(dx * POST_D) / 2, y + (dy * POST_W) / 2, FOOT_H],
          to: [(dx * POST_D) / 2, y + (dy * POST_W) / 2, top],
          width: c,
          color: steel,
          strip: 'iron',
          caps: false,
        }),
      );
  // Two battens across the inner and outer faces at the knee height: the far knee's foot lands
  // on the inner one (the uprights stand at the corners, clear of the brace's centre plane).
  for (const dy of [-1, 1])
    out.push(
      beam({
        from: [-POST_D / 2, y + (dy * POST_W) / 2, KNEE_Z],
        to: [POST_D / 2, y + (dy * POST_W) / 2, KNEE_Z],
        width: 0.07,
        color: steel,
        strip: 'iron',
        caps: false,
      }),
    );
  return merge(out);
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
  // A paraffin signal lamp: a warm point behind the spectacle glass, lit but never white.
  glow: [{ parts: ['lamp_*_lens'], color: [1, 0.78, 0.45], strength: 1.5 }],
  defaults: { tracks: 2 } as Params,
  build(ctx, p) {
    const lod = ctx.lod;
    const hs = halfSpan(p.tracks);
    const dirt = (m: Mesh): Mesh => grime(m, { ground: 1.2, groundStrength: 0.35 });
    const weather = weatherer(ctx.rng.fork('weather'));
    const sooty = steelWear(ctx.rng.fork('steel-wear'), {
      tracks: trackYs(p.tracks),
      girderZ: ZB - CHORD / 2,
      deckZ: DECK_Z,
    });
    const footed = footWear(ctx.rng.fork('foot-wear'));
    /** Every part through the material library, its wear story (painted steel fades and soots by
     *  default), then dust on top faces and ground splash; all read at the asset-space position,
     *  `origin` being where a pivot-local mesh's frame sits. */
    const part = (
      name: string,
      m: Mesh | null,
      o?: Parameters<typeof ctx.part>[2],
      wear: Shade | null = sooty,
      origin: Vec3 = [0, 0, 0],
    ): void => {
      if (!m) {
        ctx.part(name, null, o);
        return;
      }
      const mat = restrip(m, RULES);
      const worn = wear ? shade(mat, wear, origin) : mat;
      ctx.part(name, weather(worn, { dust: 0.2, mud: 0.6, mudStrength: 0.5, at: origin }), o);
    };
    const rusty = ctx.rng.fork('rust');
    const section = lod === 0 ? 'angle' : 'square';

    // ---- posts on footings: box lattice (LOD0/1), plain columns far away.
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const y = s * hs;
      part(
        `footing_${side}`,
        box({
          size: [0.95, 0.8, FOOT_H],
          at: [0, y, 0],
          color: concrete,
          strip: 'concrete',
          omit: ['bottom'],
        }),
        undefined,
        footed,
      );
      const top = ZB + GIRDER_D;
      const post =
        lod === 2
          ? farPost(y, top)
          : lattice({
              from: [0, y, FOOT_H],
              to: [0, y, top],
              depth: POST_D,
              width: POST_W,
              centred: true,
              chord: 0.09,
              web: 0.05,
              pattern: 'x',
              bays: ctx.pick([16, 9, 4]),
              section,
              color: steel,
              strip: 'iron',
            });
      const bleeds: Bleed[] = [];
      if (lod === 0) {
        // Rust bleeds from the riveted nodes down the broad outer face of the front corner
        // angle. The lattice turns its angles round the box, so only the left post's front
        // angle shows its broad face outward (+Y); the right post's angles show edges there.
        const bays = 16;
        if (s > 0)
          for (let i = 1; i < bays; i++)
            bleeds.push({
              at: [POST_D / 2, y + POST_W / 2 + 0.045, FOOT_H + ((top - FOOT_H) * i) / bays],
              s: 1,
              axis: 'y',
              floor: FOOT_H + 0.05,
            });
      }
      // The 4 cm base plate is below a pixel far away: LOD2 stands the frame on the footing.
      const plate =
        lod < 2 ? [box({ size: [0.75, 0.6, 0.04], at: [0, y, FOOT_H], color: steelDark })] : [];
      part(`post_${side}`, dirt(merge([post, ...plate, rustBleeds(rusty, bleeds)])));
      // Knee braces from the post into the girder soffit, front and back faces.
      const knees = kneeEnds(y, s, lod).map(([from, to]) =>
        beam({
          from,
          to,
          width: KNEE_W,
          height: KNEE_W,
          color: steel,
          strip: 'iron',
        }),
      );
      part(`knee_${side}`, merge(knees));
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
    const gussets: Mesh[] = [];
    if (lod === 0) {
      // Riveted gusset plates on the front face at every chord node (the 1909 bridge's rhythm).
      const bays = Math.round(hs * 1.4);
      for (let i = 0; i <= bays; i++) {
        const y = -hs + (2 * hs * i) / bays;
        // Plates stand inward from each chord's outer edge: nothing drops into the clearance.
        for (const z of [ZB - CHORD / 2, ZB + GIRDER_D + CHORD / 2 - 0.2])
          gussets.push(
            box({
              size: [0.012, 0.24, 0.2],
              at: [GIRDER_W / 2 + CHORD / 2 + 0.005, y, z],
              color: steel,
              strip: 'iron',
              omit: ['back'], // against the chord
            }),
          );
      }
    }
    part('girder', merge([girder, ...gussets]));
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
          box({ size: [0.05, 0.05, 1.02], at: [-GIRDER_W / 2 - 0.02, y, DECK_Z], color: galv }),
        );
    if (lod === 2)
      deck.push(
        box({
          size: [0.05, 2 * hs, 0.05],
          at: [-GIRDER_W / 2 - 0.02, 0, DECK_Z + 0.97],
          color: galv,
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
          color: galv,
        }),
      );
      deck.push(
        beam({
          from: [railX, -hs, DECK_Z + 0.5],
          to: [railX, hs, DECK_Z + 0.5],
          width: 0.035,
          color: galv,
        }),
      );
      const n = Math.round((2 * hs) / 1.5);
      for (let i = 0; i <= n; i++) {
        const y = -hs + (2 * hs * i) / n;
        deck.push(box({ size: [0.05, 0.05, 1.02], at: [railX, y, DECK_Z], color: galv }));
      }
    }
    part('walkway', merge(deck));

    // ---- ladder up the right post to the walkway.
    if (lod < 2) {
      const ly = -hs - 0.32;
      const lad: Mesh[] = [];
      for (const x of [-0.2, 0.2])
        lad.push(box({ size: [0.05, 0.04, DECK_Z - FOOT_H], at: [x, ly, FOOT_H], color: steel }));
      for (let z = FOOT_H + 0.3; z < DECK_Z - 0.05; z += lod === 0 ? 0.3 : 0.6)
        lad.push(
          box({ size: [0.4, 0.022, 0.022], at: [0, ly, z - 0.011], color: steel, strip: 'iron' }),
        ); // square-bar rung
      for (const z of [FOOT_H + 1.5, ZB - 1, ZB + 0.6])
        for (const x of [-0.2, 0.2])
          lad.push(box({ size: [0.04, 0.12, 0.04], at: [x, ly + 0.08, z], color: steel })); // stand-off brackets
      part('ladder', merge(lad));
    }

    // ---- operating rods: up-and-down rods from each arm's mechanism case to the deck, a crank
    // and a rod along the walkway to the right post, down its back face to a crank on the
    // footing (the lever frame's pipe line leaves from there). LOD0 only.
    if (lod === 0)
      trackYs(p.tracks).forEach((y, t) => {
        const r: Mesh[] = [];
        const rod = (from: Vec3, to: Vec3): Mesh =>
          beam({ from, to, width: 0.025, color: steel, strip: 'iron', caps: false });
        const caseZ = (kind: 'home' | 'distant'): number =>
          DECK_Z + LOW_ARM + (kind === 'home' ? ARM_GAP : 0) - 0.2;
        for (const [dy, kind] of [
          [-0.075, 'home'],
          [0.075, 'distant'],
        ] as const)
          r.push(rod([-0.16, y + dy, DECK_Z], [-0.16, y + dy, caseZ(kind) + 0.02]));
        const rx = -0.42 + 0.045 * t;
        const lie = DECK_Z + 0.0125;
        // Crank box on the deck under the mast rods, the run to the post, the drop down it.
        r.push(
          box({
            size: [0.3, 0.2, 0.06],
            at: [(rx - 0.16) / 2, y, DECK_Z],
            color: steelDark,
            strip: 'iron',
          }),
        );
        r.push(rod([rx, y, lie], [rx, -hs + 0.02 * t, lie]));
        const py = -hs - 0.06 + 0.04 * t;
        r.push(
          box({
            size: [0.16, 0.12, 0.06],
            at: [rx + 0.06, py, DECK_Z],
            color: steelDark,
            strip: 'iron',
          }),
        );
        const px = -POST_D / 2 - 0.045 - 0.0125;
        r.push(rod([rx, py, DECK_Z], [px, py, DECK_Z - 0.3]));
        r.push(rod([px, py, DECK_Z - 0.3], [px, py, FOOT_H + 0.06]));
        r.push(
          box({
            size: [0.14, 0.1, 0.12],
            at: [px + 0.02, py, FOOT_H],
            color: steelDark,
            strip: 'iron',
          }),
        );
        part(`rods_${t}`, merge(r));
      });

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
          // A cap collar over the pipe's open top (sleeved 3 cm down it), then the ball; LOD2
          // keeps the plain ball (its triangle budget is tight and nothing up close to see).
          profile: [
            ...(lod < 2
              ? ([
                  [0, DECK_Z + MAST_H - 0.03],
                  [0.072, DECK_Z + MAST_H - 0.03],
                  [0.072, DECK_Z + MAST_H + 0.02],
                ] as const)
              : ([[0, DECK_Z + MAST_H - 0.02]] as const)),
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
        if (lod < 2) {
          // Mechanism case, its front face sunk 2 cm into the pipe it is strapped to.
          mast.push(box({ size: [0.22, 0.22, 0.32], at: [-0.16, y, pz - 0.2], color: steelDark }));
          // Bearing bracket (its own part, so only it is cleared for the spindle turning in it):
          // a clamp band round the pipe and the bored boss.
          // Only the faces that show: the boss's root face sits inside the pipe and its bore is
          // filled by the spindle; the clamp band's inner face is pressed into the pipe.
          const r = mastR(pz - DECK_Z);
          const brg: Mesh[] = [
            lathe({
              profile: [
                [0.045, 0.035],
                [0.045, BEARING_X1],
                [SPINDLE_R, BEARING_X1],
              ],
              segments: lod === 0 ? 8 : 6,
              axis: 'x',
              color: steelDark,
              at: [0, y, pz],
            }),
          ];
          if (lod === 0)
            brg.push(
              lathe({
                profile: [
                  [r - 0.004, pz - 0.07],
                  [r + 0.01, pz - 0.07],
                  [r + 0.01, pz + 0.07],
                  [r - 0.004, pz + 0.07],
                ],
                segments: segs,
                color: steelDark,
                at: [0, y, 0],
              }),
            );
          part(`bearing_${t}_${kind}`, merge(brg));
        }
        // Lamp behind the red roundel's stop position, on a bracket from the mast.
        const ly = y - 0.25;
        const lz = pz - 0.25;
        part(
          `lamp_${t}_${kind}`,
          lod === 2
            ? // Far: the lamp case alone, widened to bear on the mast (no chimney, no bracket).
              box({ size: [0.2, 0.31, 0.3], at: [-0.02, y - 0.22, lz - 0.15], color: steelDark })
            : merge([
                box({ size: [0.2, 0.24, 0.3], at: [-0.02, ly, lz - 0.15], color: steelDark }),
                lathe({
                  profile: [
                    [0.07, lz + 0.15],
                    [0.05, lz + 0.26],
                    [0, lz + 0.29],
                  ],
                  segments: 6,
                  color: steelDark,
                  at: [-0.02, ly, 0],
                }), // chimney
                box({
                  size: [0.05, 0.12, 0.05],
                  at: [-0.02, y - 0.09, lz - 0.05],
                  color: steelDark,
                }), // bracket to the mast
              ]),
        );
        part(
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
        const pivot: Vec3 = [0, y, pz];
        ctx.group(name, {
          at: pivot,
          // The spindle turns in the bearing's bore: that interlock is the pivot.
          ...(lod < 2 ? { clearOf: [`bearing_${t}_${kind}`] } : {}),
          // Lower quadrant: about −X the blade (+Y) drops; stop → 60° clear → stop.
          motion: {
            kind: 'sway',
            axis: [-1, 0, 0],
            degrees: 60,
            hz: 0.08 + 0.02 * k,
            oneWay: true,
          },
        });
        // Pivot-local meshes: their wear is read at the pivot's rest position up the mast.
        part(
          `${name}_spectacle`,
          a.spectacle,
          {
            parent: name,
            // Carried on its spindle in the mast bearing (LOD2 hub bears on the mast face).
            connect: { as: 'hinge', to: lod < 2 ? `bearing_${t}_${kind}` : `mast_${t}` },
          },
          sooty,
          pivot,
        );
        part(`${name}_blade`, a.blade, { parent: name }, sooty, pivot);
      }
      part(`mast_${t}`, merge(mast));
    });
  },
});

export const signal_gantry = bridge.variant({
  name: 'signal_gantry',
  description:
    'US lattice semaphore signal bridge over two tracks (c. 1910): lattice posts and girder, walkway, a mast per track with lower-quadrant home and distant arms, spectacles and lamps.',
  checks: [clearanceEnvelope(2), kneesLand(2)],
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
  checks: [clearanceEnvelope(4), kneesLand(4)],
});
