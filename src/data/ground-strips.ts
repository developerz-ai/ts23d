// Ground finish of a terrain tile on the shared trim sheet, without a seam anywhere. The mesh
// stays welded and the ground classes (forest, meadow, scree, rock, snow) live in smooth
// per-vertex colour blends, so a class border is a gradient across triangles, never a switch at a
// triangle edge. The whole surface lies on ONE matte strip (`concrete`) stretched so the tile
// spans a single band: V cannot wrap on the sheet, and a strip at true scale would have to be
// squeezed into every triangle on its own (the diagonal stripe banding of D307). The tile's cut
// sides carry `rock_strata`, one band over the wall's height, beds level, darker towards the base.

import type { Mesh, Vec3 } from '../core/index.ts';
import { DEFAULT_SHEET, type StripId, stripRect } from '../material/index.ts';

export interface GroundOptions {
  /**
   * Scree on sloping ground: `color` fades in around `slope` (rise/run) and out again where bare
   * rock takes over at `rockSlope`. Omitted: the mesh's colours are kept as they are.
   */
  readonly scree?: { readonly color: Vec3; readonly slope: number; readonly rockSlope: number };
}

const TOP: StripId = 'concrete';
const SIDE: StripId = 'rock_strata';
/** Faces flatter than this (|nz|) are the tile's cut sides. */
const SIDE_NZ = 0.05;
/** Half a texel of the house sheet: V stays inside its strip under bilinear sampling. */
const HALF = 0.5 / 4096;
/** How much of the scree colour a full-weight slope takes (the altitude classes show through). */
const SCREE_SHARE = 0.5;

const ramp = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** U per metre that keeps a strip's texels square when one band is stretched over `band` metres. */
function uPerMetre(id: StripId, band: number): number {
  const rect = stripRect(id);
  const vm = DEFAULT_SHEET.strips[id]?.scaleMetres ?? 1;
  return (rect.u1 - rect.u0) / (rect.metres * (band / vm));
}

export function groundStrips(m: Mesh, o: GroundOptions = {}): Mesh {
  const P = m.positions;
  const count = P.length / 3;
  const side = (i: number): boolean => Math.abs(m.normals[i * 3 + 2] ?? 1) < SIDE_NZ;
  let [x0, y0, x1, y1, wall] = [Infinity, Infinity, -Infinity, -Infinity, 0];
  for (let i = 0; i < count; i++) {
    x0 = Math.min(x0, P[i * 3] ?? 0);
    x1 = Math.max(x1, P[i * 3] ?? 0);
    y0 = Math.min(y0, P[i * 3 + 1] ?? 0);
    y1 = Math.max(y1, P[i * 3 + 1] ?? 0);
    if (side(i)) wall = Math.max(wall, P[i * 3 + 2] ?? 0);
  }
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  wall = Math.max(wall, 1e-6);
  const [top, strata] = [stripRect(TOP), stripRect(SIDE)];
  // Strata run long: a quarter of the square-texel rate along the wall, so beds outlast joints.
  const [topU, sideU] = [uPerMetre(TOP, span), uPerMetre(SIDE, wall) / 4];
  const band = (r: typeof top, f: number): number =>
    r.v0 + HALF + Math.min(1, Math.max(0, f)) * (r.v1 - r.v0 - 2 * HALF);
  const uvs = new Float32Array(m.uvs);
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
    if (side(i)) {
      // Beds level: V up the wall in one band, U along the perimeter.
      uvs[i * 2] = strata.u0 + (x - x0 + (y - y0)) * sideU;
      uvs[i * 2 + 1] = band(strata, z / wall);
      const k = 0.62 + 0.38 * Math.min(1, Math.max(0, z / wall));
      for (let c = 0; c < 3; c++) colors[i * 3 + c] = (colors[i * 3 + c] ?? 0) * k;
      continue;
    }
    uvs[i * 2] = top.u0 + (x - x0) * topU;
    uvs[i * 2 + 1] = band(top, (y - y0) / span);
    if (!o.scree) continue;
    const nz = Math.max(1e-3, m.normals[i * 3 + 2] ?? 1);
    const steep = Math.sqrt(Math.max(0, 1 - nz * nz)) / nz;
    const { color, slope, rockSlope } = o.scree;
    const w =
      SCREE_SHARE *
      ramp(slope - 0.15, slope + 0.05, steep) *
      (1 - ramp(rockSlope - 0.15, rockSlope + 0.15, steep));
    for (let c = 0; c < 3; c++) {
      const v = colors[i * 3 + c] ?? 0;
      colors[i * 3 + c] = v + ((color[c] ?? 0) - v) * w;
    }
  }
  return { ...m, uvs, colors };
}
