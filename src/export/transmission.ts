// Skin in the GLB: a finish named `skin` / `skin_*` (the same contract the path tracer reads,
// render/path/classes.ts) also writes KHR_materials_diffuse_transmission, so engines that support
// it let light that enters thin skin (ears, nostrils, fingers, a creature's wing membrane) scatter
// out the far side warm-red, plus KHR_materials_volume (thickness + attenuation) for the depth it
// travels. Listed in extensionsUsed only, never required: a loader without them shows plain PBR.

import type { Json } from './bin-writer.ts';
import { VOLUME } from './pbr.ts';

export const DIFFUSE_TRANSMISSION = 'KHR_materials_diffuse_transmission';

/** A finish name that marks skin (shared contract with the path tracer). */
export const SKIN_FINISH = /^skin(_|$)/;

export const isSkinFinish = (name: string): boolean => SKIN_FINISH.test(name);

export interface DiffuseTransmission {
  /** Share of the diffuse light transmitted through the surface, 0..1. */
  readonly factor: number;
  /** Tint of the transmitted light (linear RGB). */
  readonly colour: readonly [number, number, number];
  /** Typical thickness of the zone, metres (KHR_materials_volume thicknessFactor). */
  readonly thickness: number;
  /** Distance, metres, over which white light inside becomes `attenuationColour`. */
  readonly attenuationDistance: number;
  readonly attenuationColour: readonly [number, number, number];
}

/**
 * Human-scale skin: about a third of diffuse light passes a thin ear or nostril wing, reddened by
 * blood (the same red-first ordering as the path tracer's Burley mean free paths).
 */
export const SKIN_TRANSMISSION: DiffuseTransmission = {
  factor: 0.3,
  colour: [1, 0.45, 0.3],
  thickness: 0.004,
  attenuationDistance: 0.004,
  attenuationColour: [0.85, 0.32, 0.22],
};

/** `m` with diffuse transmission + volume added (other extensions kept). */
export function withDiffuseTransmission(m: Json, t: DiffuseTransmission = SKIN_TRANSMISSION): Json {
  return {
    ...m,
    extensions: {
      ...((m['extensions'] as Json | undefined) ?? {}),
      [DIFFUSE_TRANSMISSION]: {
        diffuseTransmissionFactor: t.factor,
        diffuseTransmissionColorFactor: [...t.colour],
      },
      [VOLUME]: {
        thicknessFactor: t.thickness,
        attenuationDistance: t.attenuationDistance,
        attenuationColor: [...t.attenuationColour],
      },
    },
  };
}
