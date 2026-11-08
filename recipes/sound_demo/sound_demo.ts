// Sound demo: a display deck with four things that make a noise — a small panel door that creaks
// as it swings, a 300 mm steel bell that rings as it swings, a pine crate with a knock for game
// code to fire, and a V10 long block idling in a seamless loop. Every clip is synthesised from
// material + size (/audio) and exported as KHR_audio_emitter + <clip>.wav. Origin = deck floor
// centre; exhibits in a row along Y. Numbers: ./README.md.

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
} from '@developerz.ai/ts23d';
import { crate, panel_door } from '../_parts/index.ts';

const DECK = hex('#3b3d40');
const STEEL = hex('#5d6266');
const BELL = hex('#6f6a60');
const OAK = hex('#7a5a3a');
const BLOCK = hex('#8a8d8f');
const RED = hex('#9a2a22');
const RUST = hex('#5a3a2a');
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

/** Door in its frame; the leaf carries the creak on its swing. */
function door(ctx: BuildContext, y: number): void {
  const pieces = panel_door.pieces({ width: 0.6, height: 1.6, rows: 2 }, ctx);
  ctx.group('door', { at: [0.1, y, T] });
  for (const pc of pieces) {
    const moving = pc.motion !== undefined;
    ctx.part(`door_${pc.name}`, pc.mesh, {
      parent: 'door',
      ...(pc.at ? { at: pc.at } : {}),
      ...(moving
        ? {
            motion: pc.motion,
            clearOf: ['door_frame'],
            sound: { onMotion: creak },
            connect: { as: 'hinge', to: 'door_frame' },
          }
        : {}),
    });
  }
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

/** Two posts with bearing blocks; the bell hangs from an axle and swings about Y. */
function bellStand(ctx: BuildContext, y: number): void {
  const seg = ctx.pick([32, 18, 10]);
  const bev = ctx.pick([0.004, 0.002, 0]);
  const pivot = 1.0;
  const posts: Mesh[] = [];
  for (const s of [-1, 1]) {
    posts.push(
      box({
        size: [0.24, 0.08, 0.04],
        at: [0, s * 0.24, 0],
        color: STEEL,
        strip: 'steel_painted',
        bevel: bev,
      }),
      box({
        size: [0.06, 0.06, pivot + 0.06],
        at: [0, s * 0.24, 0.04],
        color: STEEL,
        strip: 'steel_painted',
        bevel: bev,
      }),
    );
  }
  // The axle is fixed in the bearing posts; the bell turns on it.
  posts.push(
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
  ctx.part('belfry', merge(posts), { at: [0, y, T] });
  const shell = lathe({
    profile: BELL_PROFILE.map(([r, z]) => [r, z - 0.275] as const),
    segments: seg,
    color: BELL,
    strip: 'steel_painted',
  });
  const crown = box({
    size: [0.05, 0.03, 0.03],
    at: [0, 0, -0.03],
    color: BELL,
    strip: 'steel_painted',
  });
  ctx.part('bell', merge([shell, crown]), {
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
  ctx.part('engine_block', merge(block), { parent: 'engine' });
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
      { label: 'crate length', value: 0.8, axis: 'x', parts: ['crate'], source: 'kit crate' },
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
        strip: 'steel_painted',
        bevel: ctx.pick([0.01, 0.005, 0]),
      }),
    );
    door(ctx, -1.2);
    bellStand(ctx, -0.35);
    crate(ctx, 'crate', {}, { at: [0, 0.4, T] });
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
