// The weathering vocabulary: effect options (random · where · how · %), climates and the age
// dial, and how a climate + age turn into concrete effects when the recipe leaves them out.

import type { Lod, Vec3 } from '../core/index.ts';

/** A surface effect painted into vertex colour over `amount` of the `where` surface. */
export interface CoverEffect {
  /** Selector expression over geometry: 'up-facing', 'shaded & wet', 'convex-edges | touched'. */
  readonly where?: string;
  /** Fraction (0..1) of the eligible area covered; omitted = the effect's default × `age`. */
  readonly amount?: number;
  /** Colour the covered surface moves toward (linear RGB); each effect has a default. */
  readonly color?: Vec3;
  /** 0..1 how far it moves there. */
  readonly strength?: number;
}

export interface RustEffect extends CoverEffect {
  /** Trace orange-brown streaks downhill from the rusted area (gravity on the surface). */
  readonly streaks?: boolean;
  /** Longest streak, metres. Default 0.35. */
  readonly streakLength?: number;
}

export interface DentEffect {
  readonly where?: string;
  /** Inclusive range of dents pressed into the target. Default [1, 3]. */
  readonly count?: readonly [number, number];
  /** Deepest dent, metres. Default 0.008. */
  readonly depth?: number;
  /** Dent radius, metres. Default 0.08. */
  readonly radius?: number;
}

export interface SpanEffect {
  readonly where?: string;
  /** Largest displacement, metres (sag ∝ span², capped here). */
  readonly max?: number;
}

export interface WeatherEffects {
  readonly chips?: CoverEffect;
  readonly rust?: RustEffect;
  readonly dust?: CoverEffect;
  readonly moss?: CoverEffect;
  readonly scratches?: CoverEffect;
  readonly mud?: CoverEffect;
  readonly bleach?: CoverEffect;
  readonly dents?: DentEffect;
  readonly sag?: SpanEffect;
  readonly warp?: SpanEffect;
}

export type Climate = 'dry' | 'wet' | 'coastal' | 'snow' | 'desert';

/** A spot in the target's space: a bolt head, a handle grip. */
export interface Spot {
  readonly at: Vec3;
  readonly radius?: number;
}

export interface WeatheringOptions {
  /** Label in the report and manifest. Default 'weather'. */
  readonly name?: string;
  readonly seed?: number;
  /** 0 = new, 1 = decades outdoors. Scales default amounts. Default 0.5. */
  readonly age?: number;
  /** Adds the climate's typical effects (explicit `effects` win). */
  readonly climate?: Climate;
  readonly effects?: WeatherEffects;
  /** Mesh form only: the LOD being built (ctx form reads ctx.lod). Default 0. */
  readonly lod?: Lod;
  /** Longest edge (m) after tessellation per LOD; 0 = keep the mesh. Default [0.04, 0.1, 0]. */
  readonly resolution?: number | readonly [number, number, number];
  /** Fastener spots — or, in the ctx form, part-name globs ('bolt_*'). */
  readonly fasteners?: readonly (Spot | string)[];
  /** Touched spots or part globs ('handle_*'): scratches, polish. */
  readonly touched?: readonly (Spot | string)[];
  /** Ground height (z). Default: the lowest point of the target. */
  readonly ground?: number;
  /** Height of the splash / damp band above the ground, metres. Default 0.35. */
  readonly groundBand?: number;
  /** Direction toward the sun (shade, bleach). Default from the back-left, high. */
  readonly sun?: Vec3;
  /** What chips reveal (linear RGB). Default bare steel. */
  readonly under?: Vec3;
  /** Allowed |actual − amount| per coverage effect. Default 0.02. */
  readonly tolerance?: number;
}

/** Coverage effects in the order they are laid down: fade, wear through, stain, grow, deposit. */
export const COVER_ORDER = ['bleach', 'chips', 'scratches', 'rust', 'moss', 'mud', 'dust'] as const;
export type CoverName = (typeof COVER_ORDER)[number];

export const DEFAULT_WHERE: Readonly<Record<keyof WeatherEffects, string>> = {
  chips: 'convex-edges',
  rust: 'below-fasteners | fasteners',
  dust: 'up-facing',
  moss: 'shaded & wet & !down-facing',
  scratches: 'touched',
  mud: 'ground-near',
  bleach: 'up-facing | sunlit',
  dents: 'exposed-panels',
  sag: 'long-spans',
  warp: 'long-spans',
};

/** Coverage at age 1 when `amount` is omitted (scaled linearly by age). */
export const DEFAULT_AMOUNT: Readonly<Record<CoverName, number>> = {
  chips: 0.3,
  rust: 0.25,
  dust: 0.5,
  moss: 0.3,
  scratches: 0.15,
  mud: 0.4,
  bleach: 0.4,
};

const CLIMATES: Readonly<Record<Climate, WeatherEffects>> = {
  dry: { dust: {}, bleach: {}, chips: {}, scratches: {} },
  wet: { rust: { streaks: true }, moss: {}, mud: {}, chips: {} },
  coastal: { rust: { streaks: true }, bleach: {}, chips: {}, dust: { color: [0.8, 0.8, 0.78] } },
  snow: { rust: { streaks: true }, mud: {}, chips: {}, bleach: {} },
  desert: { dust: {}, bleach: {}, chips: {}, mud: { color: [0.55, 0.42, 0.27] } },
};

/** Climate defaults under the recipe's explicit effects (explicit keys win, field by field). */
export function effectsOf(o: WeatheringOptions): WeatherEffects {
  const base = o.climate ? CLIMATES[o.climate] : {};
  const mine = o.effects ?? {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_WHERE) as (keyof WeatherEffects)[]) {
    const b = base[k];
    const m = mine[k];
    if (b || m) out[k] = { ...(b ?? {}), ...(m ?? {}) };
  }
  return out as WeatherEffects;
}

export const resolutionOf = (o: WeatheringOptions, lod: Lod): number => {
  const r = o.resolution ?? [0.04, 0.1, 0];
  return typeof r === 'number' ? (lod === 2 ? 0 : r) : (r[lod] ?? 0);
};
