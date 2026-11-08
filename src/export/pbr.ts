// glTF PBR extensions from resolved finishes and optics: KHR_materials_clearcoat, _sheen,
// _anisotropy, _iridescence, _specular on opaque materials and _transmission + _ior + _volume on
// see-through ones (all Khronos Ratified). Pure JSON builders over a base material; listed in
// extensionsUsed only, never required: a loader without one still shows the base PBR material.

import type { ResolvedFinish, ResolvedOptics, TransmissiveSurface } from '../core/index.ts';
import type { Json } from './bin-writer.ts';

export const CLEARCOAT = 'KHR_materials_clearcoat';
export const SHEEN = 'KHR_materials_sheen';
export const ANISOTROPY = 'KHR_materials_anisotropy';
export const IRIDESCENCE = 'KHR_materials_iridescence';
export const SPECULAR = 'KHR_materials_specular';
export const TRANSMISSION = 'KHR_materials_transmission';
export const VOLUME = 'KHR_materials_volume';
export const IOR = 'KHR_materials_ior';

/** The extension blocks a finish adds (empty object: none). */
export function finishExtensions(f: ResolvedFinish): Json {
  return {
    ...(f.clearcoat !== undefined
      ? {
          [CLEARCOAT]: {
            clearcoatFactor: f.clearcoat,
            clearcoatRoughnessFactor: f.clearcoatRoughness ?? 0.03,
          },
        }
      : {}),
    ...(f.sheen
      ? {
          [SHEEN]: {
            sheenColorFactor: [...f.sheen.colour],
            sheenRoughnessFactor: f.sheen.roughness,
          },
        }
      : {}),
    ...(f.anisotropy
      ? {
          [ANISOTROPY]: {
            anisotropyStrength: f.anisotropy.strength,
            anisotropyRotation: f.anisotropy.rotation,
          },
        }
      : {}),
    ...(f.iridescence
      ? {
          [IRIDESCENCE]: {
            iridescenceFactor: f.iridescence.factor,
            iridescenceIor: f.iridescence.ior,
            iridescenceThicknessMinimum: f.iridescence.thickness[0],
            iridescenceThicknessMaximum: f.iridescence.thickness[1],
          },
        }
      : {}),
    ...(f.specular
      ? {
          [SPECULAR]: {
            specularFactor: f.specular.factor,
            specularColorFactor: [...f.specular.colour],
          },
        }
      : {}),
  };
}

/**
 * `base` with the finish applied. Declared metallic/roughness become factors and replace the
 * sheet's metallicRoughness texture (occlusion stays); `extras.ts23d.ownFactors` tells viewers that
 * bind the sheet themselves (the gallery) to keep them.
 */
export function withFinish(base: Json, f: ResolvedFinish): Json {
  const ext = finishExtensions(f);
  const own = f.metallic !== undefined || f.roughness !== undefined;
  const pbr = base['pbrMetallicRoughness'] as Json;
  const { metallicRoughnessTexture: _orm, ...rest } = pbr;
  return {
    ...base,
    ...(own
      ? {
          pbrMetallicRoughness: {
            ...rest,
            metallicFactor: f.metallic ?? 0,
            roughnessFactor: f.roughness ?? 0.5,
          },
          extras: { ts23d: { ownFactors: true } },
        }
      : {}),
    ...(Object.keys(ext).length
      ? { extensions: { ...((base['extensions'] as Json | undefined) ?? {}), ...ext } }
      : {}),
  };
}

/** The material of a see-through surface (untextured; materials.ts binds the sheet). */
export function opticsMaterial(surface: TransmissiveSurface, o: ResolvedOptics): Json {
  const absorbs = o.attenuationDistance > 0;
  return {
    name: `ts23d_${surface}`,
    alphaMode: 'BLEND',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, o.alpha],
      metallicFactor: 0,
      roughnessFactor: o.roughness,
    },
    extensions: {
      [TRANSMISSION]: { transmissionFactor: o.transmission },
      [VOLUME]: {
        thicknessFactor: o.thickness,
        ...(absorbs
          ? {
              attenuationDistance: o.attenuationDistance,
              attenuationColor: [...o.attenuationColour],
            }
          : {}),
      },
      [IOR]: { ior: o.ior },
    },
  };
}

/** Every extension any of `materials` uses, sorted. */
export function materialExtensions(materials: readonly Json[]): string[] {
  const used = new Set<string>();
  for (const m of materials)
    for (const e of Object.keys((m['extensions'] as Json | undefined) ?? {})) used.add(e);
  return [...used].sort();
}
