// Optics of see-through surfaces: the preset per transmissive surface (glass, translucent, ice,
// liquid, jelly) and a recipe's `optics` overrides merged over it, validated with a fix. The GLB
// writes KHR_materials_transmission + _ior + _volume; the beauty render refracts with them.

import { type Colour, fail, lin, range } from './finish.ts';
import type { Surface } from './part.ts';
import type { Vec3 } from './vec.ts';

/** Surfaces that let light through (KHR_materials_transmission + _ior + _volume). */
export type TransmissiveSurface = Exclude<Surface, 'opaque' | 'cutout'>;

/** Override a see-through surface's optics: `optics: { glass: { ior: 1.52, thickness: 0.004 } }`. */
export interface Optics {
  /** Index of refraction (KHR_materials_ior): water 1.33, ice 1.31, glass 1.5, diamond 2.42. */
  readonly ior?: number;
  /** Thickness in metres of the volume behind the surface (KHR_materials_volume). */
  readonly thickness?: number;
  /** Colour white light becomes after `attenuationDistance` metres inside (Beer–Lambert). */
  readonly attenuationColour?: Colour;
  readonly attenuationDistance?: number;
  readonly roughness?: number;
  /** Share of light transmitted 0..1. */
  readonly transmission?: number;
}

export interface ResolvedOptics {
  readonly ior: number;
  readonly thickness: number;
  readonly attenuationColour: Vec3;
  /** 0 = no absorption (glTF: +∞, omitted). */
  readonly attenuationDistance: number;
  readonly roughness: number;
  readonly transmission: number;
  /** baseColorFactor alpha for loaders without transmission (alpha BLEND fallback). */
  readonly alpha: number;
}

export type SurfaceOptics = Readonly<Partial<Record<TransmissiveSurface, Optics>>>;
export type ResolvedSurfaceOptics = Readonly<Partial<Record<TransmissiveSurface, ResolvedOptics>>>;

const WHITE: Vec3 = [1, 1, 1];
/** Presets per surface. glass + translucent equal the shipped GLB materials (export test). */
export const OPTICS: Readonly<Record<TransmissiveSurface, ResolvedOptics>> = {
  glass: {
    ior: 1.5,
    thickness: 0.01,
    attenuationColour: WHITE,
    attenuationDistance: 0,
    roughness: 0.05,
    transmission: 1,
    alpha: 0.25,
  },
  translucent: {
    ior: 1.45,
    thickness: 0.02,
    attenuationColour: WHITE,
    attenuationDistance: 0,
    roughness: 0.35,
    transmission: 0.6,
    alpha: 0.6,
  },
  ice: {
    ior: 1.31,
    thickness: 0.05,
    attenuationColour: [0.72, 0.88, 0.97],
    attenuationDistance: 0.4,
    roughness: 0.18,
    transmission: 0.9,
    alpha: 0.4,
  },
  liquid: {
    ior: 1.33,
    thickness: 0.05,
    attenuationColour: [0.62, 0.86, 0.9],
    attenuationDistance: 1.5,
    roughness: 0.02,
    transmission: 1,
    alpha: 0.2,
  },
  jelly: {
    ior: 1.35,
    thickness: 0.06,
    attenuationColour: WHITE,
    attenuationDistance: 0,
    roughness: 0.25,
    transmission: 0.75,
    alpha: 0.55,
  },
};
export const TRANSMISSIVE: readonly TransmissiveSurface[] = [
  'glass',
  'translucent',
  'ice',
  'liquid',
  'jelly',
];

/** Validate `optics` overrides, each merged over its surface preset (null when none). */
export function opticsOf(
  asset: string,
  optics: SurfaceOptics | undefined,
): ResolvedSurfaceOptics | null {
  const keys = Object.keys(optics ?? {});
  if (!keys.length) return null;
  const out: Partial<Record<TransmissiveSurface, ResolvedOptics>> = {};
  for (const k of keys) {
    const s = TRANSMISSIVE.find((t) => t === k);
    const o = s ? optics?.[s] : undefined;
    if (!s || !o)
      throw fail(
        `optics.${k} in '${asset}' is not a see-through surface`,
        `use one of: ${TRANSMISSIVE.join(', ')}`,
      );
    const w = `'${asset}' optics.${s}`;
    range(`${w}.ior`, o.ior, 1, 3, 'water 1.33, ice 1.31, glass 1.5, diamond 2.42');
    range(
      `${w}.thickness`,
      o.thickness,
      0,
      100,
      'metres of material behind the surface, e.g. 0.004 for a window',
    );
    range(`${w}.attenuationDistance`, o.attenuationDistance, 0, 1e6, 'metres; 0 = no absorption');
    range(`${w}.roughness`, o.roughness, 0, 1, 'use a fraction 0..1');
    range(`${w}.transmission`, o.transmission, 0, 1, 'use a fraction 0..1');
    const p = OPTICS[s];
    out[s] = {
      ...p,
      ...(o.ior !== undefined ? { ior: o.ior } : {}),
      ...(o.thickness !== undefined ? { thickness: o.thickness } : {}),
      ...(o.attenuationColour !== undefined
        ? { attenuationColour: lin(`${w}.attenuationColour`, o.attenuationColour) }
        : {}),
      ...(o.attenuationDistance !== undefined
        ? { attenuationDistance: o.attenuationDistance }
        : {}),
      ...(o.roughness !== undefined ? { roughness: o.roughness } : {}),
      ...(o.transmission !== undefined ? { transmission: o.transmission } : {}),
    };
  }
  return out;
}
