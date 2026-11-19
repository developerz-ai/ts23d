// The facade of one planned city building, gated by LOD: walls as one `tiled` face per footprint
// edge on the wall strip at true scale (brick courses run on round the corners), coarser bands
// further out; windows from the plan's grammar rows as a glazed box (LOD0), a flat pane (LOD1) or
// one dark band per run of windows (LOD2); and, when a trim colour is given, the articulation a
// street wall has up close: an oversailing cornice, a belt course over the ground floor and a
// plinth, each mitred round the corners and stopped square at a party wall.

import { type Lod, type Mesh, merge, place, type Vec2, type Vec3 } from '../core/index.ts';
import { split } from '../grammar/index.ts';
import type { StripId } from '../material/index.ts';
import { box, prism, tiled } from '../primitives/index.ts';
import { CITY_BANDS, type CityBuildingPlan } from './city-plan.ts';

export interface CityInstance {
  /** Bottom centre of the window on the wall plane (the unit window's origin). */
  readonly at: Vec3;
  readonly yaw: number;
  readonly scale: Vec3;
}

const WINDOW_DEPTH = 0.08;
/** How far a flat pane or a far band stands off the wall, metres (no z-fight with it). */
const PROUD = 0.01;

/**
 * The unit window: 1 m wide, 1 m tall from z = 0 up (the sill), on the wall plane, facing +X.
 * LOD0 a box straddling the wall (five faces); further out one pane 1 cm proud of it.
 */
export const cityWindow = (glass: Vec3, lod: Lod = 0): Mesh =>
  lod === 0
    ? box({
        size: [WINDOW_DEPTH, 1, 1],
        at: [0, 0, 0],
        color: glass,
        strip: 'glass',
        omit: ['back'],
      })
    : tiled({
        origin: [PROUD, -0.5, 0],
        u: [0, 1, 0],
        v: [0, 0, 1],
        color: glass,
        strip: 'glass',
        vMetres: 1,
      });

/** One storey of one edge: its window slots (metres from the edge's start) at sill `z`. */
interface WindowRow {
  readonly a: Vec2;
  readonly u: Vec2;
  readonly yaw: number;
  readonly z: number;
  readonly h: number;
  readonly slots: readonly { readonly start: number; readonly size: number }[];
}

function windowRows(p: CityBuildingPlan): WindowRow[] {
  const out: WindowRow[] = [];
  const n = p.ring.length;
  const w = p.bay * 0.48;
  const pier = (p.bay - w) / 2;
  const line = `pier:~ | {wall:${pier.toFixed(2)} | win:${w.toFixed(2)} | wall:${pier.toFixed(2)}}* | pier:~`;
  // The wall top under the cornice (whether or not one is drawn): no window head goes past it.
  const top = p.base + p.height - CITY_BANDS.roof - CITY_BANDS.cornice;
  for (let i = 0; i < n; i++) {
    if (p.party[i]) continue;
    const taken = p.shared[i] ?? [];
    const a = p.ring[i] ?? [0, 0];
    const b = p.ring[(i + 1) % n] ?? a;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < p.bay + 0.6) continue;
    const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // A window needs open wall: not on a stretch a neighbour stands against.
    const slots = split(line, len).filter(
      (s) => s.symbol === 'win' && !taken.some(([lo, hi]) => s.start < hi && s.start + s.size > lo),
    );
    for (let f = 0; f < p.floors; f++) {
      // Sill at 26% of the storey, head at 82%, clamped to the wall top: a storey under about
      // 0.83 m (a body under 1.43 m) would put the head into the cornice.
      const z = p.base + f * p.floorHeight + p.floorHeight * 0.26;
      const h = Math.min(p.floorHeight * 0.56, top - z);
      // Counter-clockwise ring: the outward normal is the edge turned clockwise.
      out.push({ a, u, yaw: Math.atan2(-u[0], u[1]), z, h, slots });
    }
  }
  return out;
}

/** Window transforms of one building (street-facing edges × storeys × grammar slots). */
export function cityWindows(p: CityBuildingPlan): CityInstance[] {
  return windowRows(p).flatMap((r) =>
    r.slots.map((s): CityInstance => {
      const t = s.start + s.size / 2;
      return {
        at: [r.a[0] + r.u[0] * t, r.a[1] + r.u[1] * t, r.z],
        yaw: r.yaw,
        scale: [1, s.size, r.h],
      };
    }),
  );
}

/** How far a far band sits from the wall colour towards the glass: frames and piers lighten it. */
const GLAZED = 0.7;

/**
 * LOD2: every run of neighbouring windows in a row as one dark band, sill to head (2 triangles),
 * in the row's mean colour (glass and the piers between), so the facade keeps its value.
 */
export function cityWindowBands(p: CityBuildingPlan, glass: Vec3): Mesh[] {
  const out: Mesh[] = [];
  const color: Vec3 = [
    p.wall[0] + (glass[0] - p.wall[0]) * GLAZED,
    p.wall[1] + (glass[1] - p.wall[1]) * GLAZED,
    p.wall[2] + (glass[2] - p.wall[2]) * GLAZED,
  ];
  for (const r of windowRows(p)) {
    const runs: [number, number][] = [];
    for (const s of r.slots) {
      const last = runs.at(-1);
      // Slots a pier apart are one row of windows; a neighbour's wall in between ends the run.
      if (last && s.start - last[1] < p.bay) last[1] = s.start + s.size;
      else runs.push([s.start, s.start + s.size]);
    }
    const n: Vec2 = [r.u[1], -r.u[0]];
    for (const [t0, t1] of runs)
      out.push(
        tiled({
          origin: [r.a[0] + r.u[0] * t0 + n[0] * PROUD, r.a[1] + r.u[1] * t0 + n[1] * PROUD, r.z],
          u: [r.u[0] * (t1 - t0), r.u[1] * (t1 - t0), 0],
          v: [0, 0, r.h],
          color,
          strip: 'glass',
          vMetres: r.h + PROUD,
        }),
      );
  }
  return out;
}

/** `ring` moved `d` metres out (in for d < 0) with mitred corners (capped on needle corners). */
function offsetRing(ring: readonly Vec2[], d: number): Vec2[] {
  const n = ring.length;
  const normal = (i: number): Vec2 => {
    const a = ring[(i + n) % n] ?? [0, 0];
    const b = ring[(i + 1) % n] ?? a;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
  };
  return ring.map((c, i) => {
    const [n0, n1] = [normal(i - 1), normal(i)];
    const k = d / Math.max(0.25, 1 + n0[0] * n1[0] + n0[1] * n1[1]);
    return [c[0] + (n0[0] + n1[0]) * k, c[1] + (n0[1] + n1[1]) * k];
  });
}

/**
 * The body's walls from z = 0 up `height`: one face per edge, courses continuing round the
 * corners, plus the footprint as a floor (3 cm inside the walls) so a body lifted off the ground
 * is closed from below. `vMetres`: true scale at LOD0, a storey at LOD1, the whole wall at LOD2.
 */
export function cityWalls(p: CityBuildingPlan, height: number, strip: StripId, lod: Lod): Mesh {
  const faces: Mesh[] = [];
  let run = 0;
  p.ring.forEach((a, i) => {
    const b = p.ring[(i + 1) % p.ring.length] ?? a;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) return;
    faces.push(
      tiled({
        origin: [a[0], a[1], 0],
        u: [b[0] - a[0], b[1] - a[1], 0],
        v: [0, 0, height],
        color: p.wall,
        strip,
        uOffset: run,
        ...(lod === 2 ? { vMetres: height + PROUD } : lod === 1 ? { vMetres: p.floorHeight } : {}),
      }),
    );
    run += len;
  });
  faces.push(
    prism({
      profile: offsetRing(p.ring, -0.03),
      depth: 0.02,
      centred: false,
      color: p.wall,
      strip,
    }),
  );
  return merge(faces);
}

/**
 * A ledge on every open edge: `out` metres proud of the wall, `height` tall, from z = 0. Mitred
 * where two open edges meet, cut square where the next edge is a party wall.
 */
export function cityLedge(p: CityBuildingPlan, out: number, height: number, color: Vec3): Mesh[] {
  const n = p.ring.length;
  const outer = offsetRing(p.ring, out);
  const ledges: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    if (p.party[i]) continue;
    const j = (i + 1) % n;
    const a = p.ring[i] ?? [0, 0];
    const b = p.ring[j] ?? a;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const nrm: Vec2 = [((b[1] - a[1]) / len) * out, (-(b[0] - a[0]) / len) * out];
    const square = (c: Vec2): Vec2 => [c[0] + nrm[0], c[1] + nrm[1]];
    const a1 = p.party[(i - 1 + n) % n] ? square(a) : (outer[i] ?? square(a));
    const b1 = p.party[j] ? square(b) : (outer[j] ?? square(b));
    ledges.push(
      prism({ profile: [a, a1, b1, b], depth: height, centred: false, color, strip: 'stone' }),
    );
  }
  return ledges;
}

/** Window boxes or panes of one building, merged (world frame, like the transforms). */
export const cityGlazing = (ws: readonly CityInstance[], unit: Mesh): Mesh =>
  merge(ws.map((w) => place(unit, { at: w.at, yaw: w.yaw, scale: w.scale })));
