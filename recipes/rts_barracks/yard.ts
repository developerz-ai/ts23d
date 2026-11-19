// The foundation yard's verticals and ground story: sheer-legs over the −Y tower footing (two
// lashed poles, a pulley, a block hanging on its rope), knocked over in a raid; a hod leaning on
// the near block pallet; mud and mortar trodden into the ground round the pallets, the tub and the
// barrow, wheel ruts to the steps; and at a raided corner the broken slab itself (tilted pieces
// with pale fresh fractures, snapped formwork boards, a scorch on the ground round it).

import {
  box,
  hex,
  type Lod,
  type Mesh,
  merge,
  place,
  prism,
  type Rng,
  sweep,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { BONE_DARK, IRON, SLATE } from '../_lib/rts/style.ts';
import { HALF_X, HALF_Y, PLINTH, PLINTH_OUT, TOWER } from './plan.ts';
import { ASH, bar, MORTAR, PLANK, POLE, ROPE } from './site.ts';

/** Trodden brine mud and the scorch of a blast, on bare ground. */
const GROUND_MUD: Vec3 = hex('#3f3529');
const GROUND_SCORCH: Vec3 = hex('#1c1a17');
const STONE: Vec3 = [0.62, 0.58, 0.5];

/** A round pole a → b (LOD2: a square bar). */
const pole = (lod: Lod, a: Vec3, b: Vec3, r: number): Mesh =>
  lod === 2
    ? bar(a, b, r * 2, r * 2, POLE)
    : sweep({
        section: { radius: r, segments: lod === 0 ? 10 : 6 },
        path: [a, b],
        color: POLE,
        caps: true,
      });

/** Apex of the sheer-legs over the −Y tower footing (the site's tallest point, 3.4 m). */
const APEX: Vec3 = [TOWER.x, -TOWER.y, 3.25];

/**
 * Sheer-legs: two poles splayed 3.6 m out across the footing (clear of its ring and the course
 * being laid), lashed at the apex, a pulley block and a stone hanging on its rope over the ring.
 * `fallen`: a raid knocked them over: one leg on the ground, the other leaning on the ring's rim.
 */
export function sheerLegs(lod: Lod, fallen: boolean): Mesh {
  const out: Mesh[] = [];
  const [cx, cy] = [TOWER.x, -TOWER.y];
  if (fallen) {
    out.push(pole(lod, [cx + 3.4, cy - 1.9, 0.08], [cx + 0.2, cy - 2.9, 0.08], 0.08));
    // Foot out on the ground, resting on the ring's outer rim (r 2.0, 0.9 m), head up past it.
    const foot: Vec3 = [cx + 0.3, cy - 3.0, 0];
    const rim: Vec3 = [cx + 0.2, cy - 1.98, 0.98];
    const d: Vec3 = [rim[0] - foot[0], rim[1] - foot[1], rim[2] - foot[2]];
    const l = Math.hypot(d[0], d[1], d[2]);
    const len = 2.6;
    out.push(
      pole(
        lod,
        foot,
        [foot[0] + (d[0] / l) * len, foot[1] + (d[1] / l) * len, foot[2] + (d[2] / l) * len],
        0.08,
      ),
    );
    if (lod < 2)
      out.push(box({ size: [0.5, 0.36, 0.32], at: [cx + 2.4, cy - 2.4, 0], color: STONE }));
    return merge(out);
  }
  for (const s of [1, -1])
    out.push(pole(lod, [cx + s * 2.16, cy - s * 2.88, 0], [APEX[0], APEX[1], APEX[2] + 0.1], 0.08));
  if (lod < 2) {
    // Lashing and pulley at the apex, the rope down to a stone block over the ring.
    out.push(box({ size: [0.24, 0.24, 0.3], at: [APEX[0], APEX[1], APEX[2] - 0.25], color: IRON }));
    out.push(
      sweep({
        section: { radius: 0.015, segments: 4 },
        path: [
          [APEX[0], APEX[1], APEX[2] - 0.2],
          [APEX[0], APEX[1], 1.72],
        ],
        color: ROPE,
        caps: true,
      }),
    );
    out.push(box({ size: [0.6, 0.4, 0.36], at: [APEX[0], APEX[1], 1.38], color: STONE }));
  }
  return merge(out);
}

/** A hod (V trough on a pole) leaning on the +X face of the −Y pallet's blocks, mortar in it. */
export function hod(lod: Lod, pile: Vec3, top: number): Mesh | null {
  if (lod === 2) return null;
  const foot: Vec3 = [pile[0] + 1.45, pile[1] + 0.1, 0];
  const head: Vec3 = [pile[0] + 0.56, pile[1] + 0.1, top - 0.3];
  const trough = prism({
    profile: [
      [-0.2, 0],
      [0.2, 0],
      [0.03, -0.22],
      [-0.03, -0.22],
    ],
    depth: 0.5,
    plane: 'yz',
    color: ASH,
  });
  return merge([
    bar(foot, head, 0.05, 0.05, ASH),
    place(trough, { at: [head[0] + 0.1, head[1], head[2] + 0.1] }),
    box({ size: [0.46, 0.36, 0.04], at: [head[0] + 0.1, head[1], head[2] + 0.08], color: MORTAR }),
  ]);
}

/** An irregular flat stain on the ground: `n` lobes round `at`, radius `r`, 1 cm thick. */
function patch(rng: Rng, at: readonly [number, number], r: number, color: Vec3, n: number): Mesh {
  const prof: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = rng.range(0.65, 1.15);
    prof.push([at[0] + Math.cos(a) * r * k, at[1] + Math.sin(a) * r * k * rng.range(0.7, 1)]);
  }
  return prism({
    profile: prof,
    depth: 0.01,
    plane: 'xy',
    centred: false,
    color,
    strip: 'concrete',
  });
}

/**
 * Ground stains round the yard (LOD0/1): mud trodden round the pallets and the barrow, mortar
 * splashed round the tub, two wheel ruts from the barrow to the steps; `raided` adds a scorch round
 * the broken corner.
 */
export function groundStains(lod: Lod, rng: Rng, raided: boolean): Mesh | null {
  if (lod === 2) return null;
  const n = lod === 0 ? 11 : 6;
  const out: Mesh[] = [
    patch(rng, [HALF_X + 2.6, 4.2], 1.3, GROUND_MUD, n),
    patch(rng, [-1, -(HALF_Y + 2.4)], 1.3, GROUND_MUD, n),
    patch(rng, [HALF_X + 3.5, 1.4], 1.0, GROUND_MUD, n),
    patch(rng, [HALF_X + 2.4, -1.6], 0.9, MORTAR, n),
  ];
  if (!raided) out.push(patch(rng, [HALF_X + 2.6, -4.5], 1.2, GROUND_MUD, n));
  else out.push(patch(rng, [HALF_X + 0.9, -HALF_Y - 0.9], 2.4, GROUND_SCORCH, n + 3));
  // Wheel ruts: the barrow's track to the front steps, two dark strips.
  for (const dy of [-0.2, 0.2])
    out.push(box({ size: [2.1, 0.07, 0.012], at: [HALF_X + 2.4, 1.0 + dy, 0], color: GROUND_MUD }));
  return merge(out);
}

/** Recolour a box: top `top`, every other face `side` (a slab's dark face, its fresh fracture). */
function faced(m: Mesh, top: Vec3, side: Vec3): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let i = 0; i < colors.length; i += 3)
    colors.set((m.normals[i + 2] ?? 0) > 0.7 ? top : side, i);
  return { ...m, colors };
}

/**
 * The raided corner's broken slab: pieces lying tilted in the bite (dark slate tops, pale fresh
 * fracture faces), snapped formwork boards sticking out of the bite edge (LOD0). LOD2: two pieces.
 */
export function slabChunks(lod: Lod, rng: Rng): Mesh {
  const x = HALF_X + PLINTH_OUT;
  const y = HALF_Y + PLINTH_OUT;
  const spots: Vec3[] = [
    [x - 2.0, -y + 0.25, 0],
    [x - 1.3, -y + 0.55, 0],
    [x - 0.6, -y + 1.25, 0],
    [x - 0.15, -y + 2.1, 0],
    [x - 0.9, -y + 0.15, 0],
  ];
  const out: Mesh[] = [];
  const fracture: Vec3 = [BONE_DARK[0] * 0.9, BONE_DARK[1] * 0.9, BONE_DARK[2] * 0.88];
  for (const [i, at] of spots.slice(0, lod === 2 ? 2 : spots.length).entries()) {
    const s = rng.range(0.55, 0.95);
    const chunk = faced(
      box({
        size: [s, s * rng.range(0.7, 1), PLINTH * rng.range(0.45, 0.7)],
        color: SLATE,
        strip: 'stone',
      }),
      SLATE,
      fracture,
    );
    // Tilted up against the slab edge, its low side bedded in the ground.
    out.push(
      place(chunk, {
        at: [at[0], at[1], -0.06],
        yaw: rng.range(0, Math.PI),
        roll: (i % 2 === 0 ? 1 : -1) * rng.range(0.18, 0.32),
        pitch: rng.range(-0.15, 0.15),
      }),
    );
  }
  if (lod === 0)
    // Snapped formwork boards poking out of the broken edge.
    for (const [a, b] of [
      [
        [x - 2.3, -y + 0.6, PLINTH * 0.5],
        [x - 2.0, -y - 0.35, PLINTH * 0.7],
      ],
      [
        [x - 0.5, -y + 1.6, PLINTH * 0.45],
        [x + 0.35, -y + 1.2, PLINTH * 0.6],
      ],
    ] as [Vec3, Vec3][])
      out.push(bar(a, b, 0.2, 0.03, PLANK));
  return merge(out);
}
