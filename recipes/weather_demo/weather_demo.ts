// Weathering demo: four everyday objects, each as a pristine / weathered pair on a labelled slab —
// a painted steel door in its frame (rust streaks under the hinge bolts, chipped edges, polish on
// the handle, dents), a wooden crate (sun-bleached, sagging boards, moss low on the shaded side),
// a precast concrete block (rust bleeding from its lifting anchors, moss, mud splash) and a
// 55-gallon steel drum (rusty chimes and hoops, dents, dusty lid). Same geometry both sides: only
// `weather(ctx, …)` differs, and its measured coverage lands in the manifest and QA `weather`.
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
  text,
  type Vec3,
  type WeatherEffects,
  weather,
} from '@developerz.ai/ts23d';

const SLAB_H = 0.12;
const SLAB = hex('#8e8a83');
const INK = hex('#1d1d1d');
const DOOR_PAINT = hex('#4d6150');
const STEEL = hex('#6f6f6c');
const WOOD = hex('#9a6c40');
const CONCRETE = hex('#a29e95');
const DRUM_PAINT = hex('#2f4d7a');

interface Obj {
  readonly meshes: Readonly<Record<string, Mesh>>;
  readonly fasteners: readonly { at: Vec3; radius: number }[];
  readonly touched?: readonly string[];
  readonly under: Vec3;
  readonly effects: WeatherEffects;
  readonly seed: number;
}

/** Steel door 0.91 × 2.03 m (36 × 80 in) in a 0.1 m frame, three hinges with two bolts each. */
function door(): Obj {
  const leaf = box({ size: [0.045, 0.91, 2.03], at: [0, 0, 0], color: DOOR_PAINT, strip: 'iron' });
  const jamb = (y: number): Mesh =>
    box({ size: [0.12, 0.08, 2.11], at: [0, y, 0], color: STEEL, strip: 'iron' });
  const frame = merge([
    jamb(-0.495),
    jamb(0.495),
    box({ size: [0.12, 1.07, 0.08], at: [0, 0, 2.03], color: STEEL, strip: 'iron' }),
  ]);
  const fasteners: { at: Vec3; radius: number }[] = [];
  const hinges: Mesh[] = [];
  for (const z of [0.25, 1.0, 1.75]) {
    hinges.push(
      box({ size: [0.006, 0.09, 0.12], at: [0.0255, -0.41, z], color: STEEL, strip: 'iron' }),
    );
    for (const dz of [0.025, 0.095]) {
      const at: Vec3 = [0.0315, -0.41, z + dz];
      hinges.push(
        cylinder({ radius: 0.009, length: 0.006, segments: 8, color: STEEL, at, axis: 'x' }),
      );
      fasteners.push({ at, radius: 0.012 });
    }
  }
  const handle = merge([
    box({ size: [0.02, 0.06, 0.16], at: [0.0325, 0.36, 0.95], color: STEEL, strip: 'iron' }),
    box({ size: [0.05, 0.14, 0.022], at: [0.065, 0.33, 1.02], color: STEEL, strip: 'iron' }),
    box({ size: [0.03, 0.022, 0.022], at: [0.0475, 0.39, 1.02], color: STEEL, strip: 'iron' }),
  ]);
  return {
    meshes: { leaf, frame, hinges: merge(hinges), handle },
    fasteners,
    touched: ['handle'],
    under: hex('#8d8c88'),
    seed: 11,
    effects: {
      bleach: { where: 'side-facing | up-facing', amount: 0.45, strength: 0.45 },
      chips: { where: 'convex-edges', amount: 0.35 },
      scratches: { where: 'touched', amount: 0.5 },
      rust: {
        where: 'below-fasteners | fasteners | (convex-edges & up-facing)',
        amount: 0.35,
        streaks: true,
        streakLength: 0.7,
      },
      mud: { where: 'ground-near & side-facing', amount: 0.45 },
      dust: { where: 'up-facing', amount: 0.6 },
      dents: { where: 'exposed-panels', count: [2, 4], depth: 0.008, radius: 0.09 },
    },
  };
}

/** Shipping crate 0.8 × 0.8 × 0.62 m: corner posts, three boards a side, four on the lid. */
function crate(): Obj {
  const parts: Mesh[] = [
    box({ size: [0.72, 0.72, 0.58], at: [0, 0, 0.01], color: hex('#3a2a1a'), strip: 'wood' }),
  ];
  for (const [x, y] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const)
    parts.push(
      box({ size: [0.06, 0.06, 0.6], at: [x * 0.37, y * 0.37, 0], color: WOOD, strip: 'wood' }),
    );
  for (let i = 0; i < 3; i++) {
    const z = 0.01 + i * 0.2;
    parts.push(box({ size: [0.02, 0.68, 0.18], at: [0.39, 0, z], color: WOOD, strip: 'wood' }));
    parts.push(box({ size: [0.02, 0.68, 0.18], at: [-0.39, 0, z], color: WOOD, strip: 'wood' }));
    parts.push(box({ size: [0.68, 0.02, 0.18], at: [0, 0.39, z], color: WOOD, strip: 'wood' }));
    parts.push(box({ size: [0.68, 0.02, 0.18], at: [0, -0.39, z], color: WOOD, strip: 'wood' }));
  }
  for (let i = 0; i < 4; i++)
    parts.push(
      box({ size: [0.8, 0.18, 0.022], at: [0, -0.3 + i * 0.2, 0.6], color: WOOD, strip: 'wood' }),
    );
  return {
    meshes: { crate: merge(parts) },
    fasteners: [],
    under: hex('#c9a273'),
    seed: 23,
    effects: {
      bleach: { where: 'up-facing | sunlit', amount: 0.6, strength: 0.75 },
      chips: { where: 'convex-edges', amount: 0.3 },
      moss: { where: 'shaded & wet & !down-facing', amount: 0.3 },
      mud: { where: 'ground-near & side-facing', amount: 0.35 },
      dust: { where: 'up-facing', amount: 0.4 },
      sag: { where: 'long-spans', max: 0.006 },
      warp: { where: 'long-spans', max: 0.004 },
    },
  };
}

/** Precast concrete block 0.8 × 0.6 × 0.6 m with two cast-in lifting anchors on its face. */
function block(): Obj {
  const body = box({ size: [0.6, 0.8, 0.6], color: CONCRETE, strip: 'concrete', bevel: 0.015 });
  const anchors: Mesh[] = [];
  const fasteners: { at: Vec3; radius: number }[] = [];
  for (const y of [-0.22, 0.22]) {
    anchors.push(
      box({ size: [0.01, 0.07, 0.05], at: [0.305, y, 0.48], color: STEEL, strip: 'iron' }),
    );
    fasteners.push({ at: [0.31, y, 0.49], radius: 0.035 });
  }
  return {
    meshes: { block: body, anchors: merge(anchors) },
    fasteners,
    under: hex('#c4bfb4'),
    seed: 37,
    effects: {
      rust: { where: 'below-fasteners | fasteners', amount: 0.6, streaks: true, streakLength: 0.4 },
      chips: { where: 'convex-edges', amount: 0.3 },
      moss: { where: 'shaded & wet & !down-facing', amount: 0.25 },
      mud: { where: 'ground-near & side-facing', amount: 0.4 },
      dust: { where: 'up-facing', amount: 0.45 },
    },
  };
}

/** 55 US gal drum: 0.572 m × 0.851 m, rolled chimes and two rolling hoops, two bungs on the lid. */
function drum(): Obj {
  const r = 0.286;
  const hoop = (z: number): [number, number][] => [
    [r, z - 0.012],
    [r + 0.009, z],
    [r, z + 0.012],
  ];
  const profile: [number, number][] = [
    [r - 0.004, 0],
    [r + 0.004, 0.006],
    [r + 0.004, 0.02],
    [r, 0.026],
    ...hoop(0.284),
    ...hoop(0.567),
    [r, 0.825],
    [r + 0.004, 0.831],
    [r + 0.004, 0.845],
    [r - 0.004, 0.851],
  ];
  const shell = lathe({
    profile,
    segments: 32,
    color: DRUM_PAINT,
    strip: 'iron',
    caps: true,
    creaseDeg: 40,
  });
  const bungs: Mesh[] = [];
  const fasteners: { at: Vec3; radius: number }[] = [];
  for (const [x, y, rr] of [
    [0.17, 0.08, 0.03],
    [-0.17, 0.08, 0.016],
  ] as const) {
    bungs.push(
      cylinder({ radius: rr, length: 0.012, segments: 12, color: STEEL, at: [x, y, 0.857] }),
    );
    fasteners.push({ at: [x, y, 0.857], radius: rr });
  }
  return {
    meshes: { shell, bungs: merge(bungs) },
    fasteners,
    under: hex('#8d8c88'),
    seed: 41,
    effects: {
      rust: { where: 'convex-edges | fasteners', amount: 0.15, streaks: true, streakLength: 0.25 },
      chips: { where: 'convex-edges', amount: 0.3 },
      dust: { where: 'up-facing', amount: 0.5 },
      mud: { where: 'ground-near & side-facing', amount: 0.35 },
      bleach: { where: 'sunlit', amount: 0.3 },
      dents: { where: 'exposed-panels & side-facing', count: [1, 3], depth: 0.01, radius: 0.1 },
    },
  };
}

/** One labelled slab with the pristine object on the left (−Y) and the weathered one on the right. */
function pair(ctx: BuildContext, name: string, make: () => Obj, at: Vec3, gap: number): void {
  const len = 2 * gap + 1.2;
  const label = (s: string, y: number): Mesh =>
    text(s, { origin: [0.6, y, 0.03], height: 0.06, color: INK, align: 'centre' });
  const slab = merge([
    box({ size: [1.2, len, SLAB_H], color: SLAB, strip: 'concrete' }),
    label('NEW', -gap / 2 - 0.3),
    label('WEATHERED', gap / 2 + 0.3),
  ]);
  ctx.part(`${name}_slab`, slab, { at });
  const top: Vec3 = [at[0], at[1], at[2] + SLAB_H];
  const fresh = make();
  for (const [k, m] of Object.entries(fresh.meshes))
    ctx.part(`${name}_new_${k}`, m, { at: [top[0], top[1] - gap / 2 - 0.3, top[2]] });
  const old = make();
  const aged = weather(ctx, old.meshes, {
    name: `${name}_old`,
    seed: old.seed,
    age: 0.8,
    resolution: [0.05, 0.12, 0],
    fasteners: old.fasteners,
    ...(old.touched ? { touched: old.touched } : {}),
    under: old.under,
    effects: old.effects,
  });
  for (const [k, m] of Object.entries(aged))
    ctx.part(`${name}_old_${k}`, m, { at: [top[0], top[1] + gap / 2 + 0.3, top[2]] });
}

export const weather_demo = defineAsset({
  name: 'weather_demo',
  kind: 'prop',
  tags: ['material', 'weather', 'demo'],
  description:
    'Weathering demo: steel door, wooden crate, concrete block and steel drum, each pristine beside weathered by weather() — rust streaks, chips, dust, moss, mud, bleach, dents, sag.',
  sources: [
    'https://en.wikipedia.org/wiki/Drum_(container)',
    'https://www.wbdg.org/guides-specifications/building-envelope-design-guide/fenestration-systems/doors',
  ],
  budget: { triangles: [110000, 24000, 4000] },
  build(ctx) {
    pair(ctx, 'door', door, [-1.2, -1.45, 0], 0.9);
    pair(ctx, 'crate', crate, [-1.2, 1.55, 0], 0.6);
    pair(ctx, 'block', block, [1.0, -1.45, 0], 0.6);
    pair(ctx, 'drum', drum, [1.0, 1.55, 0], 0.4);
  },
});
