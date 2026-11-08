// Public API of /primitives: geometry builders, each emitting the core Mesh IR.

export { type BeamOptions, beam } from './beam.ts';
export { type BoxOptions, box } from './box.ts';
export { type CellOptions, cell } from './cell.ts';
export { type ErosionOptions, hydraulicErosion } from './erosion.ts';
export { type HeightfieldOptions, heightfield } from './heightfield.ts';
export { cylinder, type LatheOptions, lathe } from './lathe.ts';
export { type LatticeOptions, lattice, type TrussPattern } from './lattice.ts';
export { type LoftColor, type LoftOptions, loft, ringXY } from './loft.ts';
export type { SectionKind } from './member.ts';
export {
  billow,
  type FractalOptions,
  fbm,
  gradientNoise2,
  type Noise2,
  ridged,
  terrace,
  valueNoise2,
  warp,
} from './noise.ts';
export { type PlanarOptions, planar } from './planar.ts';
export { type PrismOptions, prism } from './prism.ts';
export {
  type SculptEdit,
  type SculptField,
  type SculptFieldEdit,
  type SculptOptions,
  type SculptShape,
  sculpt,
  sculptField,
} from './sculpt.ts';
export { type SdfColor, type SdfOptions, sdf } from './sdf.ts';
export { type Field, sd } from './sdf-ops.ts';
export {
  type FieldSolid,
  polygonSdf,
  type SilhouetteOptions,
  visualHull,
} from './sdf-silhouette.ts';
export { type SvgOptions, type SvgShape, svgShape } from './svg-doc.ts';
export { type ExtrudeSvgOptions, extrudeSvg, type SvgView } from './svg-extrude.ts';
export { type LatheSvgOptions, latheSvg } from './svg-lathe.ts';
export { parsePath, type SvgContour } from './svg-path.ts';
export { type SweepOptions, sweep } from './sweep.ts';
export { type TerrainColorOptions, type TerrainPalette, terrainColor } from './terrain-color.ts';
export {
  sampler,
  slopeMap,
  type TerrainGrid,
  type TerrainGridOptions,
  type ThermalOptions,
  terrainGrid,
  thermalErosion,
} from './terrain-grid.ts';
export {
  type MeasureOptions,
  measureText,
  type TextFont,
  type TextOptions,
  text,
} from './text.ts';
export { type TiledOptions, tiled } from './tiled.ts';
export { arcLengths, type SweepFrame, transportFrames } from './transport.ts';
export { triangulate } from './triangulate.ts';
export { valueNoise } from './value-noise.ts';
export { applyWarp, type WarpOptions, warpTPS } from './warp.ts';
export { type Tps, type TpsOptions, tpsWarp } from './warp-solve.ts';
