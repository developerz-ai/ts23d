// Public API of /primitives: geometry builders, each emitting the core Mesh IR.

export { type BeamOptions, beam } from './beam.ts';
export { type BoxOptions, box } from './box.ts';
export { type HeightfieldOptions, heightfield } from './heightfield.ts';
export { cylinder, type LatheOptions, lathe } from './lathe.ts';
export { type LoftColor, type LoftOptions, loft, ringXY } from './loft.ts';
export { type PlanarOptions, planar } from './planar.ts';
export { cell, sdf, tiled } from './planned.ts';
export { type PrismOptions, prism } from './prism.ts';
export { type SweepOptions, sweep } from './sweep.ts';
export { arcLengths, type SweepFrame, transportFrames } from './transport.ts';
export { triangulate } from './triangulate.ts';
