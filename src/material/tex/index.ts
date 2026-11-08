// The texture DSL namespace: `tex.noise(…).warp(…).levels(…)`, stamps, masks, colour ramps and
// `tex.material({...})` for `defineMaterial({ graph })`. Typed, deterministic, tileable along U
// by construction; docs/architecture/materials.md#texture-graphs has worked examples.

import { colour, ramp } from './colour.ts';
import { constant } from './field.ts';
import { cells, fn, gradientV, noise, ridged } from './generators.ts';
import { material } from './graph.ts';
import { blend, cavity, edgeWear, heightBlend } from './masks.ts';
import { bricks, pebbles, planks, scatter, strata, tiles } from './stamps.ts';
import { scales, strands } from './stamps-organic.ts';

export type { ColourField, ColourInput, Stop } from './colour.ts';
export { type Input, type TexContext, TexField } from './field.ts';
export type { CellsOptions, NoiseOptions } from './generators.ts';
export { type MaterialGraph, paintGraph, probeGraph } from './graph.ts';
export type { EdgeWearOptions } from './masks.ts';
export type { BondOptions, ScatterOptions, Stamp, StrataOptions } from './stamps.ts';
export type { ScalesOptions, StrandsOptions } from './stamps-organic.ts';

/** Texture graph builders (Substance-Designer-style nodes as plain functions). */
export const tex = {
  constant,
  noise,
  ridged,
  cells,
  gradientV,
  fn,
  bricks,
  tiles,
  planks,
  scatter,
  pebbles,
  strata,
  scales,
  strands,
  colour,
  ramp,
  edgeWear,
  cavity,
  heightBlend,
  blend,
  material,
} as const;
