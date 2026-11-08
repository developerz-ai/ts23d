// The material definition contract: what a project (or the house library) says about a strip —
// PBR numbers, intrinsic colour, a base painter kind and an optional painter layer — and its
// translation to the sheet's StripRecipe. Validation throws T3D_MATERIAL_INVALID with the fix
// (a texture graph is probe-painted here, so a non-tileable or out-of-range graph fails at define).

import { Ts23dError, type Vec3 } from '../core/index.ts';
import type { MaterialPainter, StripKind, StripRecipe } from './paint/types.ts';
import { hex } from './palette.ts';
import { type MaterialGraph, probeGraph } from './tex/graph.ts';
import { type TextureSource, validateTexture } from './texture-source.ts';

export interface MaterialDef {
  /** snake_case, unique; becomes the strip id recipes pass as `strip`. */
  readonly id: string;
  /** Base painter the strip starts from. Default 'noise' (a quiet surface). */
  readonly kind?: StripKind;
  /** World metres the strip's V span represents (typical face height). Default 1. */
  readonly scaleMetres?: number;
  /** Perceptual roughness 0..1 (glTF): 0 mirror, 1 chalk. */
  readonly roughness: number;
  /** 0 dielectric, 1 metal. Default 0. Avoid in-between values except for dirt/oxide blends. */
  readonly metalness?: number;
  /** Intrinsic base colour: sRGB '#rrggbb' or linear RGB. Default white (vertex colour = hue). */
  readonly albedo?: string | Vec3;
  /** Second colour the painter blends to (latewood, rust, verdigris, bare wood under paint). */
  readonly albedo2?: string | Vec3;
  /** Painter knobs for `kind` (see each painter's header in src/material/paint/). */
  readonly params?: Readonly<Record<string, number>>;
  /** Your own layer, painted after `kind`: write height/tone/rough/metal/mix per texel. */
  readonly paint?: MaterialPainter;
  /** Paint from a CC0 texture set (opt-in, needs `bun run textures`) instead of `kind`. */
  readonly texture?: TextureSource;
  /** Paint from a texture graph (`tex.material({...})`) instead of `kind`. */
  readonly graph?: MaterialGraph;
  /** World metres the strip spans along U before it repeats (custom strips; default 4). */
  readonly spanMetres?: number;
  /** 0..1 rubbed convex edges (lighter, smoother, albedo2 shows through). Same as params.wear. */
  readonly wear?: number;
  /** 0..1 grime, darkening and roughening with age. Same as params.age. */
  readonly age?: number;
  /** 0..1 wetness: darker porous albedo, glossier, puddles in low spots past 0.5. Same as params.wet. */
  readonly wet?: number;
  readonly description?: string;
  /** Where the numbers come from (URLs). */
  readonly sources?: readonly string[];
}

const ID = /^[a-z][a-z0-9_]{1,31}$/;
const unit = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;

function fail(id: string, cause: string, fix: string): never {
  throw new Ts23dError('T3D_MATERIAL_INVALID', { cause: `material '${id}': ${cause}`, fix });
}

function colour(id: string, key: string, v: string | Vec3 | undefined): Vec3 | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') {
    if (!/^#?[0-9a-fA-F]{6}$/.test(v))
      fail(id, `${key} '${v}' is not a hex colour`, "use '#rrggbb'");
    return hex(v);
  }
  if (!(v.length === 3 && v.every(unit)))
    fail(id, `${key} [${v}] is not linear RGB 0..1`, "use '#rrggbb' or three numbers in 0..1");
  return v;
}

/** Validate a definition and turn it into the strip recipe the sheet painter runs. */
export function toStripRecipe(d: MaterialDef): StripRecipe {
  const id = String(d.id);
  if (!ID.test(id))
    fail(id, 'id is not snake_case (2–32 chars, starts with a letter)', "e.g. 'teak_deck'");
  if (!unit(d.roughness)) fail(id, `roughness ${d.roughness}`, 'roughness is 0..1');
  if (d.metalness !== undefined && !unit(d.metalness))
    fail(id, `metalness ${d.metalness}`, 'metalness is 0..1 (0 dielectric, 1 metal)');
  const scale = d.scaleMetres ?? 1;
  if (!(Number.isFinite(scale) && scale > 0))
    fail(id, `scaleMetres ${scale}`, 'scaleMetres is the face height in metres, > 0');
  if (d.paint !== undefined && typeof d.paint !== 'function')
    fail(id, 'paint is not a function', 'paint is (surface, kit) => void');
  for (const [k, v] of Object.entries(d.params ?? {}))
    if (!Number.isFinite(v)) fail(id, `params.${k} is ${v}`, 'params are finite numbers');
  if (d.texture) validateTexture(id, d.texture);
  for (const k of ['wear', 'age', 'wet'] as const)
    if (d[k] !== undefined && !unit(d[k] ?? 0)) fail(id, `${k} ${d[k]}`, `${k} is 0..1`);
  const span = d.spanMetres ?? 4;
  if (!(Number.isFinite(span) && span >= 0.5 && span <= 64))
    fail(
      id,
      `spanMetres ${span}`,
      'spanMetres is 0.5..64 m (how far the strip runs along U before repeating)',
    );
  if (d.graph && d.texture)
    fail(
      id,
      'both graph and texture are set',
      'paint from one source: a tex graph or a CC0 texture',
    );
  if (d.graph) probeGraph(d.graph, span, scale, `material '${id}'`);
  const weather = {
    ...(d.wear !== undefined ? { wear: d.wear } : {}),
    ...(d.age !== undefined ? { age: d.age } : {}),
    ...(d.wet !== undefined ? { wet: d.wet } : {}),
  };
  const params = d.params || Object.keys(weather).length ? { ...d.params, ...weather } : undefined;
  const albedo = colour(id, 'albedo', d.albedo);
  const albedo2 = colour(id, 'albedo2', d.albedo2);
  return {
    kind: d.kind ?? (d.graph ? 'flat' : 'noise'),
    scaleMetres: scale,
    roughness: d.roughness,
    ...(d.metalness !== undefined ? { metalness: d.metalness } : {}),
    ...(params ? { params } : {}),
    ...(albedo ? { albedo } : {}),
    ...(albedo2 ? { albedo2 } : {}),
    ...(d.paint ? { paint: d.paint } : {}),
    ...(d.texture ? { texture: d.texture } : {}),
    ...(d.graph ? { graph: d.graph } : {}),
  };
}
