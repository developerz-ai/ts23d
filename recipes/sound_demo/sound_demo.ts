// Sound demo: a display deck with four things that make a noise — a small panel door that creaks
// as it swings, a 300 mm steel bell that rings as it swings, a pine crate with a knock for game
// code to fire, and a V10 long block idling in a seamless loop. Every clip is synthesised from
// material + size (/audio) and exported as KHR_audio_emitter + <clip>.wav. Each exhibit wears its
// use (`weather()`): paint worn through at the door handle, a rusted bell lip, a scuffed crate, an
// oil stain under the engine. Origin = deck floor centre; exhibits in a row along Y.
// Numbers: ./README.md.

import {
  type BuildContext,
  box,
  cylinder,
  defineAsset,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  sound,
  weather,
} from '@developerz.ai/ts23d';
import { crateMesh, DOOR, doorFrame, doorLeaf } from './exhibits.ts';

const DECK = hex('#9a8a74');
const STEEL = hex('#5d6266');
const BELL = hex('#b4aa98');
const OAK = hex('#7a5a3a');
const BLOCK = hex('#b9bcbe');
const RED = hex('#9a2a22');
const RUST = hex('#5a3a2a');
const OIL = hex('#14110e');
const LEAD = hex('#1c1c1e');
const T = 0.1; // deck top

// The clips: pure functions of their options, rendered once at module load.
const creak = sound.mechanism({
  kind: 'creak',
  material: 'wood_painted',
  speed: 0.4,
  duration: 2,
  name: 'door_creak',
});
const bell = sound.impact({
  material: 'steel',
  shape: 'hollow',
  size: 0.3,
  force: 0.8,
  duration: 3,
  name: 'bell_strike',
});
const knock = sound.impact({
  material: 'pine',
  shape: 'plate',
  size: 0.6,
  thickness: 0.02,
  mass: 1.5,
  name: 'crate_knock',
});
const idle = sound.engine({
  cylinders: 10,
  rpm: 800,
  firingOrder: [1, 10, 9, 4, 3, 6, 5, 8, 7, 2],
  exhaust: { length: 2.4, muffler: 0.4 },
  name: 'engine_v10_idle',
});

/** Door in its frame; the leaf carries the creak on its swing (its worn paint is in doorLeaf). */
function door(ctx: BuildContext, y: number): void {
  ctx.group('door', { at: [0.1, y, T] });
  const worn = weather(
    ctx,
    { frame: doorFrame(ctx.lod) },
    {
      name: 'door_frame_wear',
      seed: 29,
      age: 0.5,
      resolution: [0, 0, 0],
      under: hex('#c8a77c'),
      effects: {
        chips: { where: 'convex-edges', amount: 0.2 },
      },
    },
  );
  ctx.part('door_frame', worn.frame, { parent: 'door' });
  ctx.part('door_leaf', doorLeaf(ctx.lod), {
    parent: 'door',
    at: [-DOOR.thickness / 2, -DOOR.width / 2 + DOOR.gap, 0],
    motion: { kind: 'sway', axis: [0, 0, 1], degrees: 90, hz: 0.25, oneWay: true },
    // Hinged in its frame by design: the leaf turns away from the hinge jamb, but the jamb sits
    // behind the pivot inside the clashes gate's conservative swept sector.
    clearOf: ['door_frame'],
    sound: { onMotion: creak },
    connect: { as: 'hinge', to: 'door_frame' },
  });
}

/** Bell profile (radius, z) from the inner crown down to the lip and up the outside: D/13 lip. */
const BELL_PROFILE: readonly (readonly [number, number])[] = [
  [0.001, 0.228],
  [0.05, 0.222],
  [0.072, 0.2],
  [0.078, 0.17],
  [0.085, 0.13],
  [0.1, 0.08],
  [0.118, 0.04],
  [0.127, 0.006],
  [0.128, 0],
  [0.15, 0],
  [0.149, 0.012],
  [0.138, 0.04],
  [0.118, 0.08],
  [0.1, 0.14],
  [0.093, 0.19],
  [0.085, 0.222],
  [0.06, 0.245],
  [0.001, 0.25],
];

/** LOD2 bell: the outside run only, crown to lip and in to the sound-bow. */
const BELL_FAR: readonly (readonly [number, number])[] = [
  [0.001, 0.25],
  [0.06, 0.245],
  [0.093, 0.19],
  [0.1, 0.14],
  [0.138, 0.04],
  [0.15, 0],
  [0.128, 0],
];

/** Two sturdy posts with a cross-tie; the bell hangs from a wooden headstock on an axle. */
function bellStand(ctx: BuildContext, y: number): void {
  const seg = ctx.pick([32, 14, 10]);
  const bev = ctx.pick([0.004, 0.002, 0]);
  const pivot = 1.0;
  const posts: Mesh[] = [];
  for (const s of [-1, 1]) {
    posts.push(
      box({
        size: [0.28, 0.1, 0.04],
        at: [0, s * 0.25, 0],
        color: STEEL,
        strip: 'steel_painted',
        bevel: bev,
      }),
      box({
        size: [0.09, 0.09, pivot + 0.08],
        at: [0, s * 0.25, 0.04],
        color: STEEL,
        strip: 'steel_painted',
        bevel: bev,
      }),
    );
  }
  // Cross-tie between the posts, low, so the yoke cannot rack.
  posts.push(
    box({ size: [0.06, 0.41, 0.06], at: [0, 0, 0.3], color: STEEL, strip: 'steel_painted' }),
    // The axle is fixed in the bearing posts; the bell turns on it.
    cylinder({
      radius: 0.015,
      length: 0.5,
      segments: ctx.pick([12, 8, 6]),
      axis: 'y',
      color: STEEL,
      strip: 'steel_painted',
      at: [0, 0, pivot + 0.04],
    }),
  );
  const yoke = weather(
    ctx,
    { belfry: merge(posts) },
    {
      name: 'belfry_wear',
      seed: 37,
      age: 0.5,
      resolution: [0.5, 0, 0],
      under: hex('#9a9690'),
      effects: {
        chips: { where: 'convex-edges', amount: 0.2 },
        rust: { where: 'ground-near', amount: 0.25, streaks: false },
      },
    },
  );
  ctx.part('belfry', yoke.belfry, { at: [0, y, T] });
  const profile = ctx.lod === 2 ? BELL_FAR : BELL_PROFILE;
  const shell = lathe({
    profile: profile.map(([r, z]) => [r, z - 0.275] as const),
    segments: seg,
    color: BELL,
    strip: 'iron_cast',
  });
  const swinging: Mesh[] = [
    shell,
    // Wooden headstock clamped on the axle, the bell's crown bolted under it.
    box({ size: [0.08, 0.28, 0.07], at: [0, 0, -0.035], color: OAK, strip: 'oak', bevel: bev }),
  ];
  if (ctx.lod < 2)
    // Clapper: a rod from the crown staple and a ball inside the sound-bow.
    swinging.push(
      cylinder({
        radius: 0.006,
        length: 0.17,
        segments: 6,
        color: STEEL,
        strip: 'iron',
        at: [0, 0, -0.11],
      }),
      lathe({
        profile: [
          [0.001, -0.025],
          [0.018, -0.018],
          [0.025, 0],
          [0.018, 0.018],
          [0.001, 0.025],
        ],
        segments: ctx.pick([12, 8, 6]),
        color: STEEL,
        strip: 'iron',
        at: [0, 0, -0.215],
      }),
    );
  // A steel bell outdoors: rust bloom on the lip and down from the crown bolts, dust on the crown.
  const aged = weather(
    ctx,
    { bell: merge(swinging) },
    {
      name: 'bell_wear',
      seed: 41,
      age: 0.6,
      resolution: [0, 0, 0],
      fasteners: [{ at: [0, 0, -0.03], radius: 0.06 }],
      effects: {
        rust: {
          where: 'below-fasteners | convex-edges',
          amount: 0.3,
          streaks: true,
          streakLength: 0.15,
        },
        dust: { where: 'up-facing', amount: 0.3 },
      },
    },
  );
  ctx.part('bell', aged.bell, {
    at: [0, y, T + pivot + 0.04],
    motion: { kind: 'sway', axis: [0, 1, 0], degrees: 25, hz: 0.5 },
    clearOf: ['belfry'],
    sound: { onMotion: bell, gain: 0.9 },
    connect: { as: 'hinge', to: 'belfry' },
  });
}

/** 90° V10 long block on two timber bearers; the idle loop plays from its top. */
function engine(ctx: BuildContext, y: number): void {
  const bev = ctx.pick([0.006, 0.003, 0]);
  const L = 0.7;
  const bearers = [-0.22, 0.22].map((x) =>
    box({ size: [0.1, 0.62, 0.1], at: [x, 0, 0], color: OAK, strip: 'oak', bevel: bev }),
  );
  ctx.group('engine', { at: [0, y, T] });
  ctx.part('engine_bearers', merge(bearers), { parent: 'engine' });
  const z0 = 0.1;
  const block: Mesh[] = [
    box({
      size: [L - 0.08, 0.34, 0.13],
      at: [0, 0, z0],
      color: BLOCK,
      strip: 'iron_cast',
      bevel: bev,
    }),
    box({
      size: [L, 0.42, 0.2],
      at: [0, 0, z0 + 0.12],
      color: BLOCK,
      strip: 'iron_cast',
      bevel: bev,
    }),
  ];
  const deck = z0 + 0.3;
  for (const s of [-1, 1]) {
    const roll = -s * (Math.PI / 4);
    const out = (d: number): [number, number, number] => [
      0,
      s * d * Math.SQRT1_2,
      deck + d * Math.SQRT1_2,
    ];
    const bank = (
      size: [number, number, number],
      d: number,
      color = BLOCK,
      strip: 'iron_cast' | 'aluminium' = 'iron_cast',
    ) => place(box({ size, color, strip, bevel: bev }), { roll, at: out(d) });
    block.push(
      place(box({ size: [L - 0.04, 0.2, 0.2], color: BLOCK, strip: 'iron_cast', bevel: bev }), {
        roll,
        at: [0, s * 0.1, deck - 0.1],
      }),
      bank([L - 0.02, 0.22, 0.1], 0.12, BLOCK, 'aluminium'),
      bank([L - 0.08, 0.17, 0.06], 0.215, RED, 'aluminium'),
    );
    if (ctx.lod < 2)
      for (let i = 0; i < 5; i++) {
        const x = -0.228 + i * 0.114;
        const [, py, pz] = out(0.17);
        block.push(
          cylinder({
            radius: 0.022,
            length: 0.12,
            segments: ctx.pick([10, 6, 4]),
            axis: 'y',
            color: RUST,
            strip: 'iron_rust',
            at: [x, py + s * 0.11, pz - 0.05],
          }),
        );
      }
  }
  block.push(
    box({
      size: [L - 0.12, 0.16, 0.1],
      at: [0, 0, deck + 0.06],
      color: BLOCK,
      strip: 'aluminium',
      bevel: bev,
    }),
    cylinder({
      radius: 0.09,
      length: 0.05,
      segments: ctx.pick([24, 12, 8]),
      axis: 'x',
      color: STEEL,
      strip: 'steel_painted',
      at: [L / 2 + 0.025, 0, z0 + 0.2],
    }),
  );
  if (ctx.lod < 2) {
    // Exhaust collectors under each bank's stubs, and intake runners from the plenum to the heads.
    for (const s of [-1, 1]) {
      const [, py, pz] = [0, s * 0.17 * Math.SQRT1_2, deck + 0.17 * Math.SQRT1_2];
      block.push(
        cylinder({
          radius: 0.03,
          length: L - 0.06,
          segments: ctx.pick([10, 6, 4]),
          axis: 'x',
          color: RUST,
          strip: 'iron_rust',
          at: [0, py + s * 0.17, pz - 0.05],
        }),
      );
      if (ctx.lod === 0)
        for (let i = 0; i < 5; i++)
          block.push(
            place(
              cylinder({
                radius: 0.014,
                length: 0.1,
                segments: ctx.pick([8, 6, 4]),
                axis: 'y',
                color: BLOCK,
                strip: 'aluminium',
              }),
              { at: [-0.228 + i * 0.114, s * 0.09, deck + 0.13], roll: -s * 0.5 },
            ),
          );
    }
    if (ctx.lod === 0)
      // Plug leads: one per cylinder, from the coil packs on the plenum to each head.
      for (const s of [-1, 1])
        for (let i = 0; i < 5; i++)
          block.push(
            place(
              cylinder({
                radius: 0.004,
                length: 0.13,
                segments: 5,
                axis: 'y',
                color: LEAD,
                strip: 'rubber',
              }),
              { at: [-0.2 + i * 0.1, s * 0.12, deck + 0.17], roll: -s * 0.9 },
            ),
          );
  }
  ctx.part('engine_block', merge(block), { parent: 'engine' });
  // Oil weeps from the sump onto the deck between the bearers: a flat stain, a few mm thick.
  ctx.part(
    'oil_stain',
    merge([
      place(
        cylinder({
          radius: 0.2,
          length: 0.002,
          segments: ctx.pick([16, 10, 8]),
          color: OIL,
          strip: 'plain',
        }),
        {
          at: [0.04, 0.02, 0],
          scale: [1.3, 0.8, 1],
        },
      ),
      ...(ctx.lod < 2
        ? [
            place(
              cylinder({ radius: 0.06, length: 0.002, segments: 8, color: OIL, strip: 'plain' }),
              {
                at: [0.3, -0.18, 0],
              },
            ),
          ]
        : []),
    ]),
    { parent: 'engine' },
  );
  ctx.emitter('engine_idle', {
    kind: 'sound',
    clip: idle,
    when: 'always',
    parent: 'engine',
    at: [0, 0, deck + 0.2],
    refDistance: 2,
  });
}

export const sound_demo = defineAsset({
  name: 'sound_demo',
  kind: 'prop',
  description:
    'Teaching asset for /audio: a creaking door, a ringing steel bell, a knocking crate and a V10 idle loop, as KHR_audio_emitter + WAV',
  sources: [
    'https://en.wikipedia.org/wiki/Strike_tone',
    'https://www.engineeringtoolbox.com/young-modulus-d_417.html',
    'https://en.wikipedia.org/wiki/Chrysler_LA_engine#Viper_V10',
    'https://en.wikipedia.org/wiki/Firing_order',
  ],
  real: {
    length: 1.2,
    width: 3.4,
    height: 1.77,
    measures: [
      { label: 'bell mouth diameter', value: 0.3, axis: 'y', parts: ['bell'], source: 'README' },
      { label: 'crate length', value: 0.8, axis: 'x', parts: ['crate'], source: 'README' },
    ],
  },
  tags: ['demo', 'sound'],
  budget: { triangles: [8000, 3000, 1200] },
  build(ctx) {
    ctx.part(
      'deck',
      box({
        size: [1.2, 3.4, T],
        color: DECK,
        strip: 'oak',
        bevel: ctx.pick([0.01, 0.005, 0]),
      }),
    );
    door(ctx, -1.2);
    bellStand(ctx, -0.35);
    const box3: readonly [number, number, number] = [0.8, 0.6, 0.6];
    const scuffed = weather(
      ctx,
      { crate: crateMesh(ctx.lod, box3) },
      {
        name: 'crate_wear',
        seed: 43,
        age: 0.5,
        resolution: [0, 0, 0],
        under: hex('#d7bb8e'),
        effects: {
          chips: { where: 'convex-edges', amount: 0.2 },
          dust: { where: 'up-facing', amount: 0.35 },
          mud: { where: 'ground-near & side-facing', amount: 0.3 },
        },
      },
    );
    ctx.part('crate', scuffed.crate, { at: [0, 0.4, T] });
    ctx.emitter('crate_knock', {
      kind: 'sound',
      clip: knock,
      when: 'event',
      parent: 'crate',
      at: [0, 0, 0.6],
    });
    engine(ctx, 1.25);
  },
});
