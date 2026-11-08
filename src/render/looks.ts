// What each part's material IS for the beauty render, mirroring the GLB: see-through optics
// (surface preset + the asset's `optics`), a lacquered paint slot's clearcoat/flake, or a named
// finish (sheen, anisotropy, iridescence, specular, factors). One small table, one index per part.

import {
  type CompiledAsset,
  OPTICS,
  type Part,
  type ResolvedFinish,
  type TransmissiveSurface,
} from '../core/index.ts';

export interface Look {
  /** 0 = opaque; else KHR_materials_transmission factor. */
  readonly transmission: number;
  readonly ior: number;
  /** Volume thickness, metres (refraction offset and absorption path). */
  readonly thickness: number;
  /** Beer–Lambert extinction per metre, per channel (0 = clear). */
  readonly absorb: readonly [number, number, number];
  /** Factor overrides; −1 = take it from the sheet's ORM. */
  readonly roughness: number;
  readonly metallic: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly sheen: readonly [number, number, number];
  readonly sheenRoughness: number;
  readonly anisotropy: number;
  readonly anisotropyRotation: number;
  readonly iridescence: number;
  readonly iridescenceIor: number;
  /** nm; glTF uses the maximum when no thickness texture is bound. */
  readonly iridescenceThickness: number;
  /** KHR_materials_specular factor and colour (dielectric F0 scale). */
  readonly specular: number;
  readonly specularColour: readonly [number, number, number];
}

export const OPAQUE: Look = {
  transmission: 0,
  ior: 1.5,
  thickness: 0,
  absorb: [0, 0, 0],
  roughness: -1,
  metallic: -1,
  clearcoat: 0,
  clearcoatRoughness: 0,
  sheen: [0, 0, 0],
  sheenRoughness: 0,
  anisotropy: 0,
  anisotropyRotation: 0,
  iridescence: 0,
  iridescenceIor: 1.3,
  iridescenceThickness: 0,
  specular: 1,
  specularColour: [1, 1, 1],
};

function finishLook(f: ResolvedFinish): Look {
  return {
    ...OPAQUE,
    roughness: f.roughness ?? -1,
    metallic: f.metallic ?? -1,
    clearcoat: f.clearcoat ?? 0,
    clearcoatRoughness: f.clearcoatRoughness ?? 0.03,
    sheen: f.sheen?.colour ?? [0, 0, 0],
    sheenRoughness: f.sheen?.roughness ?? 0,
    anisotropy: f.anisotropy?.strength ?? 0,
    anisotropyRotation: f.anisotropy?.rotation ?? 0,
    iridescence: f.iridescence?.factor ?? 0,
    iridescenceIor: f.iridescence?.ior ?? 1.3,
    iridescenceThickness: f.iridescence?.thickness[1] ?? 0,
    specular: f.specular?.factor ?? 1,
    specularColour: f.specular?.colour ?? [1, 1, 1],
  };
}

function opticsLook(asset: CompiledAsset, s: TransmissiveSurface): Look {
  const o = asset.optics?.[s] ?? OPTICS[s];
  const d = o.attenuationDistance;
  const sigma = (c: number): number => (d > 0 ? -Math.log(Math.max(1e-4, c)) / d : 0);
  return {
    ...OPAQUE,
    transmission: o.transmission,
    ior: o.ior,
    thickness: o.thickness,
    absorb: [
      sigma(o.attenuationColour[0]),
      sigma(o.attenuationColour[1]),
      sigma(o.attenuationColour[2]),
    ],
    roughness: o.roughness,
    metallic: 0,
  };
}

/** The look of one part (OPAQUE when nothing special applies). */
export function lookOf(asset: CompiledAsset, p: Part): Look {
  const s = p.surface;
  if (s && s !== 'opaque' && s !== 'cutout') return opticsLook(asset, s);
  const lacquer = p.paint === undefined ? undefined : asset.paintSet?.finish?.[p.paint];
  if (lacquer) return finishLook(lacquer);
  const f = p.finish === undefined ? undefined : asset.finishes?.[p.finish];
  return f ? finishLook(f) : OPAQUE;
}

/** Distinct looks (index 0 = OPAQUE) and each part's index into them. */
export function lookTable(asset: CompiledAsset): { looks: Look[]; byPart: Map<string, number> } {
  const looks: Look[] = [OPAQUE];
  const byPart = new Map<string, number>();
  for (const p of asset.parts) {
    const l = lookOf(asset, p);
    let i = looks.indexOf(l);
    if (i < 0) {
      const key = JSON.stringify(l);
      i = looks.findIndex((m) => JSON.stringify(m) === key);
    }
    if (i < 0) i = looks.push(l) - 1;
    byPart.set(p.name, i);
  }
  return { looks, byPart };
}
