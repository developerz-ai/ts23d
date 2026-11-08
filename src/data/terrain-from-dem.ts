// Real terrain from a pinned DEM: decode + verify the heights, optionally add erosion detail finer
// than the survey (hydraulic droplets from the recipe's Rng, then thermal relaxation), colour by
// altitude/slope/flow (terrainColor), mesh at the LOD's density with a skirt (a solid map tile),
// lay nature strips per triangle and, if asked, a water surface wherever the ground dips below a
// level. Every LOD samples the SAME grid, so LODs only differ in density.

import type { Mesh, Rng } from '../core/index.ts';
import { hex } from '../material/index.ts';
import {
  heightfield,
  hydraulicErosion,
  sampler,
  type TerrainGrid,
  type TerrainPalette,
  terrainColor,
  thermalErosion,
} from '../primitives/index.ts';
import { type DemRecord, decodeDem } from './dem.ts';
import { groundStrips } from './ground-strips.ts';
import { waterSurface } from './water-surface.ts';

export interface DemGround {
  readonly palette?: TerrainPalette;
  /** Altitudes, metres above sea level. */
  readonly treeline: number;
  readonly snowline: number;
  readonly rockSlope?: number;
  readonly snowSlope?: number;
  /** Slope where soil gives way to scree (rise/run); default 0.55. */
  readonly screeSlope?: number;
}

export interface TerrainFromDemOptions {
  /** 0, 1 or 2 (ctx.lod). */
  readonly lod: number;
  /** Mesh cells per side by LOD; default [cells, cells/2, cells/4] of the DEM. */
  readonly cells?: readonly [number, number, number];
  /** Width of the output tile in metres (uniform scale); default the true size. */
  readonly size?: number;
  /** Vertical exaggeration on top of the scale; default 1 (true relief). */
  readonly vertical?: number;
  /** Skirt depth below the lowest point, in true metres; default 40. */
  readonly base?: number;
  /** Erosion detail below the survey resolution; omit to mesh the DEM as measured. */
  readonly detail?: {
    readonly rng: Rng;
    readonly droplets?: number;
    /** Thermal erosion to this slope (rise/run) afterwards; omitted = none (keeps real cliffs). */
    readonly talus?: number;
  };
  readonly ground: DemGround;
  /** Per-triangle nature strips (default true); false keeps the plain vertex-coloured mesh. */
  readonly strips?: boolean;
  /** Water surface at this altitude (m) wherever the ground lies below it. */
  readonly water?: { readonly level: number };
}

export interface DemTerrain {
  readonly terrain: Mesh;
  readonly water?: Mesh;
  /** The (eroded) grid in output units, z relative to `datum`. */
  readonly grid: TerrainGrid;
  /** Altitude (m) at z = 0. */
  readonly datum: number;
  /** Output units per true metre (horizontal), and z units per metre of altitude. */
  readonly scale: number;
  readonly zPerMetre: number;
  /** Output z at output (x, y). */
  readonly height: (x: number, y: number) => number;
}

const PALETTE: TerrainPalette = {
  forest: hex('#2f4a2a'),
  grass: hex('#6f8a45'),
  scree: hex('#8a8272'),
  rock: hex('#7d7a74'),
  snow: hex('#f2f4f7'),
  wet: hex('#4a4a3c'),
};

export function terrainFromDEM(dem: DemRecord, o: TerrainFromDemOptions): DemTerrain {
  const raw = decodeDem(dem);
  const scale = (o.size ?? dem.size[0]) / dem.size[0];
  const zPerMetre = scale * (o.vertical ?? 1);
  const datum = Math.floor(dem.min - (o.base ?? 40));
  let grid: TerrainGrid = {
    ...raw,
    rect: [raw.rect[0] * scale, raw.rect[1] * scale, raw.rect[2] * scale, raw.rect[3] * scale],
    z: raw.z.map((a) => (a - datum) * zPerMetre),
  };
  if (o.detail) {
    grid = hydraulicErosion(grid, o.detail.rng, { droplets: o.detail.droplets ?? grid.z.length });
    // Thermal relaxation is opt-in: real cliffs (El Capitan, Half Dome) stand far past any talus.
    if (o.detail.talus !== undefined)
      grid = thermalErosion(grid, { talus: o.detail.talus, iterations: 10 });
  }
  const g = o.ground;
  // terrainColor reads altitude as datum + z: give it altitudes in the scaled frame.
  const color = terrainColor(grid, {
    palette: g.palette ?? PALETTE,
    datum: datum * zPerMetre,
    treeline: g.treeline * zPerMetre,
    snowline: g.snowline * zPerMetre,
    rockSlope: g.rockSlope ?? 0.85,
    snowSlope: g.snowSlope ?? 1.1,
    jitter: 0,
  });
  const lod = Math.max(0, Math.min(2, Math.round(o.lod)));
  const cells = (o.cells ?? [dem.cells, dem.cells / 2, dem.cells / 4])[lod] ?? dem.cells;
  const n = Math.max(2, Math.round(cells));
  const height = sampler(grid);
  const mesh = heightfield({
    rect: grid.rect,
    cells: [n, n],
    height,
    color,
    skirt: 0,
    skirtColor: hex('#6a5e52'),
  });
  const terrain =
    o.strips === false
      ? mesh
      : groundStrips(mesh, {
          datum,
          perZ: 1 / zPerMetre,
          treeline: g.treeline,
          snowline: g.snowline,
          ...(g.rockSlope !== undefined ? { rockSlope: g.rockSlope } : {}),
          ...(g.snowSlope !== undefined ? { snowSlope: g.snowSlope } : {}),
          ...(g.screeSlope !== undefined ? { screeSlope: g.screeSlope } : {}),
        });
  const water = o.water
    ? waterSurface(grid, height, (o.water.level - datum) * zPerMetre, n)
    : undefined;
  return { terrain, ...(water ? { water } : {}), grid, datum, scale, zPerMetre, height };
}
