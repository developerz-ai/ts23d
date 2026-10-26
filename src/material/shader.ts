// Engine shader sources for the trim-sheet material: per-asset effects that stay on the one shared
// material — vertex-colour tint, wind sway, night window glow, wear/grime. Both functions return
// plain source strings (a three.js TSL module, a Godot 4 .gdshader). They are STARTING POINTS an
// engine project loads and owns, not runtime dependencies: ts23d never imports three or Godot.
//
// Shared conventions both sources implement:
//   tint      albedo.rgb × COLOR_0.rgb (linear), alpha from albedo.a (cutout leaf masks)
//   ORM       R occlusion · G roughness · B metalness (one texture, as the GLB binds it)
//   wind      weight from the `_WIND` vertex attribute (three: `_wind`) or, by default, the
//             mesh-local height (authored Z-up), smoothstep(0, wind.height, z); sway in local XY
//   glow      emissive on window panes: window_sash/porthole texels darker than luma 0.3, and the
//             whole glass strip; a world-space 1.5 m hash lights `ratio` of windows; × `night`
//   wear      darkens + roughens cavities (1 − AO) and the first `grimeHeight` metres of world height

import type { Surface } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import { godotSource } from './shader-godot.ts';
import { threeSource } from './shader-three.ts';
import { cellRect, stripRect, type UvRect } from './trim-sheet.ts';

export interface ShaderHints {
  /** Vertex sway for vegetation. Weight from the `_WIND` attribute or mesh-local height. */
  readonly wind?: {
    readonly strength: number;
    readonly source?: 'attribute' | 'height';
    /** Metres of height at which sway reaches full weight (height source). Default 4. */
    readonly height?: number;
    readonly hz?: number;
  };
  /** Emissive mask on window cells at night: `ratio` of windows lit. */
  readonly windowGlow?: {
    readonly color: string;
    readonly ratio: number;
    readonly intensity?: number;
  };
  /** Wear/grime mask strength 0..1 and how high ground grime climbs (metres). */
  readonly wear?: { readonly amount: number; readonly grimeHeight?: number };
  /** The surface the material is for: 'cutout' adds alpha test + double-sided. */
  readonly surface?: Surface;
}

/** Resolved, validated numbers both emitters print. */
export interface ShaderParams {
  readonly windStrength: number;
  readonly windAttribute: boolean;
  readonly windHeight: number;
  readonly windHz: number;
  readonly glow: readonly [number, number, number];
  readonly glowRatio: number;
  readonly glowIntensity: number;
  readonly wear: number;
  readonly grimeHeight: number;
  readonly cutout: boolean;
  readonly blend: boolean;
  readonly glowRects: readonly UvRect[];
  readonly glassRect: UvRect;
}

function fail(cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `shader hints: ${cause}`, fix });
}

function srgbHex(value: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) fail(`colour '${value}'`, "use '#rrggbb' sRGB hex");
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function resolveHints(h: ShaderHints): ShaderParams {
  const unit = (v: number, what: string): number =>
    Number.isFinite(v) && v >= 0 && v <= 1 ? v : fail(`${what} is ${v}`, `${what} is 0..1`);
  const pos = (v: number, what: string): number =>
    Number.isFinite(v) && v > 0 ? v : fail(`${what} is ${v}`, `${what} is a positive number`);
  const strength = h.wind ? pos(h.wind.strength, 'wind.strength') : 0;
  return {
    windStrength: strength,
    windAttribute: h.wind?.source === 'attribute',
    windHeight: pos(h.wind?.height ?? 4, 'wind.height'),
    windHz: pos(h.wind?.hz ?? 0.4, 'wind.hz'),
    glow: h.windowGlow ? srgbHex(h.windowGlow.color) : [1, 0.75, 0.4],
    glowRatio: h.windowGlow ? unit(h.windowGlow.ratio, 'windowGlow.ratio') : 0,
    glowIntensity: pos(h.windowGlow?.intensity ?? 2, 'windowGlow.intensity'),
    wear: h.wear ? unit(h.wear.amount, 'wear.amount') : 0,
    grimeHeight: pos(h.wear?.grimeHeight ?? 0.6, 'wear.grimeHeight'),
    cutout: h.surface === 'cutout',
    blend: h.surface === 'glass' || h.surface === 'translucent',
    glowRects: [cellRect('window_sash'), cellRect('porthole')],
    glassRect: stripRect('glass'),
  };
}

/** A three.js (r18x, WebGPU/TSL) TypeScript module: `createTrimMaterial(maps)` + `upgradeTrimMaterials(root)`. */
export function threeMaterialSource(hints: ShaderHints = {}): string {
  return threeSource(resolveHints(hints));
}

/** A Godot 4 spatial shader (.gdshader) with the same features and uniform names. */
export function godotShaderSource(hints: ShaderHints = {}): string {
  return godotSource(resolveHints(hints));
}
