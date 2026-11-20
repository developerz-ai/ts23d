// A city block from real footprints: each building is its footprint raised to its height (one
// wall face per surveyed edge, so the massing is the survey's polygon, not a box) on the wall
// strip at true scale, a roof band in the roof colour, and windows laid along every street-facing
// edge by a split-grammar line per storey (`pier:~ | {wall | win | wall}* | pier:~`, bay width by
// the building's seed); a slot on a stretch shared with a neighbour gets none. Streets are flat
// ribbons clipped to the ground slab. Windows are one repeated mesh: the block returns their
// transforms so a scene can export them as GPU instances (EXT_mesh_gpu_instancing) while the asset
// merges them per building. LOD policy (city-facade.ts): LOD0 glazed boxes, brick courses and,
// with `trim`, an oversailing cornice, belt course and plinth; LOD1 flat panes, a band a storey
// and a flush cornice; LOD2 massing, roofs and the window rows as dark bands.

import {
  type BuildContext,
  dmath,
  type Mesh,
  merge,
  place,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { box, prism } from '../primitives/index.ts';
import {
  type CityInstance,
  cityGlazing,
  cityLedge,
  cityWalls,
  cityWindow,
  cityWindowBands,
  cityWindows,
} from './city-facade.ts';
import {
  CITY_BANDS,
  type CityBuildingPlan,
  type CityFootprint,
  type CityPlanOptions,
  cityPlan,
} from './city-plan.ts';
import { area2, clipPoly } from './faces.ts';

export { type CityInstance, cityWindow, cityWindows } from './city-facade.ts';

export interface CityStreet {
  readonly highway: string;
  readonly line: readonly Vec2[];
}

export interface CityOptions extends CityPlanOptions {
  readonly prefix?: string;
  readonly roof: Vec3;
  readonly glass: Vec3;
  /**
   * Trim colour: a cornice under the roof line (oversailing at LOD0, flush at LOD1) and, at LOD0,
   * a belt course over the ground floor and a plinth. None of it when absent.
   */
  readonly trim?: Vec3;
  /** Wall material, at true scale along every edge (default `brick`); per building if a function. */
  readonly wallStrip?: StripId | ((p: CityBuildingPlan) => StripId);
  readonly ground: Vec3;
  readonly road: Vec3;
  readonly streets?: readonly CityStreet[];
  /** Ground slab extent [minX, minY, maxX, maxY]; default the footprints' box + 4 m. */
  readonly extent?: readonly [number, number, number, number];
}

export interface CityInfo {
  readonly plans: readonly CityBuildingPlan[];
  /** Window transforms of a unit window (`CITY_WINDOW`), for an instanced export. */
  readonly windows: readonly CityInstance[];
  readonly extent: readonly [number, number, number, number];
}

/** Carriageway width by `highway` class, metres (NYC residential street ≈ 9–10 m kerb to kerb;
 *  estimate for the rest). Footways and paths are not drawn (they run on the pavement). */
export const ROAD_WIDTH: Readonly<Record<string, number>> = {
  primary: 14,
  secondary: 12,
  tertiary: 11,
  residential: 9.5,
  unclassified: 8,
  service: 5,
};

const { roof: ROOF_BAND, cornice: CORNICE } = CITY_BANDS;
/** LOD0 articulation, metres [proud of the wall, tall]: cornice oversail, belt course, plinth. */
const OVERSAIL = 0.18;
const BELT = [0.06, 0.16] as const;
const PLINTH = [0.05, 0.5] as const;

/** A street segment as a flat ribbon prism (0.04 m, from the ground up): the widened ribbon,
 *  not just its centre line, is clipped to the slab `e`. */
function ribbon(
  a: Vec2,
  b: Vec2,
  width: number,
  e: readonly [number, number, number, number],
  color: Vec3,
): Mesh | null {
  const len = dmath.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.05) return null;
  const [nx, ny] = [(-(b[1] - a[1]) / len) * (width / 2), ((b[0] - a[0]) / len) * (width / 2)];
  let profile: Vec2[] = [
    [a[0] - nx, a[1] - ny],
    [b[0] - nx, b[1] - ny],
    [b[0] + nx, b[1] + ny],
    [a[0] + nx, a[1] + ny],
  ];
  for (const inside of [
    (p: Vec2) => e[0] - p[0],
    (p: Vec2) => p[0] - e[2],
    (p: Vec2) => e[1] - p[1],
    (p: Vec2) => p[1] - e[3],
  ])
    profile = clipPoly(profile, inside);
  if (profile.length < 3 || Math.abs(area2(profile)) < 1e-4) return null;
  return prism({ profile, depth: 0.04, centred: false, color, strip: 'asphalt' });
}

export function cityBlock(
  ctx: BuildContext,
  buildings: readonly CityFootprint[],
  o: CityOptions,
): CityInfo {
  const pre = o.prefix ?? '';
  const plans = cityPlan(buildings, o);
  const pts = plans.flatMap((p) => p.ring);
  const extent = o.extent ?? [
    Math.min(...pts.map((p) => p[0])) - 4,
    Math.min(...pts.map((p) => p[1])) - 4,
    Math.max(...pts.map((p) => p[0])) + 4,
    Math.max(...pts.map((p) => p[1])) + 4,
  ];
  const [x0, y0, x1, y1] = extent;
  ctx.part(
    `${pre}ground`,
    box({
      size: [x1 - x0, y1 - y0, 0.2],
      at: [(x0 + x1) / 2, (y0 + y1) / 2, -0.2],
      color: o.ground,
      strip: 'stone',
    }),
  );
  const roads: Mesh[] = [];
  for (const s of o.streets ?? []) {
    const width = ROAD_WIDTH[s.highway];
    if (!width) continue;
    for (let i = 0; i + 1 < s.line.length; i++) {
      const m = ribbon(s.line[i] ?? [0, 0], s.line[i + 1] ?? [0, 0], width, extent, o.road);
      if (m) roads.push(m);
    }
  }
  if (roads.length) ctx.part(`${pre}streets`, merge(roads));
  const unit = cityWindow(o.glass, ctx.lod);
  const windows: CityInstance[] = [];
  for (const p of plans) {
    const name = `${pre}b${p.id}`;
    const lod = ctx.lod;
    // The cornice: a pale band under the roof line (LOD0/1), the wall running up to it.
    const cornice = lod === 2 || !o.trim ? 0 : CORNICE;
    const wall = p.height - ROOF_BAND - cornice;
    const strip = typeof o.wallStrip === 'function' ? o.wallStrip(p) : (o.wallStrip ?? 'brick');
    ctx.part(name, cityWalls(p, wall, strip, lod), { at: [0, 0, p.base] });
    if (cornice && o.trim) {
      const band = prism({
        profile: p.ring,
        depth: cornice,
        centred: false,
        color: o.trim,
        strip: 'stone',
      });
      // Up close the top third of the band oversails the wall.
      const lip = lod === 0 ? cityLedge(p, OVERSAIL, cornice / 3, o.trim) : [];
      ctx.part(
        `${name}_cornice`,
        merge([band, ...lip.map((m) => place(m, { at: [0, 0, (2 * cornice) / 3] }))]),
        { at: [0, 0, p.base + wall] },
      );
    }
    if (lod === 0 && o.trim) {
      const bands = cityLedge(p, PLINTH[0], PLINTH[1], o.trim);
      // A belt course where the ground floor ends, on bodies that have a floor above it.
      if (p.floors > 1)
        bands.push(
          ...cityLedge(p, BELT[0], BELT[1], o.trim).map((m) =>
            place(m, { at: [0, 0, p.floorHeight - BELT[1] / 2] }),
          ),
        );
      if (bands.length) ctx.part(`${name}_bands`, merge(bands), { at: [0, 0, p.base] });
    }
    ctx.part(
      `${name}_roof`,
      prism({ profile: p.ring, depth: ROOF_BAND, centred: false, color: o.roof, strip: 'plain' }),
      { at: [0, 0, p.base + wall + cornice] },
    );
    const ws = cityWindows(p);
    if (lod < 2) windows.push(...ws);
    const glazing = lod === 2 ? merge(cityWindowBands(p, o.glass)) : cityGlazing(ws, unit);
    if (ws.length) ctx.part(`${name}_windows`, glazing);
  }
  return { plans, windows, extent };
}
