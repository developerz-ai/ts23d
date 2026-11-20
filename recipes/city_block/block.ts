// The West Village block built from the city kind's plan (`cityPlan`: heights, floors, seeds,
// neighbour-aware wall colours, window slots), with the facades a 19th-century Manhattan block
// actually has: true-scale brick, brownstone or stucco walls per edge, sash windows in frames,
// projecting cornices, shopfronts on the street-facing ground floors, stoops on the row houses,
// fire escapes on the walk-ups, rooftop water tanks and stair bulkheads, patched tar roofs, street
// trees along concrete sidewalks, and grime and soot by exposure. LOD0 carries all of it; LOD1
// keeps walls, windows (decals), cornices, shopfront glazing, fire-escape platforms, tanks and
// trees; LOD2 keeps the massing with the window rows baked into the facades.

import {
  type BuildContext,
  box,
  type CityBuildingPlan,
  cityPlan,
  cityWindows,
  dmath,
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  place,
  prism,
  type Rng,
  ROAD_WIDTH,
  type StripId,
  stripRect,
  tiled,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import type { OsmBuilding, OsmRoad } from '@developerz.ai/ts23d/data';
import { projectStripUV } from '../_lib/terrain/strip-inset.ts';
import { along, distToLine, type Edge, edgesOf } from './edges.ts';
import { fireEscape, IRON_BLACK, sashWindow, shopfront, stoop } from './facade.ts';
import {
  FAR_BAND,
  FAR_BRICK,
  FAR_STONE,
  SIDEWALK,
  SIDEWALK_BAND,
  STREET_ASPHALT,
} from './materials.ts';
import { facadeWear, roofWear, shade, sillStreak, sootRuns, streetWear } from './wear.ts';

export interface BlockStyle {
  readonly walls: readonly Vec3[];
  readonly roof: Vec3;
  readonly trim: Vec3;
  readonly ground: Vec3;
  readonly road: Vec3;
  readonly floorHeight: number;
}

/** Roof coatings besides tar: aluminium roof paint and pale ballast gravel. */
const SILVER_ROOF = hex('#a9aaa6');
const GRAVEL_ROOF = hex('#8c8478');

/** Bands the city kind takes off the top of a body (roof 0.3 m; cornice 0.45 m). */
const ROOF_BAND = 0.3;
const CORNICE = 0.45;
/** Window trims: white, black, Federal green, oxblood. */
const TRIMS: readonly Vec3[] = [
  [0.82, 0.8, 0.75],
  [0.06, 0.06, 0.06],
  [0.07, 0.16, 0.1],
  [0.25, 0.06, 0.05],
];
const CORNICE_PAINT: readonly Vec3[] = [
  [0.7, 0.66, 0.58],
  [0.12, 0.09, 0.07],
  [0.08, 0.12, 0.09],
];

const inPoly = (p: Vec2, ring: readonly Vec2[]): boolean => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] ?? [0, 0];
    const b = ring[j] ?? [0, 0];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
};

const centroid = (ring: readonly Vec2[]): Vec2 => [
  ring.reduce((t, q) => t + q[0], 0) / ring.length,
  ring.reduce((t, q) => t + q[1], 0) / ring.length,
];

/** A square of half-side `r` round `q` lies inside the footprint, 0.4 m clear of its edges. */
function fitsOn(ring: readonly Vec2[], q: Vec2, r: number): boolean {
  return (
    [
      [r, r],
      [-r, r],
      [r, -r],
      [-r, -r],
    ].every(([dx = 0, dy = 0]) => inPoly([q[0] + dx, q[1] + dy], ring)) &&
    edgesOf(ring).every((e) => distToLine(q, [e.a, e.b]) > r + 0.4)
  );
}

/** Top of a rooftop water tank above the building's tagged height, metres. */
export const TANK_RISE = 1.8 + 0.13 + 4.0 - 0.01;

/** Where the building's water tank stands (the taller walk-ups, two in three; the first spot
 *  3.4 m off the stair bulkhead that fits on the roof), or null. */
export function tankAt(p: CityBuildingPlan): Vec2 | null {
  if (p.height <= 14 || p.seed % 3 === 1) return null;
  const c = centroid(p.ring);
  for (const [dx, dy] of [
    [3.4, 0],
    [-3.4, 0],
    [0, 3.4],
    [0, -3.4],
    [2.6, -2.6],
    [-2.6, 2.6],
  ] as const) {
    const q: Vec2 = [c[0] + dx, c[1] + dy];
    if (fitsOn(p.ring, q, 1.7)) return q;
  }
  return null;
}

/** Cornice brackets along an edge: one every ~4.8 m, at least both ends. */
const brackets = (len: number): number => Math.max(2, Math.round(len / 4.8) + 1);

/** Wall strip by colour (the stucco and brownstone colours are not brick): the true-scale strip
 *  for street faces up close, and its 2.7 m-band twin for side and rear walls and LOD1. */
function wallStrip(style: BlockStyle, wall: Vec3): { near: StripId; far: StripId } {
  const k = style.walls.indexOf(wall);
  if (k === 5) return { near: 'concrete', far: 'concrete' };
  return k === 3 ? { near: 'stone', far: FAR_STONE } : { near: 'brick', far: FAR_BRICK };
}

/** Clip a polygon to the half-plane f(p) ≤ 0 (Sutherland–Hodgman). */
function clip(poly: readonly Vec2[], f: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] ?? [0, 0];
    const b = poly[(i + 1) % poly.length] ?? a;
    const [fa, fb] = [f(a), f(b)];
    if (fa <= 0) out.push(a);
    if (fa <= 0 !== fb <= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

interface Site {
  readonly plans: readonly CityBuildingPlan[];
  readonly extent: readonly [number, number, number, number];
  readonly roads: readonly OsmRoad[];
}

/** Granite kerb, stained by the gutter, and road paint (linear RGB): worn, greyed lane paint. */
const KERB = hex('#8a867e');
const PAINT: Vec3 = [0.6, 0.59, 0.55];
/** 0..1 hash of a dash's place on the street (no draws: the plan's rng stays put). */
const dashHash = (x: number, y: number): number => {
  const v = dmath.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
/** Paint worn by traffic: each dash its own fade toward the asphalt, one in five gone. */
const fadedPaint = (x: number, y: number): Vec3 | null => {
  const h = dashHash(x, y);
  if (h < 0.2) return null;
  const k = 0.55 + 0.45 * h;
  return [PAINT[0] * k, PAINT[1] * k, PAINT[2] * k];
};

/** The t-interval of a→b (metres from a) inside the rectangle shrunk by `pad`, or null. */
function inside(a: Vec2, b: Vec2, ext: Site['extent'], pad: number): [number, number] | null {
  const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
  let [t0, t1] = [0, len];
  for (const k of [0, 1] as const) {
    const d = ((b[k] ?? 0) - (a[k] ?? 0)) / len;
    const [lo, hi] = [(ext[k] ?? 0) + pad, (ext[k + 2] ?? 0) - pad];
    if (Math.abs(d) < 1e-9) {
      if ((a[k] ?? 0) < lo || (a[k] ?? 0) > hi) return null;
      continue;
    }
    const [s0, s1] = [(lo - (a[k] ?? 0)) / d, (hi - (a[k] ?? 0)) / d];
    t0 = Math.max(t0, Math.min(s0, s1));
    t1 = Math.min(t1, Math.max(s0, s1));
  }
  return t1 - t0 > 0.5 ? [t0, t1] : null;
}

type Box = readonly [number, number, number, number];

/** Plan bounds of a polyline. */
function boxOf(line: readonly Vec2[]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of line) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

const grow = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];

/** The smallest plan distance between two boxes (0 when they overlap). */
const boxGap = (a: Box, b: Box): number =>
  dmath.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

/** Runs of a line (offset `off` from a→b) that stay out of every other carriageway. */
function runs(
  a: Vec2,
  b: Vec2,
  span: readonly [number, number],
  off: number,
  clear: (p: Vec2) => boolean,
): [number, number][] {
  const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const out: [number, number][] = [];
  let start = -1;
  for (let t = span[0]; t <= span[1] + 1e-9; t += 0.5) {
    const ok = clear([a[0] + ux * t - uy * off, a[1] + uy * t + ux * off]);
    if (ok && start < 0) start = t;
    if ((!ok || t + 0.5 > span[1]) && start >= 0) {
      if (t - start > 1) out.push([start, t]);
      start = -1;
    }
  }
  return out;
}

/** A flat strip along a→b from t0 to t1, `off` to the left, `w` wide, `h` tall, base at z. */
function runStrip(
  a: Vec2,
  b: Vec2,
  [t0, t1]: readonly [number, number],
  o: { off: number; w: number; h: number; z: number; color: Vec3; strip?: StripId },
): Mesh {
  const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const t = (t0 + t1) / 2;
  return place(
    box({
      size: [t1 - t0, o.w, o.h],
      color: o.color,
      strip: o.strip ?? 'plain',
      omit: ['bottom'],
    }),
    {
      at: [a[0] + ux * t - uy * o.off, a[1] + uy * t + ux * o.off, o.z],
      yaw: dmath.atan2(uy, ux),
    },
  );
}

/**
 * Ground slab (5 ft concrete flags), the asphalt carriageways clipped to it, granite kerbs along
 * both edges (cut at the crossings) and the lane paint: a dashed centre line and solid parking
 * lines 2.4 m in from each kerb (LOD0/1).
 */
function streets(ctx: BuildContext, s: Site, style: BlockStyle): void {
  const [x0, y0, x1, y1] = s.extent;
  ctx.part(
    'ground',
    merge([
      box({
        size: [x1 - x0, y1 - y0, 0.2],
        at: [(x0 + x1) / 2, (y0 + y1) / 2, -0.2],
        color: style.ground,
        strip: 'concrete',
        omit: ['top', 'bottom'],
      }),
      tiled({
        origin: [x0, y0, 0],
        u: [x1 - x0, 0, 0],
        v: [0, y1 - y0, 0],
        color: style.ground,
        strip: ctx.lod === 2 ? 'concrete' : SIDEWALK,
        vMetres: ctx.lod === 2 ? y1 - y0 : SIDEWALK_BAND,
      }),
    ]),
  );
  const roads: Mesh[] = [];
  const marks: Mesh[] = [];
  const carriageways = s.roads
    .filter((o) => ROAD_WIDTH[o.highway])
    .map((o) => ({ road: o, box: boxOf(o.line), keep: (ROAD_WIDTH[o.highway] ?? 0) / 2 + 1 }));
  for (const r of s.roads) {
    const width = ROAD_WIDTH[r.highway];
    if (!width) continue;
    // Clear of every OTHER carriageway (plus a 1 m kerb return): kerbs and paint stop there.
    const others = carriageways.filter((o) => o.road !== r);
    for (let i = 0; i + 1 < r.line.length; i++) {
      const a = r.line[i] ?? [0, 0];
      const b = r.line[i + 1] ?? a;
      const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      // Only carriageways whose box comes within reach of this segment's samples (they lie in its
      // box grown by the kerb offset and a sample step) can stop a run: the rest are clear by box.
      const reach = grow(boxOf([a, b]), width / 2 + 0.6);
      const near = others.filter((o) => boxGap(o.box, reach) <= o.keep);
      const clear = (p: Vec2): boolean => near.every((o) => distToLine(p, o.road.line) > o.keep);
      const [nx, ny] = [(-(b[1] - a[1]) / len) * (width / 2), ((b[0] - a[0]) / len) * (width / 2)];
      let poly: Vec2[] = [
        [a[0] - nx, a[1] - ny],
        [b[0] - nx, b[1] - ny],
        [b[0] + nx, b[1] + ny],
        [a[0] + nx, a[1] + ny],
      ];
      for (const f of [
        (p: Vec2) => x0 - p[0],
        (p: Vec2) => p[0] - x1,
        (p: Vec2) => y0 - p[1],
        (p: Vec2) => p[1] - y1,
      ])
        poly = clip(poly, f);
      if (poly.length >= 3)
        roads.push(
          // Planar UVs at true scale (V mirrored every 4 m band): the prism squeezed the whole
          // carriageway onto one band, smearing the oil blots and patches into streaks.
          projectStripUV(
            prism({
              profile: poly,
              depth: 0.04,
              centred: false,
              color: style.road,
              strip: STREET_ASPHALT,
            }),
            STREET_ASPHALT,
            4,
          ),
        );
      if (ctx.lod === 2) continue;
      for (const side of [-1, 1]) {
        const off = side * (width / 2 + 0.09);
        const span = inside(a, b, s.extent, 0.3);
        if (!span) continue;
        for (const run of runs(a, b, span, off, clear)) {
          marks.push(
            runStrip(a, b, run, { off, w: 0.18, h: 0.12, z: 0, color: KERB, strip: 'stone' }),
          );
          if (ctx.lod === 0 && width >= 9)
            marks.push(
              runStrip(a, b, run, {
                off: side * (width / 2 - 2.4),
                w: 0.12,
                h: 0.004,
                z: 0.039,
                color: PAINT,
              }),
            );
        }
      }
      const span = inside(a, b, s.extent, 0.5);
      if (!span) continue;
      for (const [r0, r1] of runs(a, b, span, 0, clear))
        for (let t = r0; t + 3 <= r1; t += 9) {
          const color = fadedPaint(
            a[0] + (b[0] - a[0]) * (t / len),
            a[1] + (b[1] - a[1]) * (t / len),
          );
          if (color)
            marks.push(runStrip(a, b, [t, t + 3], { off: 0, w: 0.12, h: 0.004, z: 0.039, color }));
        }
    }
  }
  if (roads.length) ctx.part('streets', merge([...roads, ...marks]));
}

/**
 * London planes and honey locusts on the sidewalks, 8 m apart, clear of every facade: a 3.2 m
 * trunk under an irregular crown 8–11 m tall overall (a main dome and a seeded side lobe; far, one
 * cone), its radius held a little inside the clearance to the nearest wall.
 */
function trees(ctx: BuildContext, s: Site): void {
  const rng = ctx.rng.fork('trees');
  const lod = ctx.lod;
  const seg = ctx.pick([7, 4, 3]);
  // A street plane's bole: ~0.5 m across at the root flare, 0.36 m at the crown.
  const trunk = lathe({
    profile: [
      [0.27, 0],
      [0.18, 3.4],
      [0, 3.4],
    ],
    segments: ctx.pick([5, 4, 3]),
    color: [0.32, 0.27, 0.22],
    strip: 'bark_oak',
  });
  const crown = (r: number, h: number, z: number, green: Vec3): Mesh =>
    lathe({
      profile:
        lod > 0
          ? [
              [0, z],
              [r, z + h * 0.45],
              [0, z + h],
            ]
          : [
              [0, z - 0.1],
              [r * 0.7, z + 0.3],
              [r, z + h * 0.4],
              [r * 0.85, z + h * 0.75],
              [0, z + h],
            ],
      segments: seg,
      color: green,
      // Smooth (no facet creases) and mapped planar per face onto the isotropic `moss` strip at
      // true scale: a clumped leaf mass. `grass` on the lathe's around-the-axis U drew blade
      // streaks like wood grain.
      creaseDeg: 89,
      strip: 'moss',
    });
  // Magnified 12× (square texels on 2–3 m faces, a 3 m band): the strip's moss cushions become
  // leaf clumps ~0.3 m across.
  const leafy = (m: Mesh): Mesh =>
    projectStripUV(m, 'moss', (stripRect('moss').metres / 64) * 12, 12);
  const out: Mesh[] = [];
  const [x0, y0, x1, y1] = s.extent;
  const rings = s.plans.map((p) => p.ring);
  // Candidates: both kerbs of every mapped street, and the slab's rim (the sidewalks of the
  // streets that run just outside the pinned bbox), every 8 m along a kerb, 13 m along the rim.
  const spots: Vec2[] = [];
  for (const r of s.roads) {
    const width = ROAD_WIDTH[r.highway];
    if (!width) continue;
    for (let i = 0; i + 1 < r.line.length; i++) {
      const a = r.line[i] ?? [0, 0];
      const b = r.line[i + 1] ?? a;
      const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
      const [ux, uy] = [(b[0] - a[0]) / (len || 1), (b[1] - a[1]) / (len || 1)];
      for (let t = 4; t < len; t += 8)
        for (const side of [-1, 1]) {
          const off = side * (width / 2 + 1.1);
          spots.push([a[0] + ux * t - uy * off, a[1] + uy * t + ux * off]);
        }
    }
  }
  for (let t = x0 + 6; t < x1 - 4; t += 13) spots.push([t, y0 + 1.6], [t, y1 - 1.6]);
  for (let t = y0 + 6; t < y1 - 4; t += 13) spots.push([x0 + 1.6, t], [x1 - 1.6, t]);
  const closed = rings.map((g) => (g[0] ? [...g, g[0]] : g));
  /** Nearest wall to p, or any distance under `stop` as soon as one is found (p is skipped then). */
  const wallFrom = (p: Vec2, stop: number): number => {
    let best = Infinity;
    for (const g of closed) {
      best = Math.min(best, distToLine(p, g));
      if (best < stop) break;
    }
    return best;
  };
  for (const p of spots) {
    if (p[0] < x0 + 1.5 || p[0] > x1 - 1.5 || p[1] < y0 + 1.5 || p[1] > y1 - 1.5) continue;
    if (rings.some((g) => inPoly(p, g))) continue;
    const wall = wallFrom(p, 2.6);
    if (wall < 2.6) continue;
    if (s.roads.some((o) => distToLine(p, o.line) < (ROAD_WIDTH[o.highway] ?? 0) / 2 + 0.6))
      continue;
    // Inside the clearance to the nearest wall, and (with its side lobe) inside the slab.
    const rim = Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]);
    const rr = Math.min(rng.range(2.2, 3.2), wall - 0.6, (rim - 0.1) / 1.2);
    const hh = rng.range(5, 7.5);
    const g = rng.range(0.8, 1.2);
    const green: Vec3 = [0.2 * g, 0.3 * g, 0.12 * g];
    const lobe = rng.range(0, 6.28);
    const yaw = rng.range(0, 6.28);
    // Every LOD draws the lobe's dice, so the next tree is the same tree at every LOD.
    const lobed = rng.next() < 0.6;
    const d = rr * rng.range(0.3, 0.5);
    const parts = [trunk, leafy(crown(rr, hh, 3.0, green))];
    if (lod === 0 && lobed) {
      // Side lobe: a smaller dome pushed out and up, so no two crowns share an outline.
      parts.push(
        place(leafy(crown(rr * 0.65, hh * 0.6, 3.0 + hh * 0.3, green)), {
          at: [dmath.cos(lobe) * d, dmath.sin(lobe) * d, 0],
        }),
      );
    }
    out.push(place(merge(parts), { at: [p[0], p[1], 0], yaw }));
  }
  if (out.length) ctx.part('trees', merge(out));
}

/**
 * Does this edge face a street? Its outward probe (3 m out) is in the open and either near a
 * mapped carriageway or near the slab's edge (the block's other streets run just outside the
 * pinned bbox); rear-yard faces are deep inside the block.
 */
const onStreet = (e: Edge, s: Site): boolean => {
  const q = along(e, e.len / 2, 3);
  if (s.plans.some((p) => inPoly(q, p.ring))) return false;
  const [x0, y0, x1, y1] = s.extent;
  const rim = Math.min(q[0] - x0, x1 - q[0], q[1] - y0, y1 - q[1]);
  return (
    rim < 9 || s.roads.some((r) => distToLine(q, r.line) < (ROAD_WIDTH[r.highway] ?? 0) / 2 + 5)
  );
};

/** Footprint pulled 3 cm toward its centroid: the hidden cap under the roof band. */
function shrink(ring: readonly Vec2[], d: number): Vec2[] {
  const c: Vec2 = [
    ring.reduce((s, p) => s + p[0], 0) / ring.length,
    ring.reduce((s, p) => s + p[1], 0) / ring.length,
  ];
  return ring.map((p) => {
    const l = dmath.hypot(p[0] - c[0], p[1] - c[1]) || 1;
    return [p[0] - ((p[0] - c[0]) / l) * d, p[1] - ((p[1] - c[1]) / l) * d];
  });
}

/** The triangles of `m` whose normal faces up (vertices compacted): a prism's top cap alone. */
function topFaces(m: Mesh): Mesh {
  const ids: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3)
    if ((m.normals[(m.indices[t] ?? 0) * 3 + 2] ?? 0) > 0.5)
      ids.push(m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0);
  const map = new Map<number, number>();
  for (const i of ids) if (!map.has(i)) map.set(i, map.size);
  const pick = (a: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(map.size * k);
    for (const [from, to] of map) out.set(a.subarray(from * k, from * k + k), to * k);
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices: Uint32Array.from(ids, (i) => map.get(i) ?? 0),
  };
}

/** One building: walls, cap, roof band, cornices, windows and its facade pieces. */
function building(
  ctx: BuildContext,
  p: CityBuildingPlan,
  s: Site,
  style: BlockStyle,
  rng: Rng,
): void {
  const lod: Lod = ctx.lod;
  const name = `b${p.id}`;
  const wallH = p.height - ROOF_BAND;
  const top = p.base + wallH;
  const strip = wallStrip(style, p.wall);
  const age = rng.range(0.2, 1);
  const trim = TRIMS[p.seed % TRIMS.length] ?? TRIMS[0] ?? [1, 1, 1];
  const edges = edgesOf(p.ring);
  const street = new Set(
    edges.filter((e) => !p.party[e.i] && e.len > 2 && onStreet(e, s)).map((e) => e.i),
  );
  const tall = p.floors >= 4;
  const shops = new Set<number>();
  const stoops = new Map<number, number>();
  const escapes = new Map<number, number>();
  for (const e of edges) {
    if (!street.has(e.i)) continue;
    const r = rng.next();
    if (r < (tall ? 0.85 : 0.55) && e.len > 4) shops.add(e.i);
    else if (!tall && p.floors >= 3 && e.len > 4.5) stoops.set(e.i, rng.range(1.6, e.len - 1.6));
    if (tall && !shops.has(e.i) && e.len > 6 && rng.next() < 0.7) escapes.set(e.i, e.len / 2);
    else if (tall && shops.has(e.i) && e.len > 9 && rng.next() < 0.5) escapes.set(e.i, e.len * 0.6);
  }

  // ---- walls: every edge at true scale (brick 75 mm courses), one face per edge.
  const walls: Mesh[] = [];
  // Faces of one band (every face far; side and rear walls at LOD1) have vertex rows only at
  // their foot and top: they take the wall's mean wear, not the black of its two ends.
  const coarse: Mesh[] = [];
  const sootRng = rng.fork('soot');
  for (const e of edges) {
    const near = lod === 0 && street.has(e.i);
    const one = lod === 2 || (lod === 1 && !street.has(e.i));
    (one ? coarse : walls).push(
      tiled({
        origin: [e.a[0], e.a[1], 0],
        u: [e.b[0] - e.a[0], e.b[1] - e.a[1], 0],
        v: [0, 0, wallH],
        color: p.wall,
        // Street faces at true scale up close, on the same bond painted over 2.7 m bands at LOD1;
        // side and rear walls in 2.7 m bands at LOD0, one band from LOD1 on; far, every face one
        // band (the same mean colour, two triangles a face).
        strip: near ? strip.near : strip.far,
        ...(one
          ? { vMetres: wallH + 0.01 }
          : near
            ? {}
            : // A 1.1 m first band, so the street grime has a vertex row to end at.
              { vMetres: FAR_BAND, vOffset: FAR_BAND - 1.1 }),
      }),
    );
    // Soot runs under the cornice on the street faces (LOD0/1; far, the soot band alone).
    if (lod < 2 && street.has(e.i) && wallH > 6)
      walls.push(
        ...sootRuns(sootRng, e, {
          top: wallH - CORNICE,
          wall: p.wall,
          strip: near ? strip.near : strip.far,
        }),
      );
  }
  // The hidden cap under the roof band: the footprint read from above (and its silhouette),
  // its top face only, flush with the band's underside. Far, the roof band alone carries both.
  if (lod < 2)
    walls.push(
      place(
        topFaces(
          prism({
            profile: shrink(p.ring, 0.03),
            depth: 0.02,
            centred: false,
            color: p.wall,
            strip: 'plain',
          }),
        ),
        { at: [0, 0, wallH - 0.02] },
      ),
    );
  const wear = { base: 0, top: wallH, age };
  const wallRng = rng.fork('wall');
  ctx.part(
    name,
    merge([
      ...(walls.length ? [shade(merge(walls), facadeWear(wallRng, wear))] : []),
      ...(coarse.length ? [shade(merge(coarse), facadeWear(wallRng, { ...wear, far: true }))] : []),
    ]),
    { at: [0, 0, p.base] },
  );

  // ---- roof band with patches, bulkhead and water tank. Each roof has its own finish, as on
  // the aerials: black tar, a silver aluminium coating, or pale ballast gravel (one tar tone for
  // every roof read as a single dark slab from above).
  const roofTone = rng.range(0.8, 1.2);
  const finish = rng.next();
  const base: Vec3 = finish < 0.45 ? style.roof : finish < 0.8 ? SILVER_ROOF : GRAVEL_ROOF;
  const roofC: Vec3 = [base[0] * roofTone, base[1] * roofTone, base[2] * roofTone];
  const roof: Mesh[] = [
    prism({ profile: p.ring, depth: ROOF_BAND, centred: false, color: roofC, strip: 'concrete' }),
  ];
  const c: Vec2 = [
    p.ring.reduce((t, q) => t + q[0], 0) / p.ring.length,
    p.ring.reduce((t, q) => t + q[1], 0) / p.ring.length,
  ];
  const fits = (q: Vec2, r: number): boolean =>
    [
      [r, r],
      [-r, r],
      [r, -r],
      [-r, -r],
    ].every(([dx = 0, dy = 0]) => inPoly([q[0] + dx, q[1] + dy], p.ring)) &&
    edges.every((e) => distToLine(q, [e.a, e.b]) > r + 0.4);
  // Patches (LOD0/1) and vents (LOD0) draw from their own streams, so later draws (cornice
  // depth) match on every LOD. A patch is a fresh sheet of membrane: blacker new tar on a grey
  // roof, a fresh silver coat on a dark one, each a few metres across, so no roof is one colour.
  const patchRng = rng.fork('roof_patches');
  const [rx0, ry0, rx1, ry1] = [
    Math.min(...p.ring.map((q) => q[0])),
    Math.min(...p.ring.map((q) => q[1])),
    Math.max(...p.ring.map((q) => q[0])),
    Math.max(...p.ring.map((q) => q[1])),
  ];
  const spot = (r: Rng): Vec2 => [r.range(rx0, rx1), r.range(ry0, ry1)];
  if (lod < 2)
    for (let k = 0; k < 9; k++) {
      const q = spot(patchRng);
      const [w, d] = [patchRng.range(1.5, 5), patchRng.range(1.5, 5)];
      const g = patchRng.next() < 0.5 ? patchRng.range(0.4, 0.65) : patchRng.range(1.35, 1.8);
      if (!fits(q, Math.max(w, d) / 2)) continue;
      roof.push(
        box({
          size: [w, d, 0.02],
          at: [q[0], q[1], ROOF_BAND - 0.008],
          color: [
            Math.min(0.8, roofC[0] * g),
            Math.min(0.8, roofC[1] * g),
            Math.min(0.8, roofC[2] * g),
          ],
          strip: 'concrete',
          omit: ['bottom'],
        }),
      );
    }
  // Vents stand on the roof, above its tagged height: they go with the rooftop structures.
  const vents: Mesh[] = [];
  const ventRng = rng.fork('roof_vents');
  if (lod === 0)
    for (let k = 0; k < 4; k++) {
      const q = spot(ventRng);
      const h = ventRng.range(0.4, 0.9);
      if (!fits(q, 0.5)) continue;
      vents.push(
        box({
          size: [0.5, 0.5, h],
          at: [q[0], q[1], ROOF_BAND - 0.01],
          color: [0.55, 0.55, 0.53],
          strip: 'aluminium',
          omit: ['bottom'],
        }),
      );
    }
  // Rooftop structures stand on the roof but are not the tagged height: their own part.
  const rooftop: Mesh[] = [...vents];
  if (p.floors >= 3 && lod < 2 && fits(c, 1.6))
    rooftop.push(
      box({
        size: [2.4, 2.8, 2.5],
        at: [c[0], c[1], ROOF_BAND - 0.01],
        color: p.wall,
        strip: strip.far,
      }),
    );
  {
    const q = tankAt(p);
    if (q) {
      const legs = 1.8;
      const tank: Mesh[] = [];
      if (lod < 2)
        for (const [dx, dy] of [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ] as const)
          tank.push(
            box({
              size: [0.14, 0.14, legs],
              at: [q[0] + dx * 1.0, q[1] + dy * 1.0, ROOF_BAND - 0.01],
              color: IRON_BLACK,
              strip: 'steel_painted',
              omit: ['bottom'],
            }),
          );
      // Far: one block for the stand and its deck, the tank bearing on its top.
      else
        tank.push(
          box({
            size: [1.6, 1.6, legs + 0.15],
            at: [q[0], q[1], ROOF_BAND - 0.01],
            color: IRON_BLACK,
          }),
        );
      if (lod < 2)
        tank.push(
          box({
            size: [2.3, 2.3, 0.15],
            at: [q[0], q[1], ROOF_BAND + legs - 0.01],
            color: IRON_BLACK,
            strip: 'steel_painted',
          }),
        );
      const z0 = ROOF_BAND + legs + 0.13;
      tank.push(
        place(
          lathe({
            profile: [
              [0, 0],
              [1.45, 0],
              [1.5, 3.0],
              [1.62, 3.0],
              [0, 4.0],
            ],
            segments: ctx.pick([8, 6, 6]),
            color: [0.42, 0.36, 0.3],
            strip: 'wood_weathered',
          }),
          { at: [q[0], q[1], z0] },
        ),
      );
      rooftop.push(...tank);
    }
  }
  ctx.part(`${name}_roof`, shade(merge(roof), roofWear(rng.fork('roof'))), { at: [0, 0, top] });
  if (rooftop.length) ctx.part(`rooftop_${p.id}`, merge(rooftop), { at: [0, 0, top] });

  // ---- cornices on the street edges (all LODs but the far one).
  if (lod < 2) {
    const depth = rng.range(0.45, 0.8);
    const paint = CORNICE_PAINT[p.seed % CORNICE_PAINT.length] ?? trim;
    const corn: Mesh[] = [];
    for (const e of edges) {
      if (!street.has(e.i)) continue;
      corn.push(
        place(
          box({
            size: [depth + 0.05, e.len, CORNICE],
            at: [depth / 2 - 0.025, e.len / 2, -CORNICE],
            color: paint,
            strip: 'wood_painted',
          }),
          { at: [e.a[0], e.a[1], 0], yaw: e.yaw },
        ),
      );
      if (lod === 0)
        // Frieze under the cornice and its brackets every ~4.8 m.
        corn.push(
          place(
            merge([
              box({
                size: [0.1, e.len, 0.35],
                at: [0.025, e.len / 2, -CORNICE - 0.35],
                color: paint,
                strip: 'wood_painted',
                omit: ['back', 'top'],
              }),
              ...Array.from({ length: brackets(e.len) }, (_, k) =>
                box({
                  size: [depth - 0.05, 0.12, 0.3],
                  at: [
                    (depth - 0.05) / 2,
                    0.15 + ((e.len - 0.3) * k) / (brackets(e.len) - 1),
                    -CORNICE - 0.3,
                  ],
                  color: paint,
                  strip: 'wood_painted',
                  // Back in the frieze, top under the cornice: never seen.
                  omit: ['back', 'top'],
                }),
              ),
            ]),
            { at: [e.a[0], e.a[1], 0], yaw: e.yaw },
          ),
        );
    }
    if (corn.length) ctx.part(`${name}_cornice`, merge(corn), { at: [0, 0, top] });
  }

  // ---- windows: the plan's slots, less those behind shopfronts and stoop doors. Framed sashes
  // at LOD0 (stone sills and lintels on the street faces), decals at LOD1 on the street faces
  // and the rows as dark bands on the others. Far, every open face keeps its rows as bands.
  const fh = p.floorHeight;
  const wins: Mesh[] = [];
  const streakRng = rng.fork('streaks');
  /** One face's window rows as dark glass bands, one quad 1 cm proud (the grid still reads).
   *  Only past LOD0: up close every face has its framed sashes (see `banded`). */
  const rows = (e: Edge): void => {
    for (let f = 0; f < p.floors; f++) {
      const z = f * fh + fh * 0.26;
      const h = Math.min(fh * 0.56, wallH - CORNICE - z);
      if (h <= 0.2) continue;
      const o = along(e, 0.4, 0.01);
      wins.push(
        tiled({
          origin: [o[0], o[1], z],
          u: [e.u[0] * (e.len - 0.8), e.u[1] * (e.len - 0.8), 0],
          v: [0, 0, h],
          color: [0.05, 0.06, 0.07],
          strip: 'glass',
          vMetres: 100,
        }),
      );
    }
  };
  const banded = (e: Edge): boolean =>
    !p.party[e.i] && e.len >= 3 && (lod === 2 || (lod === 1 && !street.has(e.i)));
  for (const e of edges) if (banded(e)) rows(e);
  if (lod < 2) {
    for (const w of cityWindows(p)) {
      const e = edges.find(
        (g) => Math.abs(g.yaw - w.yaw) < 1e-9 && distToLine([w.at[0], w.at[1]], [g.a, g.b]) < 0.01,
      );
      if (e && banded(e)) continue;
      const floor0 = w.at[2] < p.base + fh;
      if (e && floor0 && shops.has(e.i)) continue;
      if (e && floor0 && stoops.has(e.i)) {
        const t = (w.at[0] - e.a[0]) * e.u[0] + (w.at[1] - e.a[1]) * e.u[1];
        if (Math.abs(t - (stoops.get(e.i) ?? 0)) < 1.5) continue;
      }
      const ww = w.scale[1];
      const onFront = !!e && street.has(e.i);
      const sill = lod === 0 && onFront && !floor0;
      // Every upper window up close streaks the wall under it (side and rear faces too: the
      // hero corner looks at walls on the slab's rim, which no mapped street runs past).
      const streak = lod === 0 && !floor0;
      // Side and rear walls take the flat sash decal (as at LOD1): their triangles pay for the
      // sill streaks on the street faces, where the wear reads.
      const at = { at: [w.at[0], w.at[1], w.at[2] - p.base] as Vec3, yaw: w.yaw };
      wins.push(place(sashWindow(ww, w.scale[2], trim, lod, sill, !onFront), at));
      if (streak) {
        // Each sill its own stain: a quarter stay clean (a sound sill, a recent wash), the rest
        // vary in width, length, darkness and offset; every window draws all five dice.
        const clean = streakRng.next() < 0.25;
        const sw = ww * streakRng.range(0.35, 0.9);
        const sl = streakRng.range(0.6, 3.2);
        const strength = streakRng.range(0.6, 0.97);
        const dy = streakRng.range(-0.15, 0.15) * ww;
        if (!clean)
          wins.push(
            place(
              place(
                sillStreak(sw, sl, {
                  wall: p.wall,
                  strip: onFront ? strip.near : strip.far,
                  strength,
                }),
                { at: [-0.004, dy, -0.06] },
              ),
              at,
            ),
          );
      }
    }
  }
  if (wins.length) ctx.part(`${name}_windows`, merge(wins), { at: [0, 0, p.base] });

  // ---- street-level and fire-escape pieces.
  const extras: Mesh[] = [];
  for (const e of edges) {
    const at = { at: [e.a[0], e.a[1], 0] as Vec3, yaw: e.yaw };
    if (shops.has(e.i) && lod < 2)
      extras.push(
        place(place(shopfront(e.len - 0.6, fh, p.seed + e.i, lod), { at: [0, 0.3, 0] }), at),
      );
    const sy = stoops.get(e.i);
    if (sy !== undefined && lod === 0)
      extras.push(place(place(stoop(trim, lod), { at: [0, sy, 0] }), at));
    // Fire escapes are LOD0 only: their rails are sub-pixel at LOD1 distance.
    const fy = escapes.get(e.i);
    if (fy !== undefined && lod === 0)
      extras.push(
        place(
          place(fireEscape(Math.min(3.2, e.len - 1), p.floors, fh, lod), { at: [0, fy, 0] }),
          at,
        ),
      );
  }
  if (extras.length)
    ctx.part(`${name}_street`, shade(merge(extras), streetWear(rng.fork('street'), 0)), {
      at: [0, 0, p.base],
    });
}

export function buildBlock(
  ctx: BuildContext,
  buildings: readonly OsmBuilding[],
  roads: readonly OsmRoad[],
  style: BlockStyle,
): void {
  const plans = cityPlan(buildings, { walls: style.walls, floorHeight: style.floorHeight });
  const pts = plans.flatMap((p) => p.ring);
  const extent = [
    Math.min(...pts.map((p) => p[0])) - 4,
    Math.min(...pts.map((p) => p[1])) - 4,
    Math.max(...pts.map((p) => p[0])) + 4,
    Math.max(...pts.map((p) => p[1])) + 4,
  ] as const;
  const site: Site = { plans, extent, roads };
  streets(ctx, site, style);
  trees(ctx, site);
  for (const p of plans) building(ctx, p, site, style, ctx.rng.fork(`b${p.id}`));
}
