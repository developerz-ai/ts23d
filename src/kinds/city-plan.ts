// The plan of a city block from real footprints (OpenStreetMap or any survey): per building its
// height (the `height` tag, else levels × floor height, else a default — and which one it used;
// all three run from the ground, so `minHeight` comes off the extruded body), floor count, a seed
// hashed from its id (so the same building is the same in every build and every block it appears
// in), a wall colour that differs from every neighbour's (greedy colouring over shared walls), a
// window bay, and per edge the stretches shared with a neighbour (no windows there). Also the
// footprint IoU used to prove the built massing matches the source.

import { Ts23dError, type Vec2, type Vec3 } from '../core/index.ts';
import { EPS, edgeLength, mergeSpans, type Span, sharedSpans } from './city-shared.ts';

export type { Span } from './city-shared.ts';

export interface CityFootprint {
  readonly id: number;
  /** Counter-clockwise ring, metres, no closing duplicate. */
  readonly ring: readonly Vec2[];
  /** Ground to top, metres (OSM `height`). */
  readonly height: number | null;
  readonly levels: number | null;
  /** Ground to the underside of the body, metres (OSM `min_height`); default 0. */
  readonly minHeight?: number;
}

export interface CityPlanOptions {
  /** Wall colours the seed picks from; neighbours never share one (needs ≥ 2; 4 always works
   *  on a planar block). */
  readonly walls: readonly Vec3[];
  /** Storey height for `building:levels` and the window rows, metres (default 3.2). */
  readonly floorHeight?: number;
  /** Height of an untagged building, metres (default 3 storeys). */
  readonly defaultHeight?: number;
  /** Ground height under a footprint (DEM sampler); default flat 0. */
  readonly groundAt?: (x: number, y: number) => number;
}

export interface CityBuildingPlan {
  readonly id: number;
  readonly ring: readonly Vec2[];
  /** Underside of the body: ground under the footprint (lowest corner) + `minHeight`, metres. */
  readonly base: number;
  /** Extruded height, metres: the top is `base + height`. */
  readonly height: number;
  readonly heightSource: 'height' | 'levels' | 'default';
  readonly floors: number;
  readonly floorHeight: number;
  readonly seed: number;
  readonly wall: Vec3;
  /** Window bay width, metres (2.2–3.0 by seed). */
  readonly bay: number;
  /** Per edge i (ring[i] → ring[i+1]): shared with neighbours along its whole length. */
  readonly party: readonly boolean[];
  /** Per edge i: the stretches [from, to] (metres from ring[i]) that run along a neighbour. */
  readonly shared: readonly (readonly Span[])[];
  readonly neighbours: readonly number[];
}

/**
 * Fixed bands `cityBlock` takes off the top of every body, metres, and the shortest body that
 * leaves a wall under them: roof + cornice (0.75 m) plus a quarter metre of wall. Below it the
 * wall prism has a negative depth and the storey under the 0.6 m roof allowance a negative height.
 */
export const CITY_BANDS = { roof: 0.3, cornice: 0.45, minBody: 1 } as const;

/** 32-bit integer hash (splitmix-style finaliser): an OSM id → a stable seed. */
export function hashId(id: number): number {
  let h = (Math.floor(id) ^ (Math.floor(id / 4294967296 /* 2^32 */) * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function cityPlan(
  buildings: readonly CityFootprint[],
  o: CityPlanOptions,
): CityBuildingPlan[] {
  if (o.walls.length < 2)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `city: ${o.walls.length} wall colour(s)`,
      fix: 'give at least 2 wall colours (4 always lets neighbours differ)',
    });
  const fh = o.floorHeight ?? 3.2;
  const sorted = [...buildings].sort((a, b) => a.id - b.id);
  const touches = (b: CityFootprint, n: CityFootprint): boolean =>
    b.ring.some((_, i) => mergeSpans(sharedSpans(b.ring, i, n.ring)).length > 0);
  const shared = sorted.map((b) =>
    b.ring.map((_, i) =>
      mergeSpans(sorted.flatMap((n) => (n === b ? [] : sharedSpans(b.ring, i, n.ring)))),
    ),
  );
  const near = sorted.map((b) =>
    sorted.filter((n) => n !== b && (touches(b, n) || touches(n, b))).map((n) => n.id),
  );
  const colour = new Map<number, number>();
  return sorted.map((b, k) => {
    if (b.ring.length < 3)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `city: building ${b.id} has ${b.ring.length} footprint points`,
        fix: 'pass closed footprints (≥ 3 points)',
      });
    const seed = hashId(b.id);
    const used = new Set((near[k] ?? []).map((id) => colour.get(id)));
    let c = seed % o.walls.length;
    for (let t = 0; t < o.walls.length && used.has(c); t++) c = (c + 1) % o.walls.length;
    colour.set(b.id, c);
    const [total, heightSource] =
      b.height !== null
        ? [b.height, 'height' as const]
        : b.levels !== null
          ? [b.levels * fh + 0.6, 'levels' as const]
          : [o.defaultHeight ?? 3 * fh, 'default' as const];
    const lift = b.minHeight ?? 0;
    const height = total - lift;
    if (!(lift >= 0) || !(height > 0))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `city: building ${b.id} is ${total} m tall from the ground with minHeight ${lift} m`,
        fix: 'height (ground to top) must be above minHeight (ground to the underside), and minHeight ≥ 0',
      });
    if (height < CITY_BANDS.minBody)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `city: building ${b.id} has a ${+height.toFixed(3)} m body (${total} m tall, minHeight ${lift} m), under the ${CITY_BANDS.roof} m roof band and ${CITY_BANDS.cornice} m cornice every building gets`,
        fix: `a body is at least ${CITY_BANDS.minBody} m (height − minHeight): correct the height or minHeight, or leave the footprint out (a kerb, a slab or a canopy edge is not a building)`,
      });
    const floors = Math.max(1, Math.round((height - 0.6) / fh));
    const base = Math.min(...b.ring.map((p) => o.groundAt?.(p[0], p[1]) ?? 0)) + lift;
    return {
      id: b.id,
      ring: b.ring,
      base,
      height,
      heightSource,
      floors,
      floorHeight: (height - 0.6) / floors,
      seed,
      wall: o.walls[c] ?? o.walls[0] ?? [0.5, 0.5, 0.5],
      bay: 2.2 + ((seed >>> 8) % 9) * 0.1,
      party: b.ring.map((_, i) => {
        const [only, more] = shared[k]?.[i] ?? [];
        return !!only && !more && only[0] <= EPS && only[1] >= edgeLength(b.ring, i) - EPS;
      }),
      shared: shared[k] ?? [],
      neighbours: near[k] ?? [],
    };
  });
}

const inside = (p: Vec2, ring: readonly Vec2[]): boolean => {
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

/** Intersection over union of two footprints, rasterised at `cell` metres. */
export function footprintIoU(a: readonly Vec2[], b: readonly Vec2[], cell = 0.1): number {
  const xs = [...a, ...b].map((p) => p[0]);
  const ys = [...a, ...b].map((p) => p[1]);
  let both = 0;
  let either = 0;
  for (let x = Math.min(...xs) + cell / 2; x < Math.max(...xs); x += cell)
    for (let y = Math.min(...ys) + cell / 2; y < Math.max(...ys); y += cell) {
      const [ia, ib] = [inside([x, y], a), inside([x, y], b)];
      if (ia && ib) both++;
      if (ia || ib) either++;
    }
  return either ? both / either : 0;
}
