// Public API of @ts23d/primitives: geometry builders, each emitting the core Mesh IR.

export { type BoxOptions, box } from './box.ts';
export { cylinder, type LatheOptions, lathe } from './lathe.ts';
export { beam, cell, loft, prism, sdf, sweep, tiled } from './planned.ts';
