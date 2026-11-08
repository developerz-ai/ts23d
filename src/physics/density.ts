// Density per trim-sheet strip (kg/m³) and the triangle → strip lookup: a triangle's material is
// the strip row its UV centroid sits in, so mass needs no extra tagging. Sources:
// engineeringtoolbox.com "Densities of Solids" / "Metals and Alloys - Densities" / "Wood Species"
// (docs/architecture/gltf-capabilities.md#physics has the table with links).

import { STRIP_ROWS, STRIPS, stripRect } from '../material/index.ts';

/** kg/m³. Effective values for porous/woven stock (canvas, leather) as worn on assets. */
export const DENSITY: Readonly<Record<string, number>> = {
  // Classic strips. `plain` is untyped paint: water density as the honest unknown.
  plain: 1000,
  brick: 1900,
  stone: 2600,
  slate: 2800,
  iron: 7850,
  wood: 600,
  glass: 2500,
  concrete: 2400,
  // Material strips.
  oak: 750,
  pine: 500,
  wood_weathered: 550,
  wood_painted: 600,
  iron_rust: 7700,
  iron_cast: 7200,
  steel_painted: 7850,
  steel_galvanised: 7850,
  brass: 8500,
  copper: 8960,
  aluminium: 2700,
  chrome: 7850,
  rubber: 1100,
  canvas: 600,
  leather: 860,
  plastic: 1050,
  // Nature strips: loose/dry bulk densities for granular ground, green wood for bark.
  sand: 1600,
  soil: 1300,
  gravel: 1700,
  mud: 1700,
  rock_strata: 2300,
  cliff: 2700,
  moss: 400,
  grass: 300,
  snow: 300,
  ice: 917,
  bark_oak: 500,
  bark_pine: 500,
  bark_birch: 500,
  leaf_litter: 100,
  cobblestone: 2600,
  asphalt: 2300,
  water: 1000,
  lava: 2800,
  // Not strips: project materials (`defineMaterial`) and decal/foliage cells.
  custom: 1000,
  decal: 1000,
  foliage: 500,
};

/** One strip row's height, read from the layout so a resized sheet never misfiles triangles. */
const PLAIN = stripRect('plain');
const ROW_H = PLAIN.v1 - PLAIN.v0;

/** Material id at a UV V: a built-in strip, 'custom' (defineMaterial row) or 'decal' (cells). */
export function materialAtV(v: number): string {
  const row = Math.floor(v / ROW_H);
  if (row < 0) return 'plain';
  if (row < STRIPS.length) return STRIPS[row] ?? 'plain';
  return row < STRIP_ROWS ? 'custom' : 'decal';
}

/** Strip of triangle `t` (UV centroid; U decides decal vs foliage in the cell rows). */
export function triangleStrip(uvs: Float32Array, indices: Uint32Array, t: number): string {
  let u = 0;
  let v = 0;
  for (let k = 0; k < 3; k++) {
    const i = indices[t * 3 + k] ?? 0;
    u += (uvs[i * 2] ?? 0) / 3;
    v += (uvs[i * 2 + 1] ?? 0) / 3;
  }
  const id = materialAtV(v);
  return id === 'decal' && u >= 0.5 ? 'foliage' : id;
}

/** Density for a strip with the recipe's overrides applied. */
export const densityOf = (strip: string, overrides?: Readonly<Record<string, number>>): number =>
  overrides?.[strip] ?? DENSITY[strip] ?? 1000;
