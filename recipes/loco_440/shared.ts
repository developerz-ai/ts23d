// Jupiter shared module: true-scale constants, the livery palette (paint colours sampled from the
// 1994+ Golden Spike NHP scheme, see README.md) mapped onto material-library strips, the layout
// derived from the Whyte arrangement, and small builders every part module uses.

import {
  type BuildContext,
  beam,
  box,
  type Check,
  hex,
  inspect,
  type LatheOptions,
  type Lod,
  lathe,
  type Mesh,
  NATURAL,
  type StripId,
  type Vec3,
  whyteAxles,
} from '@developerz.ai/ts23d';

// ---------------------------------------------------------------- dimensions (m, +X front, Z up)
export const GAUGE = 1.435;
export const HEAD = 0.072;
export const TIE_H = 0.15;
export const RAIL_H = 0.14;
export const RAIL_TOP = TIE_H + RAIL_H;
export const RAIL_Y = GAUGE / 2 + HEAD / 2;
export const TREAD_W = 0.13;
export const DRIVER_R = 0.813;
export const LEAD_R = 0.38;
export const TENDER_R = 0.38;
/** Gap between wheel rims; gives the (estimated) 8 ft driver wheelbase with 1.626 m drivers. */
export const SPACING = 0.814;
export const CRANK = 0.3;
export const SPEED = 4;
export const FRAME_Y = 0.5;
export const CYL_Z = 1.42;
export const ROD_Y = 0.98;
export const BOILER_Z = 2.4;
export const BOILER_R = 0.62;
export const SMOKEBOX_R = 0.68;
export const DECK_Z = 1.75;
export const BOARD_Z = RAIL_TOP + 2 * DRIVER_R + 0.06;
export const DRIVER_RPS = SPEED / (2 * Math.PI * DRIVER_R);

// ---------------------------------------------------------------- livery → material strips
/** Caledonian blue (1994 repaint, refined from "Pepsi" blue): cab, tender, pilot, sand dome. */
export const BLUE = hex('#2a44b8');
/** Vermilion-crimson: wheel centres, window frames, roof, tender panels and stripes. */
export const RED = hex('#c92a22');
/** Black engine enamel: frames, saddle, firebox, lead truck. */
export const BLACK = hex('#2b2b2e');
/** Russia iron jacket: planished blue-grey sheet iron, a dark metal with a soft sheen. */
export const RUSSIA = hex('#6a717c');
/** Smokebox and stack: graphite-black cast/sheet iron. */
export const GRAPHITE = hex('#5a5a5c');
export const GREEN = hex('#1f6a3a');
/** Polished brass reads as cream at the measured albedo under the studio sky; the photos show a
 *  warmer gold, so the strip gets a light warm tint. */
export const BRASS = hex('#f2cf86');
export const GLASS = hex('#9fb4c0');

export interface Finish {
  readonly color: Vec3;
  readonly strip: StripId;
}
/** Every surface on the engine names one of these: strip + vertex colour, nothing else. */
export const F = {
  blueSteel: { color: BLUE, strip: 'steel_painted' },
  blueWood: { color: BLUE, strip: 'wood_painted' },
  redSteel: { color: RED, strip: 'steel_painted' },
  redWood: { color: RED, strip: 'wood_painted' },
  black: { color: BLACK, strip: 'steel_painted' },
  greenWood: { color: GREEN, strip: 'wood_painted' },
  russia: { color: RUSSIA, strip: 'chrome' },
  smokebox: { color: GRAPHITE, strip: 'iron_cast' },
  castIron: { color: NATURAL, strip: 'iron_cast' },
  rust: { color: NATURAL, strip: 'iron_rust' },
  brass: { color: BRASS, strip: 'brass' },
  steel: { color: NATURAL, strip: 'aluminium' },
  chrome: { color: NATURAL, strip: 'chrome' },
  oak: { color: NATURAL, strip: 'oak' },
  pine: { color: NATURAL, strip: 'pine' },
  ties: { color: NATURAL, strip: 'wood_weathered' },
  glass: { color: GLASS, strip: 'glass' },
  ballast: { color: hex('#b9b2a4'), strip: 'stone' },
  rubber: { color: NATURAL, strip: 'rubber' },
} as const satisfies Record<string, Finish>;

// ---------------------------------------------------------------- layout
export interface Axle {
  readonly role: string;
  readonly x: number;
  readonly radius: number;
}
export interface Layout {
  readonly lod: Lod;
  readonly segs: number;
  readonly drivers: readonly Axle[];
  readonly leads: readonly Axle[];
  readonly frontDriver: number;
  readonly truckX: number;
  readonly smokeFront: number;
  readonly beamX: number;
  readonly pilotTip: number;
  readonly cabFront: number;
  readonly cabRear: number;
  readonly tenderFront: number;
  readonly tenderRear: number;
  readonly cylX: number;
  readonly guideFront: number;
  readonly guideRear: number;
  readonly barrelFront: number;
  readonly barrelRear: number;
  readonly stackX: number;
  readonly stackBase: number;
}

/** Lay the engine out from the Whyte arrangement; the rear driver sits at x = 0. */
export function layoutOf(ctx: BuildContext, arrangement: string): Layout {
  const raw = whyteAxles(arrangement, {
    leading: LEAD_R,
    driving: DRIVER_R,
    trailing: LEAD_R,
    spacing: SPACING,
  });
  const rear = Math.min(...raw.filter((a) => a.role === 'driving').map((a) => a.x));
  // The lead truck sits ahead of the cylinders, a little further out than the even spacing.
  const axles = raw.map((a) => ({ ...a, x: a.x - rear + (a.role === 'leading' ? 0.6 : 0) }));
  const drivers = axles.filter((a) => a.role === 'driving').sort((a, b) => b.x - a.x);
  const leads = axles.filter((a) => a.role === 'leading').sort((a, b) => b.x - a.x);
  const front = Math.max(...axles.map((a) => a.x + a.radius));
  const frontDriver = drivers[0]?.x ?? 2.44;
  const truckX = leads.length ? leads.reduce((s, a) => s + a.x, 0) / leads.length : front - 0.8;
  const smokeFront = front + 0.22;
  const beamX = smokeFront + 0.3;
  const cabFront = -0.9;
  const cabRear = -3.3;
  const tenderFront = cabRear - 0.25;
  const cylX = truckX + 0.05;
  return {
    lod: ctx.lod,
    segs: ctx.pick([28, 14, 6]),
    drivers,
    leads,
    frontDriver,
    truckX,
    smokeFront,
    beamX,
    pilotTip: beamX + 0.95,
    cabFront,
    cabRear,
    tenderFront,
    tenderRear: tenderFront - 5.6,
    cylX,
    guideFront: cylX - 0.5,
    guideRear: frontDriver + 1.0,
    barrelFront: smokeFront - 1.05,
    barrelRear: cabFront + 0.05,
    stackX: smokeFront - 0.45,
    stackBase: BOILER_Z + SMOKEBOX_R - 0.06,
  };
}

// ---------------------------------------------------------------- builders
/** `lathe` with the strip mapped at true scale, so grain, brushing and pits keep their size. */
export const lath = (o: LatheOptions): Mesh => lathe({ uv: 'metres', ...o });

/** Axis-aligned box between two corners (any order) in a finish. */
export function bx(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  f: Finish,
): Mesh {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
  const [e, g] = [Math.min(z0, z1), Math.max(z0, z1)];
  return box({ size: [b - a, d - c, g - e], at: [(a + b) / 2, (c + d) / 2, e], ...f });
}

/** A round pipe or rod through points (handrails, feed pipes, sand pipes). */
export function pipe(points: readonly Vec3[], d: number, f: Finish, segments = 6): Mesh[] {
  return points
    .slice(1)
    .map((to, i) => beam({ from: points[i] as Vec3, to, width: d, segments, ...f }));
}

/** A dome-head rivet on a face whose outward normal is ±X/±Y/±Z, built once and placed. */
export function rivet(at: Vec3, axis: 'x' | 'y' | 'z', sign: number, r = 0.012): Mesh {
  return lath({
    profile: [
      [r, 0],
      [r * 0.8, sign * r * 0.6],
      [0, sign * r * 0.8],
    ],
    segments: 5,
    axis,
    at,
    ...F.blueSteel,
  });
}

/** A plain bearing: a ring whose bore lies on the axle surface (10 sides, like the axle). */
export const bearing = (x: number, z: number, y: number, f: Finish = F.castIron): Mesh =>
  lath({
    profile: [
      [0.07, y - 0.06],
      [0.13, y - 0.06],
      [0.13, y + 0.06],
      [0.07, y + 0.06],
      [0.07, y - 0.06],
    ],
    segments: 10,
    axis: 'y',
    at: [x, 0, z],
    ...f,
  });

/**
 * What holds a frame on an axle: a bearing ring at LOD0/1; at LOD2 (no axles) a plate from the
 * frame out to the wheel's inner face.
 */
export const support = (lod: Lod, x: number, z: number, s: number, frameY: number): Mesh =>
  lod < 2
    ? bearing(x, z, s * frameY)
    : box({
        size: [0.3, GAUGE / 2 - frameY + 0.04, 0.3],
        at: [x, s * ((frameY - 0.04 + GAUGE / 2) / 2), z - 0.15],
        ...F.black,
      });

/** Run a check only at LODs where `part` exists. */
export const whenBuilt =
  (part: string, check: Check): Check =>
  (asset) =>
    asset.parts.some((p) => p.name === part && p.mesh) ? check(asset) : [];

/**
 * Every `*_l` part mirrors its `*_r` twin across y = 0. (The library's `symmetric('_l', '_r')`
 * rewrites the first `_l` in the name, so `axle_lead_0_wheel_l` became `axle_read_0_wheel_l`.)
 */
export const mirrored: Check = (asset) => {
  const q = inspect(asset);
  return q.parts('*_l').flatMap((l) => {
    const r = `${l.slice(0, -2)}_r`;
    const a = q.bounds(l);
    const b = q.bounds(r);
    if (!a || !b) return [{ part: l, message: `'${l}' has no mirror '${r}'`, fix: `add '${r}'` }];
    const off = Math.abs(a.min[1] + b.max[1]) + Math.abs(a.max[1] + b.min[1]);
    return off > 0.04
      ? [
          {
            part: l,
            message: `'${l}' / '${r}' off mirror by ${(off * 50).toFixed(1)} cm`,
            fix: 'mirror it',
          },
        ]
      : [];
  });
};

export const SIDES = [
  ['l', 1],
  ['r', -1],
] as const;
