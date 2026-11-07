// Lighting looks per gallery category: which procedural environment, how strong, the key light
// (the one that casts shadows), and the backdrop the viewer paints behind the asset. Vehicles and
// hard-surface things get a product studio, characters a warm portrait key with a cool rim, terrain
// and vegetation an outdoor sky with a low sun.

import type { Category } from './items.ts';
import type { EnvPreset } from './lightbox.ts';

type Rgb = readonly [number, number, number];

export interface Look {
  readonly env: EnvPreset;
  /** `scene.environmentIntensity`: the image-based light carries the ambient. */
  readonly envIntensity: number;
  /** Shadow-casting key: linear colour, intensity, direction towards the light (camera frame). */
  readonly key: { readonly rgb: Rgb; readonly intensity: number; readonly dir: Rgb };
  /** Sky/ground hemisphere fill, kept low: the environment does most of the ambient work. */
  readonly hemi: number;
  /** Opacity of the key light's shadow on the invisible floor. */
  readonly shadow: number;
  /** Opacity of the soft baked contact shadow right under the asset. */
  readonly contact: number;
  /** Backdrop gradient, centre → edge (sRGB hex). */
  readonly backdrop: readonly [string, string];
  readonly exposure: number;
}

export const LOOKS: Record<'studio' | 'portrait' | 'outdoor', Look> = {
  studio: {
    env: 'studio',
    envIntensity: 0.5,
    key: { rgb: [1, 0.96, 0.9], intensity: 3.4, dir: [-0.45, 1, 0.75] },
    hemi: 0.06,
    shadow: 0.3,
    contact: 0.75,
    backdrop: ['#f4f5f7', '#c9ced5'],
    exposure: 1,
  },
  portrait: {
    env: 'portrait',
    envIntensity: 1,
    key: { rgb: [1, 0.9, 0.78], intensity: 2.4, dir: [-0.7, 0.85, 0.75] },
    hemi: 0.08,
    shadow: 0.3,
    contact: 0.85,
    backdrop: ['#e4e0da', '#a9a299'],
    exposure: 1.05,
  },
  outdoor: {
    env: 'outdoor',
    envIntensity: 1.2,
    key: { rgb: [1, 0.93, 0.8], intensity: 2.6, dir: [-0.6, 0.75, 0.55] },
    hemi: 0.35,
    shadow: 0.3,
    contact: 0.6,
    backdrop: ['#eef3f8', '#bccbd9'],
    exposure: 1,
  },
};

/** The look a gallery category is shown in. */
export function lookFor(category: Category): Look {
  if (category === 'Characters') return LOOKS.portrait;
  if (category === 'Nature & Terrain') return LOOKS.outdoor;
  return LOOKS.studio;
}
