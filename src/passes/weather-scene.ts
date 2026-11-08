// The weathering scene: a target mesh analysed once (surface, ground, damp band, fasteners,
// touched spots, lazy exposure) — what selectors, colour effects and deformations all read.

import type { Mesh, Vec3 } from '../core/index.ts';
import { DEFAULT_SUN, exposure } from './weather-exposure.ts';
import type { Scene } from './weather-select.ts';
import { analyse } from './weather-surface.ts';
import type { Spot, WeatheringOptions } from './weather-types.ts';

const DAMP: Readonly<Record<string, number>> = {
  wet: 0.3,
  coastal: 0.25,
  snow: 0.2,
  dry: 0,
  desert: 0,
};

export function sceneOf(
  mesh: Mesh,
  o: WeatheringOptions,
  spots: { fasteners: readonly Spot[]; touched: readonly Spot[]; touchedMask?: Uint8Array },
): Scene {
  const s = analyse(mesh);
  let exp: Float32Array | null = null;
  const sun: Vec3 = o.sun ?? DEFAULT_SUN;
  const ground = o.ground ?? s.minZ;
  return {
    s,
    ground,
    band: o.groundBand ?? 0.35,
    damp: DAMP[o.climate ?? 'dry'] ?? 0,
    fasteners: spots.fasteners,
    touched: spots.touched,
    ...(spots.touchedMask ? { touchedMask: spots.touchedMask } : {}),
    exposure: () => {
      exp ??= exposure(s, sun, 12, ground);
      return exp;
    },
  };
}
