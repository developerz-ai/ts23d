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
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  place,
  prism,
  type Rng,
  ROAD_WIDTH,
  tiled,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import type { OsmBuilding, OsmRoad } from '@developerz.ai/ts23d/data';
import { along, distToLine, type Edge, edgesOf } from './edges.ts';
import { fireEscape, IRON_BLACK, sashWindow, shopfront, stoop } from './facade.ts';
import { facadeWear, roofWear, shade } from './wear.ts';

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

/** Wall strip by colour: the stucco and brownstone colours are not brick. */
function wallStrip(style: BlockStyle, wall: Vec3): 'brick' | 'stone' | 'concrete' {
  const k = style.walls.indexOf(wall);
  return k === 5 ? 'concrete' : k === 3 ? 'stone' : 'brick';
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

/** Ground slab (concrete sidewalk flags) and the asphalt carriageways clipped to it. */
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
        strip: 'concrete',
        ...(ctx.lod === 2 ? { vMetres: y1 - y0 } : {}),
      }),
    ]),
  );
  const roads: Mesh[] = [];
  for (const r of s.roads) {
    const width = ROAD_WIDTH[r.highway];
    if (!width) continue;
    for (let i = 0; i + 1 < r.line.length; i++) {
      const a = r.line[i] ?? [0, 0];
      const b = r.line[i + 1] ?? a;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
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
          prism({
            profile: poly,
            depth: 0.04,
            centred: false,
            color: style.road,
            strip: 'asphalt',
          }),
        );
    }
  }
  if (roads.length) ctx.part('streets', merge(roads));
}

/** London planes and honey locusts on the sidewalks, 8 m apart, clear of every facade. */
function trees(ctx: BuildContext, s: Site): void {
  const rng = ctx.rng.fork('trees');
  const lod = ctx.lod;
  const seg = ctx.pick([5, 5, 3]);
  const trunk = lathe({
    profile: [
      [0.14, 0],
      [0.09, 2.3],
      [0, 2.3],
    ],
    segments: lod === 0 ? 5 : 4,
    color: [0.32, 0.27, 0.22],
    strip: 'bark_oak',
  });
  const crown = (r: number, h: number): Mesh =>
    lathe({
      profile:
        lod === 2
          ? [
              [0, 2.0],
              [r, 2.0 + h * 0.45],
              [0, 2.0 + h],
            ]
          : [
              [0, 1.9],
              [r * 0.7, 2.2],
              [r, 2.0 + h * 0.4],
              [r * 0.85, 2.0 + h * 0.75],
              [0, 2.0 + h],
            ],
      segments: seg,
      color: [0.2, 0.3, 0.12],
      strip: 'grass',
    });
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
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
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
  for (const p of spots) {
    if (p[0] < x0 + 1.5 || p[0] > x1 - 1.5 || p[1] < y0 + 1.5 || p[1] > y1 - 1.5) continue;
    if (rings.some((g) => inPoly(p, g) || distToLine(p, [...g, g[0] ?? p]) < 2.6)) continue;
    if (s.roads.some((o) => distToLine(p, o.line) < (ROAD_WIDTH[o.highway] ?? 0) / 2 + 0.6))
      continue;
    const rr = rng.range(1.4, 2.0);
    const hh = rng.range(3.6, 5.0);
    out.push(
      place(merge([trunk, crown(rr, hh)]), { at: [p[0], p[1], 0], yaw: rng.range(0, 6.28) }),
    );
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
    const l = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
    return [p[0] - ((p[0] - c[0]) / l) * d, p[1] - ((p[1] - c[1]) / l) * d];
  });
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
    if (r < (tall ? 0.6 : 0.35) && e.len > 4) shops.add(e.i);
    else if (!tall && p.floors >= 3 && e.len > 4.5) stoops.set(e.i, rng.range(1.6, e.len - 1.6));
    if (tall && !shops.has(e.i) && e.len > 6 && rng.next() < 0.7) escapes.set(e.i, e.len / 2);
    else if (tall && shops.has(e.i) && e.len > 9 && rng.next() < 0.5) escapes.set(e.i, e.len * 0.6);
  }

  // ---- walls: every edge at true scale (brick 75 mm courses), one face per edge.
  const walls: Mesh[] = [];
  for (const e of edges)
    walls.push(
      tiled({
        origin: [e.a[0], e.a[1], 0],
        u: [e.b[0] - e.a[0], e.b[1] - e.a[1], 0],
        v: [0, 0, wallH],
        color: p.wall,
        strip,
        // Street faces at true scale up close; side and rear walls and LOD1 in coarser bands;
        // far, one band (the same strip and mean colour, two triangles a face).
        ...(lod === 2
          ? { vMetres: wallH + 0.01 }
          : lod === 1
            ? { vMetres: 1.35 }
            : street.has(e.i)
              ? {}
              : { vMetres: 1.8 }),
      }),
    );
  // The hidden cap under the roof band: the footprint read from above (and its silhouette).
  walls.push(
    prism({
      profile: shrink(p.ring, 0.03),
      depth: 0.02,
      centred: false,
      color: p.wall,
      strip: 'plain',
    }),
  );
  const cap = walls.pop();
  if (cap) walls.push(place(cap, { at: [0, 0, wallH - 0.02] }));
  ctx.part(name, shade(merge(walls), facadeWear(rng.fork('wall'), { base: 0, top: wallH, age })), {
    at: [0, 0, p.base],
  });

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
  // Patches are LOD0 only: their own stream, so later draws (cornice depth) match on every LOD.
  const patchRng = rng.fork('roof_patches');
  if (lod === 0)
    for (let k = 0; k < 4; k++) {
      const q: Vec2 = [c[0] + patchRng.range(-4, 4), c[1] + patchRng.range(-4, 4)];
      const [w, d] = [patchRng.range(1.2, 3.5), patchRng.range(1.2, 3.5)];
      if (!fits(q, Math.max(w, d) / 2)) continue;
      const g = patchRng.range(0.55, 1.4);
      roof.push(
        box({
          size: [w, d, 0.02],
          at: [q[0], q[1], ROOF_BAND - 0.008],
          color: [roofC[0] * g, roofC[1] * g, roofC[2] * g],
          strip: 'concrete',
        }),
      );
    }
  // Rooftop structures stand on the roof but are not the tagged height: their own part.
  const rooftop: Mesh[] = [];
  if (p.floors >= 3 && lod < 2 && fits(c, 1.6))
    rooftop.push(
      box({ size: [2.4, 2.8, 2.5], at: [c[0], c[1], ROOF_BAND - 0.01], color: p.wall, strip }),
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
            segments: ctx.pick([10, 8, 6]),
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
    const depth = rng.range(0.3, 0.6);
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
                }),
              ),
            ]),
            { at: [e.a[0], e.a[1], 0], yaw: e.yaw },
          ),
        );
    }
    if (corn.length) ctx.part(`${name}_cornice`, merge(corn), { at: [0, 0, top] });
  }

  // ---- windows: the plan's slots, less those behind shopfronts and stoop doors.
  const fh = p.floorHeight;
  const wins: Mesh[] = [];
  if (lod < 2) {
    for (const w of cityWindows(p)) {
      const e = edges.find(
        (g) => Math.abs(g.yaw - w.yaw) < 1e-9 && distToLine([w.at[0], w.at[1]], [g.a, g.b]) < 0.01,
      );
      const floor0 = w.at[2] < p.base + fh;
      if (e && floor0 && shops.has(e.i)) continue;
      if (e && floor0 && stoops.has(e.i)) {
        const t = (w.at[0] - e.a[0]) * e.u[0] + (w.at[1] - e.a[1]) * e.u[1];
        if (Math.abs(t - (stoops.get(e.i) ?? 0)) < 1.5) continue;
      }
      const ww = w.scale[1];
      // Street windows with sills; rear-yard windows framed but without them.
      const onFront = !!e && street.has(e.i);
      wins.push(
        place(sashWindow(ww, w.scale[2], trim, lod, lod === 0 && onFront && !floor0), {
          at: [w.at[0], w.at[1], w.at[2] - p.base],
          yaw: w.yaw,
        }),
      );
    }
  } else {
    // Far: each street face's window rows as dark bands 1 cm proud (the grid still reads).
    for (const e of edges) {
      if (!street.has(e.i) || e.len < p.bay + 0.6) continue;
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
    const fy = escapes.get(e.i);
    if (fy !== undefined && lod < 2)
      extras.push(
        place(
          place(fireEscape(Math.min(3.2, e.len - 1), p.floors, fh, lod), { at: [0, fy, 0] }),
          at,
        ),
      );
  }
  if (extras.length) ctx.part(`${name}_street`, merge(extras), { at: [0, 0, p.base] });
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
