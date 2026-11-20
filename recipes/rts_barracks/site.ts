// Warden Hall site dressing per stage and damage: lashed timber scaffolding round a half-built hall
// (poles, ledgers, putlogs, plank decks, a ladder, blocks and a mortar bucket up top, a gin-pole
// hoist on the rear tower), the foundation's working yard (block pallets under draped team
// tarps, a stickered oak stack, setting-out profiles with string lines, a mortar tub and shovel,
// a wheelbarrow), team banners, and the wreckage of every ruin: broken (not cubic) blocks of
// many sizes, gravel, charred and splintered beams (some leaning), fallen team roof pieces half
// buried in grit, the scaffold's fallen poles. Every loose piece rests on the ground, the plinth
// or a piece already laid.

import {
  applyAffine,
  boundsOf,
  box,
  cylinder,
  dmath,
  frame,
  type Lod,
  type Mesh,
  merge,
  place,
  prism,
  type Rng,
  sweep,
  translate,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  BONE,
  BONE_DARK,
  BRASS,
  chevronPlan,
  ellipsoid,
  IRON,
  pebble,
  SOOT,
  TEAM,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';
import { HALF_X, HALF_Y, PLINTH, PLINTH_OUT, WALL_T } from './plan.ts';

const WOOD: Vec3 = [0.23, 0.14, 0.08];
/** Scaffold: weathered poles, fresh pine planks and pallets, hemp lashings, lime mortar. */
export const POLE: Vec3 = [0.27, 0.24, 0.2];
export const PLANK: Vec3 = [0.55, 0.42, 0.27];
export const ROPE: Vec3 = [0.6, 0.52, 0.36];
export const MORTAR: Vec3 = [0.62, 0.6, 0.55];
/** Ash tool handles. */
export const ASH: Vec3 = [0.42, 0.27, 0.14];
/** The wheelbarrow's painted steel tray. */
export const BARROW: Vec3 = [0.22, 0.3, 0.24];
/** Grit and dust drifted over the ruin (pale salt-flat dust). */
export const GRIT: Vec3 = [0.36, 0.33, 0.27];
const CHAR: Vec3 = [0.05, 0.04, 0.035];
/** Wood ash over a burnt ruin: pale grey, cooler than the salt grit. */
export const ASH_GREY: Vec3 = [0.3, 0.29, 0.27];
/** A roof piece burnt through: charred slate, no team paint left. */
export const CHAR_SLATE: Vec3 = [0.07, 0.065, 0.06];
const OFF = 1.25; // scaffold line outside the wall face
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec3): Vec3 => {
  const l = dmath.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Drop a mesh so its lowest point rests on `floor`. */
const settle = (m: Mesh, floor: number): Mesh => translate(m, [0, 0, floor - boundsOf(m).min[2]]);

/** A square-section bar (board, beam, rail) from a to b, `w` wide and `h` deep, faces kept level. */
export function bar(a: Vec3, b: Vec3, w: number, h: number, color: Vec3, extra = 0): Mesh {
  const d = sub(b, a);
  const len = dmath.hypot(d[0], d[1], d[2]);
  const x = unit(d);
  const up: Vec3 = Math.abs(x[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
  const y = unit(cross(up, x));
  const z = cross(x, y);
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return applyAffine(
    box({ size: [len + extra, w, h], at: [0, 0, -h / 2], color }),
    frame(x, y, z, mid),
  );
}

/** A round pole from a to b (LOD2: a square bar), with extra rings in its lowest metre so mud
 *  and damp can climb the foot. */
function pole(lod: Lod, a: Vec3, b: Vec3, r: number, color: Vec3): Mesh {
  if (lod === 2) return bar(a, b, r * 2, r * 2, color);
  const at = (t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const len = dmath.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const feet = lod === 0 && len > 1.5 ? [0.25, 0.6, 1.0].map((m) => m / len) : [];
  return sweep({
    section: { radius: r, segments: lod === 0 ? 10 : 6 },
    path: [a, ...feet.map(at), b],
    color,
    caps: true,
  });
}

/** A hemp lashing wound round a pole at a ledger node. */
const lashing = (at: Vec3): Mesh =>
  cylinder({ radius: 0.085, length: 0.16, segments: 8, at, color: ROPE });

export interface ScaffoldMeshes {
  readonly frame: Mesh;
  readonly decks: Mesh;
  readonly tarp: Mesh;
}

/**
 * Scaffold poles + ledgers + lashings + putlogs + plank decks on the front and the −Y side (the
 * camera's sides), a ladder, a gin-pole hoist over the rear tower. `damaged`: the bay by the
 * breach has collapsed (its pole gone, a ledger fallen to the ground, a plank dangling).
 */
export function scaffold(lod: Lod, height: number, rng: Rng, damaged = false): ScaffoldMeshes {
  const out: Mesh[] = [];
  const decks: Mesh[] = [];
  const xs = damaged ? [-4, -2, 0, 4] : [-4, -2, 0, 2, 4];
  const ys = [-6, -4, -2, 2, 4, 6];
  const fx = HALF_X + PLINTH_OUT + OFF - 0.5;
  const sy = -(HALF_Y + PLINTH_OUT + OFF - 0.5);
  const R = 0.065;
  const poles: Vec3[] = [...ys.map((y): Vec3 => [fx, y, 0]), ...xs.map((x): Vec3 => [x, sy, 0])];
  // The two standards nearest the hoist run a lift higher (to 5.4 m): the scaffold peaks there.
  const tall = (p: Vec3): boolean => p[1] < 0 && p[0] <= -2 && Math.abs(p[1] - sy) < 1e-6;
  for (const p of poles) out.push(pole(lod, p, [p[0], p[1], tall(p) ? 5.4 : height], R, POLE));
  const levels = [1.6, 3.2, height - 0.25];
  if (lod < 2) {
    // Top ledger on the tall pair, and a diagonal brace across each scaffold face.
    out.push(pole(lod, [-4, sy - R - 0.05, 5.2], [-2, sy - R - 0.05, 5.2], 0.05, POLE));
    if (lod === 0) out.push(lashing([-4, sy, 5.2]), lashing([-2, sy, 5.2]));
    out.push(pole(lod, [fx + R + 0.05, -6, 0.3], [fx + R + 0.05, -2, 3.0], 0.045, POLE));
    out.push(pole(lod, [fx + R + 0.05, 2, 0.3], [fx + R + 0.05, 6, 3.0], 0.045, POLE));
    out.push(pole(lod, [-4, sy - R - 0.05, 0.3], [0, sy - R - 0.05, 3.0], 0.045, POLE));
  }
  const deckZ = 3.2 + 0.05;
  if (lod < 2) {
    for (const z of levels) {
      out.push(
        pole(
          lod,
          [fx + R + 0.05, ys[0] ?? 0, z],
          [fx + R + 0.05, ys[ys.length - 1] ?? 0, z],
          0.05,
          POLE,
        ),
      );
      // The side ledger: in the collapsed bay the top ledgers end at the last standing pole.
      const x1 = damaged && z > 2 ? 0 : (xs[xs.length - 1] ?? 0);
      out.push(pole(lod, [xs[0] ?? 0, sy - R - 0.05, z], [x1, sy - R - 0.05, z], 0.05, POLE));
      if (damaged && z > 2)
        out.push(pole(lod, [4, sy - R - 0.05, z], [5.0, sy - R - 0.05, z], 0.05, POLE));
      if (lod === 0) for (const p of poles) out.push(lashing([p[0], p[1], z]));
    }
    // Putlogs: short bearers from the ledger into the wall under each deck.
    for (const y of ys)
      out.push(
        bar([fx, y, deckZ - 0.06], [HALF_X + WALL_T / 2 - 0.1, y, deckZ - 0.06], 0.1, 0.1, POLE),
      );
    for (const x of xs)
      out.push(
        bar([x, sy, deckZ - 0.06], [x, -(HALF_Y + WALL_T / 2) + 0.1, deckZ - 0.06], 0.1, 0.1, POLE),
      );
  }
  // Plank decks at 3.2 m on the putlogs: boards at LOD0 (each its own tone), one board at LOD1,
  // a single thin slab at LOD2 so the far mesh keeps the deck line.
  const deckFront = { x0: HALF_X + WALL_T / 2, x1: fx + 0.2, y0: -6.3, y1: 6.3 };
  const deckSide = { x0: -4.3, x1: damaged ? 0.3 : 4.3, y0: sy - 0.2, y1: -(HALF_Y + WALL_T / 2) };
  for (const [dk, alongX] of [
    [deckFront, false],
    [deckSide, true],
  ] as const) {
    const across = alongX ? dk.y1 - dk.y0 : dk.x1 - dk.x0;
    const n = lod === 0 ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const k = lod === 0 ? rng.range(0.82, 1.05) : 1;
      const tone: Vec3 = [PLANK[0] * k, PLANK[1] * k, PLANK[2] * k];
      const w = across / n;
      const c = (alongX ? dk.y0 : dk.x0) + w * (i + 0.5);
      decks.push(
        alongX
          ? box({
              size: [dk.x1 - dk.x0, w, 0.05],
              at: [(dk.x0 + dk.x1) / 2, c, deckZ],
              color: tone,
            })
          : box({
              size: [w, dk.y1 - dk.y0, 0.05],
              at: [c, (dk.y0 + dk.y1) / 2, deckZ],
              color: tone,
            }),
      );
    }
  }
  if (lod < 2) {
    // Ladder from the ground up to the front deck.
    const lx = fx + 0.15;
    const foot: Vec3 = [lx + 1.0, 3.0, 0];
    const head: Vec3 = [lx + 0.05, 3.0, deckZ + 0.9];
    for (const s of [-0.22, 0.22])
      out.push(
        bar([foot[0], foot[1] + s, foot[2]], [head[0], head[1] + s, head[2]], 0.06, 0.08, POLE),
      );
    if (lod === 0)
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const p: Vec3 = [
          foot[0] + (head[0] - foot[0]) * t,
          foot[1],
          foot[2] + (head[2] - foot[2]) * t,
        ];
        out.push(bar([p[0], p[1] - 0.22, p[2]], [p[0], p[1] + 0.22, p[2]], 0.04, 0.04, PLANK));
      }
    // Work on the side deck: blocks waiting and a mortar bucket.
    const dz = deckZ + 0.05;
    for (const [x, k] of [
      [-3.2, 1],
      [-2.6, 0.94],
      [-2.9, 0.97],
    ] as const)
      out.push(
        pebble(
          lod,
          [0.5, 0.36, 0.3],
          [x, sy + 0.55, dz + (x === -2.9 ? 0.3 : 0)],
          [BONE[0] * k, BONE[1] * k, BONE[2] * k],
          'stone',
        ),
      );
    out.push(
      cylinder({
        radius: 0.17,
        length: 0.3,
        segments: 10,
        at: [-1.6, sy + 0.6, dz + 0.15],
        color: IRON,
      }),
    );
    out.push(
      cylinder({
        radius: 0.15,
        length: 0.02,
        segments: 10,
        at: [-1.6, sy + 0.6, dz + 0.29],
        color: MORTAR,
      }),
    );
    out.push(...hoist(lod));
  } else out.push(bar([-2.8, -9.6, 0], [-4.0, -8.2, 5.3], 0.16, 0.16, POLE));
  if (damaged && lod < 2) {
    // The collapsed bay: a top ledger down on the ground, a plank hanging off the deck end, a pole
    // leaning on the wall by the breach, and a split plank on the ground.
    out.push(pole(lod, [0.2, sy - 0.2, height - 0.25], [3.6, sy - 1.2, 0.05], 0.05, POLE));
    decks.push(bar([0.3, sy + 0.4, deckZ + 0.02], [1.2, sy + 0.5, deckZ - 2.2], 0.28, 0.05, PLANK));
    out.push(pole(lod, [2.6, sy - 0.9, 0], [2.1, -(HALF_Y + WALL_T / 2) - 0.07, 2.4], R, POLE));
    decks.push(bar([2.0, sy - 0.9, 0.025], [4.0, sy - 1.3, 0.025], 0.12, 0.05, PLANK));
    decks.push(bar([2.1, sy - 0.75, 0.025], [3.5, sy - 1.0, 0.025], 0.1, 0.05, PLANK));
    // A front deck section torn loose at its −Y end, hanging down the face (reads from the front).
    decks.push(bar([fx - 0.1, -6.2, deckZ], [fx + 0.55, -6.85, deckZ - 2.3], 0.9, 0.05, PLANK));
    // The lost standard's stump, snapped and splintered, and a lashing dangling off the ledger.
    out.push(pole(lod, [2, sy, 0], [2, sy, 1.3], R, POLE));
    if (lod === 0)
      out.push(
        bar([2, sy, 1.25], [2.04, sy + 0.03, 1.62], 0.05, 0.04, POLE),
        bar([1.98, sy - 0.02, 1.25], [1.95, sy - 0.04, 1.5], 0.04, 0.03, POLE),
        tube(lod, [0.05, sy - R - 0.05, 3.2], [0.12, sy - R - 0.1, 2.45], 0.012, 0.012, ROPE),
      );
  }
  // Team tarp hung from the top side ledger, its rolled head over the ledger.
  const tarp = merge([
    box({
      size: [4.2, 0.04, 1.5],
      at: [-1, sy - 0.17, height - 1.75],
      color: TEAM,
      strip: 'canvas',
    }),
    tube(
      lod,
      [-3.1, sy - 0.17, height - 0.22],
      [1.1, sy - 0.17, height - 0.22],
      0.06,
      0.06,
      teamShade(0.8),
    ),
  ]);
  return { frame: merge(out), decks: merge(decks), tarp };
}

/** Gin-pole hoist over the rear −Y tower: a leaning pole, guy rope, pulley and a hanging bucket. */
function hoist(lod: Lod): Mesh[] {
  const base: Vec3 = [-2.8, -9.6, 0];
  const top: Vec3 = [-4.0, -8.2, 5.3];
  const out: Mesh[] = [pole(lod, base, top, 0.08, POLE)];
  out.push(box({ size: [0.16, 0.16, 0.22], at: [top[0], top[1], top[2] - 0.2], color: IRON }));
  // Hoist rope down to the load, guy rope back to a ground stake.
  out.push(tube(lod, [top[0], top[1], top[2] - 0.2], [top[0], top[1], 4.58], 0.012, 0.012, ROPE));
  out.push(
    cylinder({ radius: 0.16, length: 0.3, segments: 8, at: [top[0], top[1], 4.45], color: WOOD }),
  );
  out.push(tube(lod, top, [0.6, -9.5, 0.3], 0.012, 0.012, ROPE));
  out.push(box({ size: [0.08, 0.08, 0.4], at: [0.6, -9.5, 0], color: POLE }));
  return out;
}

/** A team tarp thrown over a pile `w` × `d` with its top at `z`: a flat top and four skirts
 *  hanging in folds (wavy hems, flared out), corners left open. */
function tarp(lod: Lod, at: Vec3, w: number, d: number, z: number, rng: Rng): Mesh {
  const out: Mesh[] = [
    box({ size: [w + 0.16, d + 0.16, 0.04], at: [at[0], at[1], z], color: TEAM, strip: 'canvas' }),
  ];
  const n = lod === 0 ? 7 : lod === 1 ? 4 : 2;
  for (let side = 0; side < 4; side++) {
    const len = side % 2 === 0 ? w : d;
    const drop = rng.range(0.7, 1.0);
    // Hem: a wave along the side, deeper in the middle where the cloth sags.
    const prof: Vec2[] = [[-len / 2, 0.02]];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sag = dmath.sin(t * Math.PI) * 0.15 + (i % 2 === 0 ? 0 : rng.range(0.06, 0.16));
      prof.push([-len / 2 + t * len, -drop - sag]);
    }
    prof.push([len / 2, 0.02]);
    const skirt = prism({
      profile: prof,
      depth: 0.03,
      plane: 'xz',
      color: teamShade(0.86),
      strip: 'canvas',
    });
    const yaw = (side * Math.PI) / 2;
    const off = (side % 2 === 0 ? d : w) / 2 + 0.06;
    out.push(
      place(place(skirt, { roll: -0.12 }), {
        at: [at[0] - dmath.sin(yaw) * off, at[1] + dmath.cos(yaw) * off, z + 0.02],
        yaw,
      }),
    );
  }
  if (lod === 0)
    // A fold ridge across the top where the tarp was thrown.
    out.push(
      tube(
        lod,
        [at[0] - w / 2, at[1] + 0.1, z + 0.05],
        [at[0] + w / 2, at[1] - 0.05, z + 0.05],
        0.035,
        0.035,
        teamShade(0.9),
      ),
    );
  return merge(out);
}

/** A pallet and its stacked blocks (LOD0 3 courses × 2, LOD1/2 two stepped blocks). */
function pile(lod: Lod, at: Vec3, rng: Rng): { mesh: Mesh; top: number } {
  const out: Mesh[] = [box({ size: [1.4, 1.1, 0.14], at, color: PLANK })];
  const tone = (): Vec3 => {
    const k = rng.range(0.9, 1.05);
    return [BONE[0] * k, BONE[1] * k, BONE[2] * k];
  };
  if (lod === 0) {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++)
        out.push(
          pebble(
            lod,
            [0.95, 0.48, 0.45],
            [at[0], at[1] - 0.25 + c * 0.5, 0.14 + r * 0.45],
            tone(),
            'stone',
          ),
        );
    return { mesh: merge(out), top: 0.14 + 1.35 };
  }
  out.push(pebble(lod, [1.3, 1.0, 0.9], [at[0], at[1], 0.14], tone(), 'stone'));
  out.push(pebble(lod, [0.95, 1.0, 0.45], [at[0] - 0.1, at[1], 1.04], tone(), 'stone'));
  return { mesh: merge(out), top: 1.49 };
}

/** The stickered oak stack: 4 layers of 4 baulks on cross battens, ~1 m high, along Y. */
export function timberStack(lod: Lod, at: Vec3, rng: Rng): Mesh {
  const out: Mesh[] = [];
  const L = 4;
  const S = 0.22;
  // Far: no stickers to bear the layers, so the stack is one block of its full height.
  if (lod === 2)
    return box({ size: [0.94, L, 4 * S + 3 * 0.04], at: [at[0], at[1], 0], color: WOOD });
  let z = 0;
  for (let layer = 0; layer < 4; layer++) {
    if (lod === 0) {
      for (let i = 0; i < 4; i++) {
        const k = rng.range(0.85, 1.08);
        out.push(
          box({
            size: [S, L - (layer === 3 && i === 3 ? 0.6 : 0), S],
            at: [at[0] - 0.36 + i * 0.24, at[1], z],
            color: [WOOD[0] * k, WOOD[1] * k, WOOD[2] * k],
          }),
        );
      }
    } else out.push(box({ size: [0.94, L, S], at: [at[0], at[1], z], color: WOOD }));
    z += S;
    if (layer < 3) {
      // Stickers: thin battens across, so air gets between the layers.
      for (const y of [-1.6, 0, 1.6])
        out.push(box({ size: [1.0, 0.06, 0.04], at: [at[0], at[1] + y, z], color: POLE }));
      z += 0.04;
    }
  }
  return merge(out);
}

/** Setting-out: builder's profile boards at the front corners and string lines along the walls. */
function settingOut(lod: Lod): Mesh {
  const out: Mesh[] = [];
  const zs = 0.95;
  const fxL = HALF_X + WALL_T / 2 + 0.05;
  const syL = -(HALF_Y + WALL_T / 2 + 0.05);
  const board = (x: number, y: number, alongX: boolean): void => {
    for (const s of [-0.35, 0.35]) {
      const p: Vec3 = alongX ? [x + s, y, 0] : [x, y + s, 0];
      out.push(box({ size: [0.06, 0.06, 1.15], at: p, color: POLE }));
    }
    out.push(
      box({
        size: alongX ? [0.85, 0.03, 0.15] : [0.03, 0.85, 0.15],
        at: [x + (alongX ? 0 : 0.045), y + (alongX ? 0.045 : 0), zs - 0.1],
        color: PLANK,
      }),
    );
  };
  board(fxL, -(HALF_Y + PLINTH_OUT + 1.3), true);
  board(fxL, HALF_Y + PLINTH_OUT + 1.3, true);
  board(HALF_X + PLINTH_OUT + 1.3, syL, false);
  board(-2.6, syL - 0.8, false);
  if (lod === 0) {
    out.push(
      tube(
        lod,
        [fxL, -(HALF_Y + PLINTH_OUT + 1.3) + 0.045, zs],
        [fxL, HALF_Y + PLINTH_OUT + 1.3 + 0.045, zs],
        0.006,
        0.006,
        ROPE,
      ),
    );
    out.push(
      tube(
        lod,
        [HALF_X + PLINTH_OUT + 1.3 + 0.045, syL, zs],
        [-2.6 + 0.045, syL - 0.8, zs],
        0.006,
        0.006,
        ROPE,
      ),
    );
  }
  return merge(out);
}

/** A wheelbarrow at rest (tray, wheel, legs, handles), facing +X. */
function wheelbarrow(lod: Lod, at: Vec3, yaw: number): Mesh {
  const tray = prism({
    profile: [
      [-0.45, 0.32],
      [0.35, 0.32],
      [0.55, 0.62],
      [-0.6, 0.62],
    ],
    depth: 0.6,
    plane: 'xz',
    color: BARROW,
  });
  const out: Mesh[] = [
    tray,
    cylinder({
      radius: 0.2,
      length: 0.1,
      segments: lod === 0 ? 14 : 8,
      axis: 'y',
      at: [0.62, 0, 0.2],
      color: SOOT,
    }),
    ...[-0.22, 0.22].map((y) => bar([0.62, y * 0.45, 0.2], [-1.05, y, 0.55], 0.05, 0.05, ASH)),
    ...[-0.2, 0.2].map((y) => bar([-0.35, y, 0.0], [-0.35, y, 0.34], 0.05, 0.05, ASH)),
  ];
  if (lod === 0)
    out.push(
      cylinder({
        radius: 0.05,
        length: 0.5,
        segments: 8,
        axis: 'y',
        at: [0.62, 0, 0.2],
        color: IRON,
      }),
    );
  return place(merge(out), { at, yaw });
}

/** The mortar tub with a shovel standing in it. */
function mortarTub(lod: Lod, at: Vec3): Mesh {
  const out: Mesh[] = [
    cylinder({
      radius: 0.45,
      length: 0.3,
      segments: lod === 0 ? 16 : 8,
      at: [at[0], at[1], 0.15],
      color: WOOD,
    }),
    cylinder({
      radius: 0.42,
      length: 0.04,
      segments: lod === 0 ? 16 : 8,
      at: [at[0], at[1], 0.28],
      color: MORTAR,
    }),
    bar([at[0] + 0.1, at[1], 0.26], [at[0] - 0.25, at[1] + 0.2, 1.25], 0.035, 0.035, ASH),
    bar([at[0] + 0.12, at[1] - 0.01, 0.22], [at[0] + 0.06, at[1] + 0.04, 0.45], 0.22, 0.02, IRON),
  ];
  return merge(out);
}

/** Pallets under team tarps, the oak stack, setting-out, mortar tub and wheelbarrow. `raided`:
 *  one pallet tipped over the slab's broken corner, its blocks spilled. */
export function materials(lod: Lod, rng: Rng, raided = false): { piles: Mesh; tarps: Mesh } {
  const out: Mesh[] = [];
  const tarps: Mesh[] = [];
  const spots: Vec3[] = [
    [HALF_X + 2.6, 4.2, 0],
    [-1, -(HALF_Y + 2.4), 0],
    ...(raided ? [] : [[HALF_X + 2.6, -4.5, 0] as Vec3]),
  ];
  for (const at of spots) {
    const p = pile(lod, at, rng);
    out.push(p.mesh);
    tarps.push(tarp(lod, at, 0.95, 1.0, p.top, rng));
  }
  if (raided) {
    // Tipped over the broken corner: the pallet on its side, blocks spilled down the slope.
    const tipped = merge([
      box({ size: [1.4, 0.14, 1.1], at: [0, 0, 0], color: PLANK }),
      pebble(lod, [0.95, 0.45, 0.48], [0, 0.29, 0.1], BONE, 'stone'),
    ]);
    out.push(
      settle(place(tipped, { at: [HALF_X + 2.0, -HALF_Y - 0.6, 0], yaw: 0.5, roll: 0.35 }), -0.04),
    );
    tarps.push(
      settle(
        place(box({ size: [1.5, 1.2, 0.04], at: [0, 0, 0], color: TEAM, strip: 'canvas' }), {
          at: [HALF_X + 3.2, -HALF_Y - 1.8, 0],
          yaw: 0.9,
          roll: 0.06,
        }),
        -0.01,
      ),
    );
  }
  out.push(timberStack(lod, [-HALF_X - 2.2, -1, 0], rng));
  if (lod < 2) {
    out.push(settingOut(lod));
    out.push(mortarTub(lod, [HALF_X + 2.4, -1.6, 0]));
    out.push(wheelbarrow(lod, [HALF_X + 3.6, 1.6, 0], 2.2));
  }
  if (raided && lod === 2) out.push(settingOut(1));
  return { piles: merge(out), tarps: merge(tarps) };
}

/**
 * A team banner on a pole: a brass bracket carries the crossbar 14 cm in front of the pole, the
 * cloth hangs from a sewn sleeve the crossbar runs through (so it is held over a face, not an
 * edge), the faction chevron sewn onto its face; `torn` shortens it.
 */
export function banner(lod: Lod, at: Vec3, h: number, torn = false): { pole: Mesh; cloth: Mesh } {
  const bx = at[0] + 0.14;
  const bz = at[2] + h - 0.15;
  const p = merge([
    tube(lod, at, [at[0], at[1], at[2] + h], 0.07, 0.06, IRON),
    box({
      size: [0.2, 0.08, 0.08],
      at: [at[0] + 0.07, at[1], bz - 0.04],
      color: BRASS,
      // LOD2: an 8 cm bracket's top and underside are below a pixel.
      omit: lod === 2 ? ['top', 'bottom'] : [],
    }),
    tube(lod, [bx, at[1] - 0.8, bz], [bx, at[1] + 0.8, bz], 0.04, 0.04, BRASS),
  ]);
  const len = torn ? 1.6 : 3.0;
  const cloth: Mesh[] = [
    // The sewn sleeve is a 4 cm lip: LOD2 hangs the cloth straight off the crossbar it encloses.
    ...(lod < 2
      ? [box({ size: [0.12, 1.5, 0.14], at: [bx, at[1], bz - 0.07], color: TEAM, strip: 'canvas' })]
      : []),
    lod === 0
      ? hangingCloth([bx, at[1], bz], 1.5, len, torn)
      : box({ size: [0.05, 1.5, len], at: [bx, at[1], bz - len], color: TEAM, strip: 'canvas' }),
  ];
  if (lod === 0 && !torn)
    cloth.push(
      place(chevronPlan([0, 0, 0], 0.8, 1.0, 0.3, 0.04, teamShade(0.7)), {
        at: [bx + 0.045, at[1], bz - 1.35],
        pitch: -Math.PI / 2,
      }),
    );
  return { pole: p, cloth: merge(cloth) };
}

/**
 * A banner cloth `w` wide hanging `len` from its top centre `top`, 5 cm thick: the hem frayed
 * into tongues (deeper when `torn`), the lower third darkened by rain splash and road dirt.
 */
function hangingCloth(top: Vec3, w: number, len: number, torn: boolean): Mesh {
  const n = 7;
  const prof: Vec2[] = [
    [-w / 2, 0],
    [w / 2, 0],
  ];
  for (let i = 0; i <= n * 2; i++) {
    const y = w / 2 - (i / (n * 2)) * w;
    const deep = i % 2 === 0 ? 0 : torn ? 0.32 : 0.16;
    // Irregular tongues: every third one hangs a little lower.
    prof.push([y, -len + deep - (i % 6 === 2 ? 0.08 : 0)]);
  }
  const cloth = prism({ profile: prof, depth: 0.05, plane: 'yz', color: TEAM, strip: 'canvas' });
  const colors = new Float32Array(cloth.colors.length);
  for (let i = 0; i < colors.length; i += 3) {
    const z = cloth.positions[i + 2] ?? 0;
    const t = Math.max(0, Math.min(1, (-z - len * 0.6) / (len * 0.4)));
    colors.set(teamShade(1 - 0.45 * t), i);
  }
  return translate({ ...cloth, colors }, top);
}

/** A loose piece already laid: its plan centre, size and top, for the next piece to rest on. */
interface Laid {
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly top: number;
}

/** A broken block: a box side profile with one or two corners knocked off (LOD0/1), extruded. */
function shard(lod: Lod, rng: Rng, w: number, d: number, h: number, color: Vec3): Mesh {
  if (lod === 2) return box({ size: [w, d, h], at: [0, 0, 0], color, strip: 'stone' });
  const cut = (): number => rng.range(0.15, 0.45);
  const prof: Vec2[] = [
    [-w / 2, 0],
    [w / 2, 0],
    ...(rng.next() < 0.6
      ? ([
          [w / 2, h * (1 - cut())],
          [w / 2 - w * cut(), h],
        ] as Vec2[])
      : ([[w / 2, h]] as Vec2[])),
    ...(rng.next() < 0.5
      ? ([
          [-w / 2 + w * cut() * 0.6, h],
          [-w / 2, h * (1 - cut() * 0.7)],
        ] as Vec2[])
      : ([[-w / 2, h]] as Vec2[])),
  ];
  return prism({ profile: prof, depth: d, plane: 'xz', color, strip: 'stone' });
}

/**
 * A rubble heap: `n` broken blocks (0.3–1.1 × a full block) round `centre` within `spread`,
 * stacked the way a heap settles — the first third bedded into the floor, every later block
 * resting on one already laid — plus gravel and shards round its foot and charred beams, one
 * leaning up onto the heap with splintered ends (LOD0).
 */
export function rubble(
  lod: Lod,
  rng: Rng,
  centre: Vec3,
  spread: Vec3,
  n: number,
  floor: number,
): Mesh {
  const out: Mesh[] = [];
  const laid: Laid[] = [];
  for (let i = 0; i < n; i++) {
    // LOD2 keeps only the big pieces: a far heap reads by its largest blocks.
    // Near, every third piece is a half or quarter block: a heap is not one block size.
    const small = lod < 2 && i % 3 === 2 ? rng.range(0.25, 0.5) : 1;
    const s = 1.1 * dmath.pow(rng.range(lod === 2 ? 0.65 : 0.3, 1.0), 0.8) * small;
    const k = rng.range(0.6, 1.0);
    const h = s * rng.range(0.4, 0.8);
    const chunk = shard(lod, rng, s, s * rng.range(0.6, 1.1), h, [
      BONE_DARK[0] * k,
      BONE_DARK[1] * k,
      BONE_DARK[2] * k,
    ]);
    const base = i < n / 3 || laid.length === 0;
    const on = base ? null : (laid[rng.int(0, laid.length - 1)] ?? null);
    const x = on ? on.x + rng.range(-0.3, 0.3) * on.s : centre[0] + rng.range(-1, 1) * spread[0];
    const y = on ? on.y + rng.range(-0.3, 0.3) * on.s : centre[1] + rng.range(-1, 1) * spread[1];
    const m = place(chunk, {
      at: [x, y, 0],
      yaw: rng.range(0, Math.PI),
      pitch: rng.range(-0.18, 0.18),
      roll: rng.range(-0.18, 0.18),
    });
    // Bedded deep enough that a tilted, broken piece still sits on a face, not a corner.
    const bed = Math.max(0.08, h * 0.4);
    // A heap never grows past its height budget: stop stacking once the top is reached.
    const want = on && on.top - floor < spread[2] ? on.top - bed : floor - 0.04;
    const done = settle(m, want);
    laid.push({ x, y, s, top: boundsOf(done).max[2] });
    out.push(done);
  }
  if (lod === 0)
    // Gravel and shards round the heap's foot, bedded a centimetre into the floor.
    for (let i = 0; i < Math.round(n * 1.4); i++) {
      const g = rng.range(0.07, 0.22);
      const k = rng.range(0.55, 1.0);
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.6, 1.25);
      // Inside the plinth edge when the heap is on it (floor > 0).
      const lim = (v: number, m: number): number => (floor > 0 ? Math.max(-m, Math.min(m, v)) : v);
      out.push(
        settle(
          place(
            box({
              size: [g, g * rng.range(0.6, 1), g * 0.6],
              at: [0, 0, 0],
              color: [BONE_DARK[0] * k, BONE_DARK[1] * k, BONE_DARK[2] * k],
              strip: 'stone',
            }),
            {
              at: [
                lim(centre[0] + dmath.cos(a) * spread[0] * r, HALF_X + PLINTH_OUT - 0.3),
                lim(centre[1] + dmath.sin(a) * spread[1] * r, HALF_Y + PLINTH_OUT - 0.3),
                0,
              ],
              yaw: rng.range(0, Math.PI),
              roll: rng.range(-0.15, 0.15),
            },
          ),
          floor - 0.03,
        ),
      );
    }
  if (lod < 2) {
    const beams = Math.max(3, Math.round(n / 12));
    for (let i = 0; i < beams; i++) {
      const len = rng.range(2.5, 4);
      const beam = merge([
        box({ size: [len, 0.24, 0.24], at: [0, 0, -0.12], color: CHAR }),
        ...(lod === 0
          ? [
              box({ size: [0.5, 0.07, 0.08], at: [len / 2 + 0.2, 0.05, -0.02], color: CHAR }),
              box({ size: [0.35, 0.06, 0.07], at: [len / 2 + 0.12, -0.07, -0.1], color: CHAR }),
            ]
          : []),
      ]);
      const m = place(beam, {
        at: [
          centre[0] + rng.range(-0.5, 0.5) * spread[0],
          centre[1] + rng.range(-0.5, 0.5) * spread[1],
          0,
        ],
        yaw: rng.range(0, Math.PI),
        pitch: rng.range(-0.04, 0.04),
      });
      out.push(settle(m, floor - 0.06));
    }
    // One beam leaning up onto the tallest piece of the heap.
    const top = laid.reduce(
      (a, b) => (b.top > a.top ? b : a),
      laid[0] ?? { x: 0, y: 0, s: 1, top: floor },
    );
    if (top.top - floor > 0.5) {
      const foot: Vec3 = [top.x + 2.2, top.y - 1.0, floor + 0.04];
      out.push(bar(foot, [top.x, top.y, top.top + 0.06], 0.22, 0.22, CHAR));
    }
  }
  return merge(out);
}

/** Recolour a box by its faces: tops `k`, sides and undersides darker (dirt, soot, shadow). */
function undersides(m: Mesh, top: number, under: number): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let i = 0; i < colors.length; i += 3)
    colors.set(teamShade((m.normals[i + 2] ?? 0) > 0.5 ? top : under), i);
  return { ...m, colors };
}

/**
 * Fallen team roof: broken pieces (deck with its slates still on), tilted where they slid off
 * the heap, darker on every face but the top, LOD2 keeps four tilted pieces. Near, every other
 * piece is burnt black, ash lies on the rest and grit drifts at their foot: all of that goes in
 * `grit` (not team-painted).
 */
export function fallenSlabs(
  lod: Lod,
  rng: Rng,
  floor: number,
  /** 'tarp': a site that never had a roof leaves torn team tarps instead. */
  kind: 'roof' | 'tarp' = 'roof',
): { slabs: Mesh; grit: Mesh | null } {
  const out: Mesh[] = [];
  const grit: Mesh[] = [];
  const n = lod === 2 ? 4 : 6;
  const tarp = kind === 'tarp';
  for (let i = 0; i < n; i++) {
    const w = rng.range(1.0, 1.9);
    const d = rng.range(1.2, 2.4);
    // Near: every other roof piece burnt through to black (not team any more); the rest charred
    // and dust-coated so the red reads buried, not painted (top 35-50%, edges 22%).
    const burnt = lod < 2 && i % 2 === 1;
    const piece = box({
      size: tarp ? [w * 0.9, d * 0.8, 0.04] : [w, d, 0.16],
      at: [0, 0, tarp ? -0.02 : -0.08],
      color: burnt ? CHAR_SLATE : TEAM,
      strip: tarp ? 'canvas' : 'slate',
    });
    const slab = burnt ? piece : undersides(piece, rng.range(0.3, 0.45), 0.2);
    const pose = {
      at: [rng.range(-3, 3), rng.range(-4.5, 4.5), 0] as Vec3,
      yaw: rng.range(0, Math.PI),
      roll: rng.range(0.08, tarp ? 0.15 : 0.3),
      pitch: rng.range(-0.1, 0.1),
    };
    const turned = place(slab, pose);
    const dz = floor - 0.05 - boundsOf(turned).min[2];
    const placed = translate(turned, [0, 0, dz]);
    (burnt ? grit : out).push(placed);
    if (lod === 0) {
      // Ash lying on a roof piece itself (its upper half), and a drift of grit at its low edge.
      const top = 0.08;
      const ash = box({
        size: [w * rng.range(0.5, 0.8), d * rng.range(0.4, 0.6), 0.03],
        at: [w * rng.range(-0.1, 0.1), d * 0.2, top - 0.005],
        color: ASH_GREY,
        strip: 'concrete',
      });
      if (!tarp) grit.push(translate(place(ash, pose), [0, 0, dz]));
      const b = boundsOf(placed);
      grit.push(
        // A low mound needs no more than the mid-res ellipsoid's 120 triangles.
        ellipsoid(
          1,
          [
            b.min[0] + (b.max[0] - b.min[0]) * rng.range(0.3, 0.7),
            b.min[1] + (b.max[1] - b.min[1]) * rng.range(0.3, 0.7),
            floor + 0.02,
          ],
          [rng.range(0.6, 1.1), rng.range(0.5, 0.85), rng.range(0.07, 0.13)],
          GRIT,
        ),
      );
    }
  }
  return { slabs: merge(out), grit: grit.length ? merge(grit) : null };
}

/** The scaffold's wreck in a ruin: fallen poles and charred planks round the walls, a pole and a
 *  ledger leaning on the standing corner. */
export function scaffoldWreck(lod: Lod, rng: Rng, cornerTop: number): Mesh {
  const FACE_Y = HALF_Y + WALL_T / 2;
  const out: Mesh[] = [];
  const face = HALF_X + WALL_T / 2;
  // One pole fell against the standing corner's front face, one against the side wall's stub:
  // each rests its head on a wall, never meeting the other in mid-air.
  out.push(pole(lod, [face + 2.4, -4.4, 0], [face + 0.07, -5.4, cornerTop - 0.4], 0.065, POLE));
  out.push(pole(lod, [4.3, -(FACE_Y + 2.2), 0], [3.6, -(FACE_Y + 0.06), 2.3], 0.05, POLE));
  for (let i = 0; i < (lod === 2 ? 2 : 6); i++) {
    const a: Vec3 = [rng.range(-4, 4), -(HALF_Y + PLINTH_OUT + rng.range(0.5, 2.4)), 0];
    const yaw = rng.range(-0.5, 0.5);
    const len = rng.range(2.5, 4.5);
    const b: Vec3 = [a[0] + dmath.cos(yaw) * len, a[1] + dmath.sin(yaw) * len * 0.3, 0];
    const charred = i % 2 === 1;
    out.push(
      settle(
        i < 3
          ? pole(lod, a, b, 0.06, charred ? CHAR : POLE)
          : bar(a, b, 0.25, 0.05, charred ? CHAR : PLANK),
        -0.02,
      ),
    );
  }
  return merge(out);
}

/** The wall's outer face distance from the hall centre along X / Y. */
export const FACE = { x: HALF_X + WALL_T / 2, y: HALF_Y + WALL_T / 2, z: PLINTH } as const;

/**
 * A charred timber frame still standing in a ruin, its vertical: `gate`, the gate's door frame
 * (one post whole, one snapped, the lintel sagging from one to the other); `yard`, a site's
 * timber shed frame burnt to two posts and a slanting beam. Feet on `floor`.
 */
export function charredFrame(lod: Lod, kind: 'gate' | 'yard', floor: number): Mesh {
  const s = 0.24;
  const post = (x: number, y: number, h: number): Mesh =>
    box({ size: [s, s, h], at: [x, y, floor - 0.02], color: CHAR });
  if (kind === 'gate') {
    // Posts stand 30 cm in from the opening's stone jambs (a frame, not a slit against them).
    const x = HALF_X + 0.05;
    const y = 1.6;
    const out: Mesh[] = [post(x, -y, 3.4), post(x, y, 2.3)];
    // The lintel rests on the whole post's top and drops onto the snapped one.
    out.push(bar([x, -y - s / 2, floor + 3.38], [x, y + s / 2, floor + 2.28], s, s, CHAR, 0.1));
    if (lod === 0)
      // Splintered tip on the snapped post.
      out.push(
        bar([x, y, floor + 2.25], [x + 0.05, y + 0.05, floor + 2.6], 0.08, 0.06, CHAR),
        bar([x, y - 0.05, floor + 2.25], [x - 0.04, y - 0.07, floor + 2.48], 0.06, 0.05, CHAR),
      );
    return merge(out);
  }
  const x = HALF_X - 1.6;
  const y = HALF_Y - 1.4;
  return merge([
    post(x, y, 2.4),
    post(x - 2.2, y, 1.5),
    bar([x + s / 2, y, floor + 2.38], [x - 2.2 - s / 2, y, floor + 1.48], s, s, CHAR, 0.05),
  ]);
}
