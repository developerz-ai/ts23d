// The (at most) four shared materials, one per Surface in use. All sample the same trim sheet and
// take tint from COLOR_0, so batching holds; only the shading model differs. Glass/translucent use
// KHR_materials_transmission + _volume + _ior (three, Babylon, glTFast); engines without them fall
// back to alpha BLEND via baseColorFactor.a. With a painted sheet bound (textures.ts), every
// material samples it: baseColor (sRGB, alpha = cutout mask), normal, and ORM in both the
// occlusion and metallicRoughness slots. Opaque/cutout factors go to 1 so the ORM texture rules;
// glass/translucent keep theirs as multipliers (clear stays clear whatever strip it maps).

import type { Surface } from '../core/index.ts';
import type { Json } from './bin-writer.ts';

const MATERIALS: Readonly<Record<Surface, Json>> = {
  opaque: {
    name: 'ts23d_trim',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 0.8,
    },
  },
  cutout: {
    name: 'ts23d_trim_cutout',
    alphaMode: 'MASK',
    alphaCutoff: 0.5,
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
  },
  glass: {
    name: 'ts23d_glass',
    alphaMode: 'BLEND',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 0.25],
      metallicFactor: 0,
      roughnessFactor: 0.05,
    },
    extensions: {
      KHR_materials_transmission: { transmissionFactor: 1 },
      KHR_materials_volume: { thicknessFactor: 0.01 },
      KHR_materials_ior: { ior: 1.5 },
    },
  },
  translucent: {
    name: 'ts23d_translucent',
    alphaMode: 'BLEND',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 0.6],
      metallicFactor: 0,
      roughnessFactor: 0.35,
    },
    extensions: {
      KHR_materials_transmission: { transmissionFactor: 0.6 },
      KHR_materials_volume: { thicknessFactor: 0.02 },
      KHR_materials_ior: { ior: 1.45 },
    },
  },
};

const ORDER: readonly Surface[] = ['opaque', 'cutout', 'glass', 'translucent'];

/** The same material sampling the sheet (texture indices fixed by textures.ts). */
function textured(m: Json, surface: Surface): Json {
  const pbr = m['pbrMetallicRoughness'] as Json;
  const own = surface === 'opaque' || surface === 'cutout';
  return {
    ...m,
    pbrMetallicRoughness: {
      ...pbr,
      baseColorTexture: { index: 0 },
      metallicRoughnessTexture: { index: 2 },
      ...(own ? { metallicFactor: 1, roughnessFactor: 1 } : {}),
    },
    normalTexture: { index: 1 },
    occlusionTexture: { index: 2 },
  };
}

/** Materials for the surfaces present, plus each surface's index and the extensions used. */
export function materialsFor(
  used: ReadonlySet<Surface>,
  withSheet = false,
): {
  materials: Json[];
  index: Map<Surface, number>;
  extensionsUsed: string[];
} {
  const present = ORDER.filter((s) => s === 'opaque' || used.has(s));
  const index = new Map(present.map((s, i) => [s, i] as const));
  const ext = new Set<string>();
  for (const s of present)
    for (const e of Object.keys((MATERIALS[s]['extensions'] as Json | undefined) ?? {})) ext.add(e);
  const materials = present.map((s) => (withSheet ? textured(MATERIALS[s], s) : MATERIALS[s]));
  return { materials, index, extensionsUsed: [...ext].sort() };
}
