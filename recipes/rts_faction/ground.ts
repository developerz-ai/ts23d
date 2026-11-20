// The faction scene's own ground and dressing (everything that is not a roster asset):
//  - `forecourt`: the salt flat at true texture scale (half-metre bands of a pale, pitted crust:
//    the greyscale `concrete` strip under the salt colour, since `sand` is dune-yellow and
//    ripples; each band is shifted along U so no row repeats its neighbour), trodden darker at the
//    gate, the muster
//    point and round the tank park; a gravel road from the gate out through the wall, a gravel
//    hardstand, two track ruts from the hardstand back to the road, an oil stain under the tank;
//  - `perimeter`: a low wall of dressed salt blocks with capstones along two edges, open where the
//    road leaves, a sandbag post either side of that gap;
//  - `stores`: fuel drums and crates stacked by the park (parts kit).
// All static, all on the trim sheet: one draw with the scene's static body.

import {
  type BuildContext,
  box,
  cylinder,
  dmath,
  hex,
  type Mesh,
  merge,
  place,
  planar,
  tiled,
  type Vec2,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { smooth, tint, unitNoise } from '../_lib/finish/field.ts';
import { pebble } from '../_lib/rts/style.ts';
import { barrel, crate } from '../_parts/index.ts';

// Below white on purpose: a salt flat at full albedo clips in the beauty light and hides the wear.
const SALT_FLAT = hex('#aaa497');
/** Trodden, damp salt: what boots and tracks leave. */
const TRODDEN = hex('#4a4236');
/** The standing patches: scuffed salt, and the damp core of each. */
const SCUFF = hex('#7d776b');
const TRODDEN_CORE = hex('#5d574e');
const GRAVEL = hex('#8f8676');
const RUT = hex('#6f6656');
const OIL = hex('#2a2622');
const BLOCK = hex('#cfc4a8');
const CAP = hex('#a99d82');
const SACK = hex('#8f8466');
/** Far-LOD stand-ins for the parts kit's drum (painted steel) and crate (pine). */
const DRUM = hex('#7a2a22');
const CRATE = hex('#e8e0d0');

/** The plate: x −16…14, y −12…13 (the hall stands on its −X half, the forecourt is +X). */
const X0 = -16;
const X1 = 14;
const Y0 = -12;
const Y1 = 13;
/** Road from the gate (+X) through the wall: centre line y = 0. */
const ROAD = { x0: -0.6, x1: X1, half: 1.5 } as const;
/** Tank hardstand centre and half sizes. */
export const PARK = { x: 7.4, y: -6.8, hx: 3.9, hy: 2.3 } as const;
/** The wall's inner line. */
const WALL = { x: X1 - 0.7, y: Y0 + 0.6 } as const;

/** A flat sheet of one strip at true scale: `band` m rows, each phased along U by the rng. */
function sheet(
  ctx: BuildContext,
  key: string,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  z: number,
  strip: 'concrete' | 'gravel',
  color: Vec3,
  cell: number,
): Mesh {
  const rng = ctx.rng.fork(key);
  // Far LODs stretch the strip over wider rows (fewer triangles; the grain is below a pixel).
  const band = ctx.pick([0.5, 1, 2.5]);
  const rows = Math.max(1, Math.round((y1 - y0) / band));
  const h = (y1 - y0) / rows;
  const segments = Math.max(1, Math.round((x1 - x0) / (cell * ctx.pick([1, 3, 5]))));
  return merge(
    Array.from({ length: rows }, (_, j) =>
      tiled({
        origin: [x0, y0 + j * h, z],
        u: [x1 - x0, 0, 0],
        v: [0, h, 0],
        color,
        strip,
        segments,
        uOffset: rng.range(0, 4),
        vMetres: h,
      }),
    ),
  );
}

/** Distance from p to segment a–b in plan. */
function toSegment(p: Vec3, a: Vec2, b: Vec2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.min(
    1,
    Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
  );
  return dmath.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** The tank's way from the hardstand back to the road (centre line, plan). */
const TRACK_WAY: readonly Vec2[] = [
  [PARK.x - 2.2, PARK.y],
  [2.6, PARK.y],
  [1.1, PARK.y + 0.7],
  [0.3, PARK.y + 2.0],
  [0.2, -3.6],
  [0.9, -1.6],
];

/** A ribbon `w` wide along `path` offset `off` to its left, `z` above the ground. */
function ribbon(path: readonly Vec2[], off: number, w: number, z: number, color: Vec3): Mesh {
  const side = (i: number, d: number): Vec3 => {
    const a = path[Math.max(0, i - 1)] as Vec2;
    const b = path[Math.min(path.length - 1, i + 1)] as Vec2;
    const l = dmath.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const p = path[i] as Vec2;
    return [p[0] - ((b[1] - a[1]) / l) * d, p[1] + ((b[0] - a[0]) / l) * d, z];
  };
  const quads: Mesh[] = [];
  for (let i = 0; i + 1 < path.length; i++)
    quads.push(
      planar({
        points: [
          side(i, off - w / 2),
          side(i + 1, off - w / 2),
          side(i + 1, off + w / 2),
          side(i, off + w / 2),
        ],
        color,
        strip: 'soil',
      }),
    );
  return merge(quads);
}

/**
 * A trodden patch as its own skin on the flat: a ragged 14-gon with a darker core, 1.5 and 2.5 mm
 * proud. The vertex-colour wear on the sheet is soft and wide; these are the places boots stand
 * every day (the gate step, the muster point, the Delvers' pitch), and they hold at any distance.
 */
function trodden(ctx: BuildContext, key: string, c: Vec2, rx: number, ry: number): Mesh {
  const rng = ctx.rng.fork(`trodden_${key}`);
  const n = ctx.pick([14, 10, 6]);
  const wobble = Array.from({ length: n }, () => rng.range(0.78, 1.08));
  const ring = (k: number, z: number): Vec3[] =>
    wobble.map((w, i): Vec3 => {
      const a = (i / n) * Math.PI * 2;
      return [c[0] + dmath.cos(a) * rx * w * k, c[1] + dmath.sin(a) * ry * w * k, z];
    });
  return merge([
    planar({ points: ring(1, 0.0015), color: SCUFF, strip: 'concrete' }),
    planar({ points: ring(0.58, 0.0025), color: TRODDEN_CORE, strip: 'concrete' }),
  ]);
}

export function forecourt(ctx: BuildContext): void {
  const big = unitNoise(valueNoise(ctx.rng.fork('flat'), { scale: 3.2, octaves: 3 }));
  const fine = unitNoise(valueNoise(ctx.rng.fork('scuff'), { scale: 0.7, octaves: 2 }));
  // Where the garrison walks and drives: the gate apron, the muster point, round the hardstand,
  // the Delvers' way to the deposit, the tank's way to the road.
  const worn = (p: Vec3): number => {
    const spot = (x: number, y: number, rx: number, ry: number): number =>
      1 - smooth(0.55, 1, dmath.hypot((p[0] - x) / rx, (p[1] - y) / ry));
    const way = Math.min(
      ...TRACK_WAY.slice(1).map((b, i) => toSegment(p, TRACK_WAY[i] as Vec2, b)),
    );
    // Kept tight: a forecourt trodden everywhere reads as a darker floor, not as wear.
    return Math.max(
      spot(1.0, 0, 2.6, 3.0),
      spot(5.6, 0, 1.6, 2.3),
      0.9 * spot(PARK.x, PARK.y, PARK.hx + 0.9, PARK.hy + 0.9),
      spot(5.2, 5.7, 1.5, 1.1),
      0.9 * (1 - smooth(0.9, 1.9, way)),
      0.8 * (1 - smooth(ROAD.half, ROAD.half + 0.7, Math.abs(p[1]))) * (p[0] > ROAD.x0 ? 1 : 0),
    );
  };
  const flat = tint(
    tint(
      sheet(ctx, 'salt', [X0, Y0, X1, Y1], 0, 'concrete', SALT_FLAT, 1),
      hex('#948e81'),
      (p) => 0.7 * smooth(0.35, 0.75, big(p)),
    ),
    TRODDEN,
    (p) => 0.9 * worn(p) * (0.6 + 0.4 * fine(p)),
  );
  ctx.part(
    'ground',
    merge([
      // The slab's sides and underside; the salt sheet is its top face.
      box({
        size: [X1 - X0, Y1 - Y0, 0.1],
        at: [(X0 + X1) / 2, (Y0 + Y1) / 2, -0.1],
        color: SALT_FLAT,
        strip: 'concrete',
        omit: ['top'],
      }),
      flat,
      trodden(ctx, 'gate', [1.6, 3.1], 1.5, 1.2),
      trodden(ctx, 'gate_b', [1.9, -2.6], 1.3, 0.9),
      trodden(ctx, 'delvers', [5.2, 5.7], 1.7, 1.2),
      trodden(ctx, 'stores', [PARK.x - 2.3, PARK.y - PARK.hy - 0.9], 1.9, 1.0),
      trodden(ctx, 'post', [WALL.x - 2.4, 3.6], 1.3, 1.0),
    ]),
  );
  // Gravel road and hardstand, 3 mm proud; darker and rougher than the salt, dustier at the edges.
  const gravel = (key: string, r: readonly [number, number, number, number]): Mesh =>
    tint(sheet(ctx, key, r, 0.003, 'gravel', GRAVEL, 0.6), SALT_FLAT, (p) => {
      const edge = Math.min(p[0] - r[0], r[2] - p[0], p[1] - r[1], r[3] - p[1]);
      return 0.45 * (1 - smooth(0, 0.5, edge)) + 0.2 * fine(p);
    });
  ctx.part('paths', gravel('road', [ROAD.x0, -ROAD.half, ROAD.x1, ROAD.half]));
  const pad = gravel('pad', [
    PARK.x - PARK.hx,
    PARK.y - PARK.hy,
    PARK.x + PARK.hx,
    PARK.y + PARK.hy,
  ]);
  ctx.part(
    'paths_tank',
    merge([
      // Oil and soot under the engine, at the hull's rear.
      tint(
        pad,
        OIL,
        (p) => 0.75 * (1 - smooth(0.25, 1, dmath.hypot(p[0] - PARK.x + 1.6, p[1] - PARK.y) / 1.1)),
      ),
      // Two ruts where it drives in and out: tracks 0.46 m wide at 2.45 m centres.
      ...(ctx.lod < 2
        ? [ribbon(TRACK_WAY, 1.225, 0.46, 0.006, RUT), ribbon(TRACK_WAY, -1.225, 0.46, 0.006, RUT)]
        : []),
    ]),
  );
}

/** A low wall from a to b (plan): dressed blocks 2.4 m long with a darker capstone course. */
function wall(ctx: BuildContext, a: Vec2, b: Vec2): Mesh {
  const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = dmath.atan2(b[1] - a[1], b[0] - a[0]);
  const n = Math.max(1, Math.round(len / 2.4));
  const piece = len / n;
  const out: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const at: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
    // Bevelled blocks at LOD0 only; LOD1 keeps the two courses plain, LOD2 one box.
    const edge = ctx.lod === 0 ? 0 : 2;
    const block =
      ctx.lod === 2
        ? [box({ size: [piece, 0.5, 0.95], color: BLOCK, strip: 'concrete', omit: ['bottom'] })]
        : [
            pebble(edge, [piece - 0.04, 0.46, 0.82], [0, 0, 0], BLOCK, 'concrete'),
            pebble(edge, [piece - 0.01, 0.56, 0.14], [0, 0, 0.81], CAP, 'concrete'),
          ];
    out.push(place(merge(block), { at, yaw }));
  }
  return merge(out);
}

/** A sandbag post: an arc of bags three courses high, open toward the compound. */
function sandbags(ctx: BuildContext, centre: Vec2, facing: number): Mesh {
  if (ctx.lod === 2)
    return place(box({ size: [0.5, 2.6, 0.6], color: SACK, strip: 'canvas', omit: ['bottom'] }), {
      at: [centre[0], centre[1], 0],
      yaw: facing,
    });
  const rng = ctx.rng.fork(`bags_${centre[0]}_${centre[1]}`);
  const out: Mesh[] = [];
  for (let course = 0; course < 3; course++) {
    const count = 6 - course;
    for (let k = 0; k < count; k++) {
      // Running bond: each course sits half a bag along from the one below.
      const t = (k + 0.5 * (course % 2) - (count - 1) / 2 - (course % 2 ? 0.25 : 0)) * 0.52;
      const a = t / 1.9;
      const bag = pebble(
        ctx.lod === 0 ? 0 : 2,
        [0.3, 0.5, 0.19],
        [0, 0, 0],
        rng.jitter(SACK, 0.06),
        'canvas',
      );
      out.push(
        place(bag, {
          at: [1.9 * (dmath.cos(a) - 1), 1.9 * dmath.sin(a), course * 0.18],
          yaw: a + rng.range(-0.06, 0.06),
        }),
      );
    }
  }
  return place(merge(out), { at: [centre[0], centre[1], 0], yaw: facing });
}

export function perimeter(ctx: BuildContext): void {
  const gap = ROAD.half + 0.9;
  ctx.part(
    'perimeter',
    merge([
      wall(ctx, [WALL.x, WALL.y], [WALL.x, -gap]),
      wall(ctx, [WALL.x, gap], [WALL.x, Y1 - 0.6]),
      wall(ctx, [1.2, WALL.y], [WALL.x - 0.5, WALL.y]),
      sandbags(ctx, [WALL.x - 1.5, -gap - 0.9], 0),
      sandbags(ctx, [WALL.x - 1.5, gap + 0.9], 0),
    ]),
  );
}

export function stores(ctx: BuildContext): void {
  // Scene dressing sits one LOD below the parts kit's own (a drum is 3 cm of this 30 m scene);
  // far, a drum is a six-sided post and a crate a box.
  const far = ctx.lod === 2;
  const lod = ctx.lod === 0 ? 1 : 2;
  const drum = far
    ? cylinder({ radius: 0.29, length: 0.88, segments: 6, at: [0, 0, 0.44], color: DRUM })
    : barrel.mesh({ style: 'steel' }, lod);
  const boxOf = (size: Vec3): Mesh =>
    far ? box({ size, color: CRATE, strip: 'pine', omit: ['bottom'] }) : crate.mesh({ size }, lod);
  const big = boxOf([1.0, 0.7, 0.6]);
  const small = boxOf([0.7, 0.5, 0.45]);
  const at = (m: Mesh, x: number, y: number, z = 0, yaw = 0): Mesh =>
    place(m, { at: [x, y, z], yaw });
  // Fuel point behind the hardstand: five drums; ammunition and spares beside it.
  const [fx, fy] = [PARK.x + 2.2, PARK.y - PARK.hy - 1.0];
  const [cx, cy] = [PARK.x - 2.6, PARK.y - PARK.hy - 1.1];
  ctx.part(
    'stores',
    merge([
      at(drum, fx, fy),
      at(drum, fx + 0.63, fy + 0.08),
      at(drum, fx + 0.3, fy - 0.57),
      at(drum, fx + 1.28, fy - 0.1),
      at(drum, fx + 0.95, fy - 0.68),
      at(big, cx, cy, 0, 0.12),
      at(big, cx + 1.15, cy + 0.05, 0, -0.06),
      at(small, cx + 0.5, cy + 0.02, 0.6, 0.3),
      at(small, cx - 0.2, cy + 1.0, 0, 0.8),
    ]),
  );
}
