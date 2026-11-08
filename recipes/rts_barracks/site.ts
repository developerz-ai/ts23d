// Warden Hall site dressing per stage and damage: scaffolding round a half-built hall (poles,
// ledgers, plank decks, a team tarp), the foundation's material piles and survey flag, team
// banners on the finished front, and rubble heaps (seeded broken blocks, charred beams, fallen
// team roof slabs). Every loose piece is dropped onto the ground or the plinth, never floating.

import {
  boundsOf,
  box,
  type Lod,
  type Mesh,
  merge,
  place,
  type Rng,
  translate,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  BONE,
  BONE_DARK,
  BRASS,
  chevronPlan,
  IRON,
  pebble,
  SOOT,
  TEAM,
  teamShade,
  tube,
} from '../_lib/rts/style.ts';
import { HALF_X, HALF_Y, PLINTH, PLINTH_OUT, WALL_T } from './plan.ts';

const WOOD: Vec3 = [0.23, 0.14, 0.08];
/** Scaffold: weathered poles, fresh pine planks and pallets. */
export const POLE: Vec3 = [0.36, 0.33, 0.28];
export const PLANK: Vec3 = [0.55, 0.42, 0.27];
const CHAR: Vec3 = [0.05, 0.04, 0.035];
const OFF = 1.25; // scaffold line outside the wall face

/** Drop a mesh so its lowest point rests on `floor`. */
const settle = (m: Mesh, floor: number): Mesh => translate(m, [0, 0, floor - boundsOf(m).min[2]]);

/** Scaffold poles + ledgers + decks on the front and the −Y side (the camera's sides). */
export function scaffold(lod: Lod, height: number): { frame: Mesh; tarp: Mesh } {
  const out: Mesh[] = [];
  const xs = [-4, -2, 0, 2, 4];
  const ys = [-6, -4, -2, 2, 4, 6];
  const fx = HALF_X + PLINTH_OUT + OFF - 0.5;
  const sy = -(HALF_Y + PLINTH_OUT + OFF - 0.5);
  const pole = (x: number, y: number): Mesh =>
    lod === 2
      ? box({ size: [0.12, 0.12, height], at: [x, y, 0], color: POLE })
      : tube(lod, [x, y, 0], [x, y, height], 0.06, 0.06, POLE);
  const poles: Vec3[] = [...ys.map((y): Vec3 => [fx, y, 0]), ...xs.map((x): Vec3 => [x, sy, 0])];
  for (const p of poles) out.push(pole(p[0], p[1]));
  if (lod < 2) {
    // Couplers: a steel clamp block where every ledger crosses a pole.
    for (const z of [1.6, 3.2, height - 0.25])
      for (const p of poles)
        out.push(box({ size: [0.17, 0.17, 0.13], at: [p[0], p[1], z - 0.065], color: IRON }));
    for (const z of [1.6, 3.2, height - 0.25]) {
      out.push(tube(lod, [fx, ys[0] ?? 0, z], [fx, ys[ys.length - 1] ?? 0, z], 0.05, 0.05, POLE));
      out.push(tube(lod, [xs[0] ?? 0, sy, z], [xs[xs.length - 1] ?? 0, sy, z], 0.05, 0.05, POLE));
    }
    // Plank decks at 3.2 m, bridging the pole line to the wall.
    out.push(
      box({
        size: [OFF + 0.2, 12.4, 0.06],
        at: [fx - (OFF + 0.2) / 2 + 0.06, 0, 3.21],
        color: PLANK,
      }),
    );
    out.push(
      box({
        size: [8.4, OFF + 0.2, 0.06],
        at: [0, sy + (OFF + 0.2) / 2 - 0.06, 3.21],
        color: PLANK,
      }),
    );
  }
  // Team tarp hung on the side scaffold: big, high, faces the camera.
  const tarp = box({
    size: [4.2, 0.05, 1.5],
    at: [-1, sy - 0.08, height - 1.6],
    color: TEAM,
    strip: 'canvas',
  });
  return { frame: merge(out), tarp };
}

/** Pallets of blocks under team tarps, and a timber stack (foundation stage). */
export function materials(lod: Lod, rng: Rng): { piles: Mesh; tarps: Mesh } {
  const out: Mesh[] = [];
  const tarps: Mesh[] = [];
  const piles: Vec3[] = [
    [HALF_X + 2.6, -4.5, 0],
    [HALF_X + 2.6, 4.2, 0],
    [-1, -(HALF_Y + 2.4), 0],
  ];
  for (const at of piles) {
    out.push(box({ size: [1.4, 1.1, 0.14], at, color: PLANK }));
    // LOD0: three courses of paired blocks; further out one block per pile.
    const fine = lod === 0;
    for (let r = 0; r < (fine ? 3 : 1); r++)
      for (let c = 0; c < (fine ? 2 : 1); c++) {
        const k = rng.range(0.92, 1.05);
        const size: Vec3 = fine ? [0.95, 0.48, 0.45] : [1.3, 1.0, 1.35];
        const y = fine ? at[1] - 0.25 + c * 0.5 : at[1];
        out.push(
          pebble(
            lod,
            size,
            [at[0], y, 0.14 + r * 0.45],
            [BONE[0] * k, BONE[1] * k, BONE[2] * k],
            'stone',
          ),
        );
      }
    // A team tarp thrown over the top course, draped a little past the edges.
    tarps.push(
      box({ size: [1.7, 1.4, 0.06], at: [at[0], at[1], 1.47], color: TEAM, strip: 'canvas' }),
    );
  }
  // Timber stack.
  for (let i = 0; i < (lod === 0 ? 6 : 2); i++)
    out.push(
      box({
        size: [4, 0.22, 0.22],
        at: [-HALF_X - 2.4, -2 + (i % 3) * 0.24, Math.floor(i / 3) * 0.22],
        color: WOOD,
        strip: 'wood',
      }),
    );
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
  const pole = merge([
    tube(lod, at, [at[0], at[1], at[2] + h], 0.07, 0.06, IRON),
    box({ size: [0.2, 0.08, 0.08], at: [at[0] + 0.07, at[1], bz - 0.04], color: BRASS }),
    tube(lod, [bx, at[1] - 0.8, bz], [bx, at[1] + 0.8, bz], 0.04, 0.04, BRASS),
  ]);
  const len = torn ? 1.6 : 3.0;
  const cloth: Mesh[] = [
    // Sleeve round the crossbar, then the hanging cloth.
    box({ size: [0.12, 1.5, 0.14], at: [bx, at[1], bz - 0.07], color: TEAM, strip: 'canvas' }),
    box({ size: [0.05, 1.5, len], at: [bx, at[1], bz - len], color: TEAM, strip: 'canvas' }),
  ];
  if (lod === 0 && !torn)
    // Faction chevron sewn on, a shade darker, 2 cm into the cloth.
    cloth.push(
      place(chevronPlan([0, 0, 0], 0.8, 1.0, 0.3, 0.04, teamShade(0.7)), {
        at: [bx + 0.045, at[1], bz - 1.35],
        pitch: -Math.PI / 2,
      }),
    );
  return { pole, cloth: merge(cloth) };
}

/** A loose piece already laid: its plan centre, size and top, for the next piece to rest on. */
interface Laid {
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly top: number;
}

/**
 * A rubble heap: `n` broken blocks round `centre` within `spread`, stacked the way a heap
 * settles — the first third bedded into the floor, every later block resting on one already laid
 * (offset by under a third of its size, bedded a third of its height into it), so every piece
 * is held over a face. Charred beams lie bedded on the floor.
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
    const s = rng.range(0.45, 1.25);
    const k = rng.range(0.6, 1.0);
    const h = s * rng.range(0.4, 0.8);
    const chunk = pebble(
      lod,
      [s, s * rng.range(0.6, 1.1), h],
      [0, 0, 0],
      [BONE_DARK[0] * k, BONE_DARK[1] * k, BONE_DARK[2] * k],
      'stone',
    );
    const base = i < n / 3 || laid.length === 0;
    const on = base ? null : (laid[rng.int(0, laid.length - 1)] ?? null);
    const x = on ? on.x + rng.range(-0.3, 0.3) * on.s : centre[0] + rng.range(-1, 1) * spread[0];
    const y = on ? on.y + rng.range(-0.3, 0.3) * on.s : centre[1] + rng.range(-1, 1) * spread[1];
    const m = place(chunk, {
      at: [x, y, 0],
      yaw: rng.range(0, Math.PI),
      pitch: rng.range(-0.05, 0.05),
      roll: rng.range(-0.05, 0.05),
    });
    const bed = Math.max(0.06, h * 0.33);
    // A heap never grows past its height budget: stop stacking once the top is reached.
    const want = on && on.top - floor < spread[2] ? on.top - bed : floor - 0.04;
    const done = settle(m, want);
    const b = boundsOf(done);
    laid.push({ x, y, s, top: b.max[2] });
    out.push(done);
  }
  if (lod < 2)
    for (let i = 0; i < 3; i++) {
      const beam = box({
        size: [rng.range(2.5, 4), 0.24, 0.24],
        at: [0, 0, -0.12],
        color: CHAR,
        strip: 'wood',
      });
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
  return merge(out);
}

/** Fallen team roof slabs lying bedded in the rubble (rubble). */
export function fallenSlabs(lod: Lod, rng: Rng, floor: number): Mesh {
  const out: Mesh[] = [];
  for (let i = 0; i < (lod === 2 ? 2 : 4); i++) {
    const slab = box({
      size: [rng.range(1.6, 2.4), rng.range(2.4, 3.6), 0.22],
      at: [0, 0, -0.11],
      color: TEAM,
      strip: 'slate',
    });
    const at: Vec3 = [rng.range(-3, 3), rng.range(-4.5, 4.5), 0];
    out.push(
      settle(
        place(slab, { at, yaw: rng.range(0, Math.PI), roll: rng.range(0.03, 0.07) }),
        floor - 0.06,
      ),
    );
  }
  return merge(out);
}

/** Soot and scorch pass helper colour. */
export const SCORCH = SOOT;
/** The wall's outer face distance from the hall centre along X / Y. */
export const FACE = { x: HALF_X + WALL_T / 2, y: HALF_Y + WALL_T / 2, z: PLINTH } as const;
