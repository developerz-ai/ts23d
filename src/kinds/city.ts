// A city block from real footprints: each building is its footprint extruded to its height
// (`prism`, so the massing is the survey's polygon, not a box), a roof band in the roof colour,
// and windows laid along every street-facing edge by a split-grammar line per storey
// (`pier:~ | {wall | win | wall}* | pier:~`, bay width by the building's seed); party walls get
// none. Streets are flat ribbons on a ground slab. Windows are one repeated mesh: the block
// returns their transforms so a scene can export them as GPU instances (EXT_mesh_gpu_instancing)
// while the asset merges them per building. LOD2 keeps massing and roofs only.

import { type BuildContext, type Mesh, merge, place, type Vec2, type Vec3 } from '../core/index.ts';
import { split } from '../grammar/index.ts';
import { box, prism } from '../primitives/index.ts';
import {
  type CityBuildingPlan,
  type CityFootprint,
  type CityPlanOptions,
  cityPlan,
} from './city-plan.ts';

export interface CityStreet {
  readonly highway: string;
  readonly line: readonly Vec2[];
}

export interface CityOptions extends CityPlanOptions {
  readonly prefix?: string;
  readonly roof: Vec3;
  readonly glass: Vec3;
  /** Cornice band under the roof line (LOD0/1); none when absent. */
  readonly trim?: Vec3;
  readonly ground: Vec3;
  readonly road: Vec3;
  readonly streets?: readonly CityStreet[];
  /** Ground slab extent [minX, minY, maxX, maxY]; default the footprints' box + 4 m. */
  readonly extent?: readonly [number, number, number, number];
}

export interface CityInstance {
  readonly at: Vec3;
  readonly yaw: number;
  readonly scale: Vec3;
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

const ROOF_BAND = 0.3;
const CORNICE = 0.45;
const WINDOW_DEPTH = 0.08;

/** The unit window: 1 m wide, 1 m tall, centred on the wall plane, facing +X. */
export const cityWindow = (glass: Vec3): Mesh =>
  box({ size: [WINDOW_DEPTH, 1, 1], at: [0, 0, 0], color: glass, strip: 'glass', omit: ['back'] });

/** Window transforms of one building (street-facing edges × storeys × grammar slots). */
export function cityWindows(p: CityBuildingPlan): CityInstance[] {
  const out: CityInstance[] = [];
  const n = p.ring.length;
  const w = p.bay * 0.48;
  const pier = (p.bay - w) / 2;
  const line = `pier:~ | {wall:${pier.toFixed(2)} | win:${w.toFixed(2)} | wall:${pier.toFixed(2)}}* | pier:~`;
  for (let i = 0; i < n; i++) {
    if (p.party[i]) continue;
    const a = p.ring[i] ?? [0, 0];
    const b = p.ring[(i + 1) % n] ?? a;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < p.bay + 0.6) continue;
    const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // Counter-clockwise ring: the outward normal is the edge turned clockwise.
    const yaw = Math.atan2(-ux, uy);
    const slots = split(line, len).filter((s) => s.symbol === 'win');
    for (let f = 0; f < p.floors; f++) {
      const h = p.floorHeight * 0.56;
      const z = p.base + f * p.floorHeight + p.floorHeight * 0.26 + h / 2;
      for (const s of slots) {
        const t = s.start + s.size / 2;
        out.push({ at: [a[0] + ux * t, a[1] + uy * t, z], yaw, scale: [1, s.size, h] });
      }
    }
  }
  return out;
}

/** A street segment as a flat ribbon prism (0.04 m, from the ground up), clipped to the slab. */
function ribbon(a: Vec2, b: Vec2, width: number, color: Vec3): Mesh | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.05) return null;
  const [nx, ny] = [(-(b[1] - a[1]) / len) * (width / 2), ((b[0] - a[0]) / len) * (width / 2)];
  return prism({
    profile: [
      [a[0] - nx, a[1] - ny],
      [b[0] - nx, b[1] - ny],
      [b[0] + nx, b[1] + ny],
      [a[0] + nx, a[1] + ny],
    ],
    depth: 0.04,
    centred: false,
    color,
    strip: 'asphalt',
  });
}

/** Liang–Barsky: the part of segment a→b inside the box, or null. */
function clip(a: Vec2, b: Vec2, e: readonly [number, number, number, number]): [Vec2, Vec2] | null {
  let [t0, t1] = [0, 1];
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
  for (const [p, q] of [
    [-d[0], a[0] - e[0]],
    [d[0], e[2] - a[0]],
    [-d[1], a[1] - e[1]],
    [d[1], e[3] - a[1]],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (t0 >= t1) return null;
  return [
    [a[0] + d[0] * t0, a[1] + d[1] * t0],
    [a[0] + d[0] * t1, a[1] + d[1] * t1],
  ];
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
      const seg = clip(s.line[i] ?? [0, 0], s.line[i + 1] ?? [0, 0], extent);
      const m = seg && ribbon(seg[0], seg[1], width, o.road);
      if (m) roads.push(m);
    }
  }
  if (roads.length) ctx.part(`${pre}streets`, merge(roads));
  const unit = cityWindow(o.glass);
  const windows: CityInstance[] = [];
  for (const p of plans) {
    const name = `${pre}b${p.id}`;
    // The cornice: a pale band under the roof line (LOD0/1), the wall running up to it.
    const cornice = ctx.lod === 2 || !o.trim ? 0 : CORNICE;
    const wall = p.height - ROOF_BAND - cornice;
    ctx.part(
      name,
      prism({ profile: p.ring, depth: wall, centred: false, color: p.wall, strip: 'plain' }),
      {
        at: [0, 0, p.base],
      },
    );
    if (cornice && o.trim)
      ctx.part(
        `${name}_cornice`,
        prism({ profile: p.ring, depth: cornice, centred: false, color: o.trim, strip: 'stone' }),
        { at: [0, 0, p.base + wall] },
      );
    ctx.part(
      `${name}_roof`,
      prism({ profile: p.ring, depth: ROOF_BAND, centred: false, color: o.roof, strip: 'plain' }),
      { at: [0, 0, p.base + wall + cornice] },
    );
    if (ctx.lod === 2) continue;
    const ws = cityWindows(p);
    windows.push(...ws);
    if (ws.length)
      ctx.part(
        `${name}_windows`,
        merge(ws.map((w) => place(unit, { at: w.at, yaw: w.yaw, scale: w.scale }))),
      );
  }
  return { plans, windows, extent };
}
