// Snow cover as a smooth 0..1 map over the terrain grid. Every input is read off a blurred copy of
// the ground (slope, aspect, crest convexity over ±2–3 cells, ~20 m), and the cover itself is
// blurred again, so a snow line or a scoured crest fades over several cells: a one-cell ridge never
// switches to a bright seam (or a bare line) on its own. Snow lies above the snowline (lower on
// north faces and in gullies, a little higher on south faces, broken up by noise), thins from ~35° to none at ~53° (it sloughs
// off; high summits hold it on steeper ground), and wind scours it off sharp convex crests: a knife ridge stays bare rock between its
// flanks' snowfields instead of carrying a thin white line.

import type { TerrainGrid } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

/** Separable box blur of a per-point map, radius `r` points, clamped at the edges. */
export function boxBlur(map: Float64Array, nx: number, ny: number, r: number): Float64Array {
  const pass = (src: Float64Array, di: number, dj: number): Float64Array => {
    const out = new Float64Array(src.length);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          const a = Math.min(nx - 1, Math.max(0, i + k * di));
          const b = Math.min(ny - 1, Math.max(0, j + k * dj));
          s += src[b * nx + a] ?? 0;
        }
        out[j * nx + i] = s / (2 * r + 1);
      }
    return out;
  };
  return pass(pass(map, 1, 0), 0, 1);
}

/** Separable square max (`sign` 1) or min (`sign` -1) filter, radius `r` points. */
function rank(map: Float64Array, nx: number, ny: number, r: number, sign: 1 | -1): Float64Array {
  const pass = (src: Float64Array, di: number, dj: number): Float64Array => {
    const out = new Float64Array(src.length);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let m = sign * -Infinity;
        for (let k = -r; k <= r; k++) {
          const a = Math.min(nx - 1, Math.max(0, i + k * di));
          const b = Math.min(ny - 1, Math.max(0, j + k * dj));
          const v = src[b * nx + a] ?? 0;
          m = sign > 0 ? Math.max(m, v) : Math.min(m, v);
        }
        out[j * nx + i] = m;
      }
    return out;
  };
  return pass(pass(map, 1, 0), 0, 1);
}

/** Metres the snowline drops in a gully or couloir. */
const HOLLOW = 120;

const ramp = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface SnowOptions {
  /** Altitude (m) of z = 0. */
  readonly datum: number;
  /** Altitude where snow starts to lie on gentle ground, m. */
  readonly snowline: number;
  /** Metres the line drops on a full north face (ground falling toward +Y); a south face lifts
   * it half as far (sun melts less snow off than shade keeps). */
  readonly northShift: number;
  /** Altitude jitter (m) at (x, y): breaks the line up. */
  readonly jitter: (x: number, y: number) => number;
  /**
   * Rise over run where snow starts to slough and where none holds (default 0.7–1.35, 35–53°),
   * and how much higher the limit climbs on summit caps (default 0.5: by half).
   */
  readonly slope?: { readonly from: number; readonly to: number; readonly caps: number };
  /** Half-width of the final edge ramp on the blurred cover (default 0.12; smaller = crisper). */
  readonly edge?: number;
  /** Fine jitter (± cover units) on the edge threshold: a ragged, broken line (default 0). */
  readonly ragged?: number;
  /**
   * Fill bare holes up to twice this radius (m) inside a snowfield (a morphological closing of
   * the cover): a knob too steep to hold snow inside a field otherwise reads as a soft dark blob.
   * The field's outer edge keeps its line (default 0: no filling).
   */
  readonly fill?: number;
}

/** Snow cover 0..1 at every grid point (row-major, like `g.z`). */
export function snowCover(g: TerrainGrid, o: SnowOptions): Float64Array {
  const { nx, ny } = g;
  const [x0, y0, x1, y1] = g.rect;
  const sx = (x1 - x0) / (nx - 1);
  const sy = (y1 - y0) / (ny - 1);
  const ground = boxBlur(boxBlur(Float64Array.from(g.z), nx, ny, 1), nx, ny, 1);
  const at = (i: number, j: number): number =>
    ground[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))] ?? 0;
  // High flanks hold snow steeper than low ones (summit caps; the crest itself stays scoured).
  const lim = o.slope ?? { from: 0.7, to: 1.35, caps: 0.5 };
  const steepAt = (alt: number): number =>
    1 + lim.caps * ramp(o.snowline + 150, o.snowline + 450, alt);
  const cover = new Float64Array(nx * ny);
  const scour = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * sx);
      const gy = (at(i, j + 1) - at(i, j - 1)) / (2 * sy);
      const slope = dmath.hypot(gx, gy);
      // Convexity across X and across Y, 3 points (~23 m) out each side, m: a crest stands over
      // the ground on both its sides along one of them, a gully sinks under it.
      const cx = at(i, j) - (at(i - 3, j) + at(i + 3, j)) / 2;
      const cy = at(i, j) - (at(i, j - 3) + at(i, j + 3)) / 2;
      const crest = Math.max(cx, cy);
      const hollow = Math.max(-cx, -cy);
      const north = Math.max(-1, Math.min(1, -gy * 1.6));
      const x = x0 + i * sx;
      const y = y0 + j * sy;
      // Snow lingers in gullies and couloirs (concave, shaded, fed by slides): the line drops
      // up to `HOLLOW` metres in them.
      const alt =
        (g.z[j * nx + i] ?? 0) +
        o.datum +
        o.northShift * (north > 0 ? north : 0.5 * north) +
        HOLLOW * ramp(2, 10, hollow) +
        o.jitter(x, y);
      cover[j * nx + i] =
        ramp(o.snowline - 60, o.snowline + 140, alt) *
        // High up, wind-packed snow and ice hold on steeper ground (summit caps): the slope
        // limit rises by half from 150 to 450 m above the line.
        (1 - ramp(lim.from * steepAt(alt), lim.to * steepAt(alt), slope)) *
        (1 - ramp(6, 16, crest));
      scour[j * nx + i] = ramp(6, 16, crest);
    }
  // Snow needs a field round it: a strip a few cells wide (a rounded crest just under the slope
  // limit) has little cover within ±5 points and fades out, while a snowfield keeps its own.
  const field = boxBlur(cover, nx, ny, 5);
  const kept = cover.map((c, k) => c * ramp(0.2, 0.55, field[k] ?? 0));
  // A snowfield has an edge: the blurred cover is cut by a narrow ramp whose threshold the jitter
  // moves (±0.12), so patches read with outlines in TOP instead of cloudy blurs, and the line
  // wanders instead of tracing the altitude contours.
  const soft = boxBlur(kept, nx, ny, 1);
  const edged = soft.map((c, k) => {
    const x = x0 + (k % nx) * sx;
    const y = y0 + Math.floor(k / nx) * sy;
    const t =
      0.38 +
      o.jitter(x * 1.7 + 311, y * 1.7 - 97) / 900 +
      (o.ragged ?? 0) * (o.jitter(x * 5.3 - 71, y * 5.3 + 133) / 115);
    const e = o.edge ?? 0.12;
    // The wind keeps scoured crests bare through the blur (a knife ridge between snowfields).
    return ramp(t - e, t + e, c) * (1 - (scour[k] ?? 0));
  });
  const r = Math.round((o.fill ?? 0) / Math.min(sx, sy));
  if (r === 0) return edged;
  const closed = rank(rank(edged, nx, ny, r, 1), nx, ny, r, -1);
  return edged.map((c, k) => Math.max(c, closed[k] ?? 0));
}
