// Acoustic material table for modal synthesis: Young's modulus E, density ρ (→ bending wave
// speed √(E/ρ)), an effective loss factor η (internal damping raised to include radiation and
// mounting, so a struck prop rings for game length, not lab length) and contact hardness (how
// high a strike excites). Sources and reasoning: docs/idea/17-sound.md#materials.
// Strip ids from the trim sheet (iron_cast, steel_painted, wood_painted…) resolve via ALIASES.

import { Ts23dError } from '../core/index.ts';

export interface Acoustic {
  /** Young's modulus, Pa. */
  readonly E: number;
  /** Density, kg/m³. */
  readonly rho: number;
  /** Effective loss factor (dimensionless): mode decay τ = 1 / (π f η). */
  readonly eta: number;
  /** Contact cutoff (Hz) of a firm strike: rubber is dull, glass is bright. */
  readonly hardness: number;
}

export const ACOUSTICS = {
  steel: { E: 200e9, rho: 7850, eta: 0.0012, hardness: 9000 },
  cast_iron: { E: 110e9, rho: 7200, eta: 0.004, hardness: 8000 },
  brass: { E: 100e9, rho: 8500, eta: 0.001, hardness: 8000 },
  aluminium: { E: 69e9, rho: 2700, eta: 0.0018, hardness: 8000 },
  oak: { E: 12e9, rho: 750, eta: 0.012, hardness: 3000 },
  pine: { E: 9e9, rho: 500, eta: 0.016, hardness: 2500 },
  glass: { E: 70e9, rho: 2500, eta: 0.0015, hardness: 10000 },
  ceramic: { E: 70e9, rho: 2400, eta: 0.004, hardness: 9000 },
  stone: { E: 50e9, rho: 2650, eta: 0.01, hardness: 6000 },
  concrete: { E: 30e9, rho: 2400, eta: 0.02, hardness: 4500 },
  rubber: { E: 0.05e9, rho: 1100, eta: 0.2, hardness: 400 },
  plastic: { E: 2.5e9, rho: 1050, eta: 0.03, hardness: 2500 },
} as const satisfies Record<string, Acoustic>;

export type AcousticMaterial = keyof typeof ACOUSTICS;

/** Trim-sheet strip ids → the acoustic entry that sounds like them. */
const ALIASES: Readonly<Record<string, AcousticMaterial>> = {
  iron: 'cast_iron',
  iron_cast: 'cast_iron',
  iron_rust: 'cast_iron',
  steel_painted: 'steel',
  steel_galvanised: 'steel',
  chrome: 'steel',
  copper: 'brass',
  wood: 'pine',
  wood_painted: 'pine',
  wood_weathered: 'pine',
  bark_oak: 'oak',
  brick: 'ceramic',
  slate: 'stone',
  cobblestone: 'stone',
  rock_strata: 'stone',
  cliff: 'stone',
  ice: 'glass',
};

export function acousticOf(material: string): Acoustic & { readonly id: AcousticMaterial } {
  const id = (material in ACOUSTICS ? material : ALIASES[material]) as AcousticMaterial | undefined;
  if (id === undefined)
    throw new Ts23dError('T3D_AUDIO_MATERIAL', {
      cause: `no acoustic data for material '${material}'`,
      fix: `use one of ${Object.keys(ACOUSTICS).join(', ')} (or a strip id: ${Object.keys(ALIASES).join(', ')})`,
    });
  return { id, ...ACOUSTICS[id] };
}

/** Bending-wave speed scale √(E/ρ), m/s. */
export const waveSpeed = (a: Acoustic): number => Math.sqrt(a.E / a.rho);
