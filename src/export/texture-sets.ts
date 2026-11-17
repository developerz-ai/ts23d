// Texture sets in glTF (ADR 016): every set a part carries becomes ONE material (two when the set
// is used both opaque and cutout) sampling the set's own PNGs: baseColor (sRGB; alpha = MASK for
// cutout), normal, and ORM in the occlusion + metallicRoughness slots, or factors without an ORM
// map. Materials are appended after every trim-sheet material and images after the sheet's three,
// so an asset without texture sets keeps its indices and bytes. All LOD trees of a single-file GLB
// index the same materials, so each PNG is embedded once (and once more per split-LOD file);
// equal bytes under two sets are one image. `extras.ts23d.textureSets` declares what was written.

import {
  type CompiledAsset,
  type Part,
  pngHeader,
  sameTextureSet,
  TEXTURE_DEFAULTS,
  TEXTURE_MAPS,
  type TextureSet,
  Ts23dError,
  textureKey,
} from '../core/index.ts';
import type { Json } from './bin-writer.ts';
import type { ExportWarning } from './glb-options.ts';
import { textureSetWarnings } from './texture-uvs.ts';

const LINEAR = 9729;
const LINEAR_MIPMAP_LINEAR = 9987;
const REPEAT = 10497;

/** glTF `images` / `textures` / `samplers` plus the bytes to append to the BIN chunk. */
export interface TextureJson {
  readonly json: Json;
  readonly tail: Uint8Array;
}

export interface TextureSetPlan {
  /** Appended after the trim, glow, paint and finish materials. */
  readonly materials: readonly Json[];
  /** A textured part's material index; undefined for a trim-sheet part. */
  readonly materialOf: (part: Part) => number | undefined;
  /** `{ ts23d: { textureSets } }` for the root `extras`; empty without sets. */
  readonly extras: Json;
  readonly warnings: readonly ExportWarning[];
  /**
   * The file's images / textures / samplers: the sheet's (`sheet`, already placed at `offset`)
   * followed by the sets'. Returns `sheet` untouched when the asset has no texture sets.
   */
  readonly embed: (sheet: TextureJson | null, views: Json[], offset: number) => TextureJson | null;
}

const materialName = (set: TextureSet, cutout: boolean): string =>
  `ts23d_${cutout ? 'texcut' : 'tex'}_${set.name}`;

/** The sets of every LOD by name, in first-use order (LOD0 first); one name, one set of bytes. */
function setsOf(lods: readonly CompiledAsset[]): TextureSet[] {
  const seen = new Map<string, TextureSet>();
  for (const l of lods)
    for (const p of l.parts) {
      const set = p.textures;
      if (!set) continue;
      const known = seen.get(set.name);
      if (known && !sameTextureSet(known, set))
        throw new Ts23dError('T3D_TEXTURE_INVALID', {
          cause: `part '${p.name}' in '${l.name}' LOD${l.lod} uses texture set '${set.name}' with other maps or factors than an earlier LOD`,
          fix: `share one TextureSet value between the LODs, or name the LOD's own set, e.g. '${set.name}_lod${l.lod}' (each name is a material and counts in budget.textureSets)`,
        });
      if (!known) seen.set(set.name, set);
    }
  return [...seen.values()];
}

export function textureSetPlan(
  lods: readonly CompiledAsset[],
  /** Index of the first material this plan adds. */
  start: number,
  /** The trim sheet is bound: its 3 textures and 1 sampler come first. */
  withSheet: boolean,
): TextureSetPlan {
  const sets = setsOf(lods);
  const images: Uint8Array[] = [];
  const imageNames: string[] = [];
  const imageOf = new Map<string, number>();
  const firstTexture = withSheet ? 3 : 0;
  // One texture per distinct image (they share the one sampler), so an index maps 1:1.
  const texture = (set: TextureSet, map: (typeof TEXTURE_MAPS)[number]): Json | undefined => {
    const png = set[map];
    if (!png) return undefined;
    const key = textureKey(png);
    let at = imageOf.get(key);
    if (at === undefined) {
      at = images.length;
      imageOf.set(key, at);
      images.push(png);
      imageNames.push(`${set.name}_${map}`);
    }
    return { index: firstTexture + at };
  };
  const materials: Json[] = [];
  const index = new Map<string, number>();
  for (const set of sets) {
    const base = texture(set, 'albedo');
    const normal = texture(set, 'normal');
    const orm = texture(set, 'orm');
    for (const cutout of [false, true]) {
      const usedSo = lods.some((l) =>
        l.parts.some((p) => p.textures?.name === set.name && (p.surface === 'cutout') === cutout),
      );
      if (!usedSo) continue;
      index.set(`${set.name}|${cutout}`, start + materials.length);
      materials.push({
        name: materialName(set, cutout),
        ...(cutout ? { alphaMode: 'MASK', alphaCutoff: 0.5, doubleSided: true } : {}),
        pbrMetallicRoughness: {
          baseColorTexture: base,
          // With an ORM map the texture rules (factors 1); without, the set's factors.
          metallicFactor: orm ? 1 : (set.metallic ?? TEXTURE_DEFAULTS.metallic),
          roughnessFactor: orm ? 1 : (set.roughness ?? TEXTURE_DEFAULTS.roughness),
          ...(orm ? { metallicRoughnessTexture: orm } : {}),
        },
        ...(normal ? { normalTexture: normal } : {}),
        ...(orm ? { occlusionTexture: orm } : {}),
      });
    }
  }
  const extras: Json = sets.length
    ? {
        ts23d: {
          textureSets: sets.map((set) => ({
            name: set.name,
            size: pngHeader(set.albedo)?.width ?? 0,
            // Map → its edge in pixels (a normal map may be smaller than the albedo).
            maps: Object.fromEntries(
              TEXTURE_MAPS.flatMap((m) => {
                const png = set[m];
                return png ? [[m, pngHeader(png)?.width ?? 0]] : [];
              }),
            ),
            materials: [false, true]
              .filter((cutout) => index.has(`${set.name}|${cutout}`))
              .map((cutout) => materialName(set, cutout)),
            ...(set.credit ? { credit: set.credit } : {}),
          })),
        },
      }
    : {};
  return {
    materials,
    materialOf: (part) =>
      part.textures && index.get(`${part.textures.name}|${part.surface === 'cutout'}`),
    extras,
    warnings: textureSetWarnings(lods),
    embed: (sheet, views, offset) => {
      if (!images.length) return sheet;
      const sampler = ((sheet?.json['samplers'] as Json[] | undefined) ?? []).length;
      const json: Json = {
        images: [...((sheet?.json['images'] as Json[] | undefined) ?? [])],
        textures: [...((sheet?.json['textures'] as Json[] | undefined) ?? [])],
        samplers: [
          ...((sheet?.json['samplers'] as Json[] | undefined) ?? []),
          { magFilter: LINEAR, minFilter: LINEAR_MIPMAP_LINEAR, wrapS: REPEAT, wrapT: REPEAT },
        ],
      };
      const chunks: Uint8Array[] = [sheet?.tail ?? new Uint8Array()];
      let at = chunks[0]?.byteLength ?? 0;
      images.forEach((png, i) => {
        views.push({ buffer: 0, byteOffset: offset + at, byteLength: png.byteLength });
        (json['images'] as Json[]).push({
          name: imageNames[i],
          bufferView: views.length - 1,
          mimeType: 'image/png',
        });
        (json['textures'] as Json[]).push({
          sampler,
          source: (json['images'] as Json[]).length - 1,
        });
        const pad = (4 - (png.byteLength % 4)) % 4;
        chunks.push(png, new Uint8Array(pad));
        at += png.byteLength + pad;
      });
      // One allocation for the whole tail, however many maps.
      const tail = new Uint8Array(at);
      let to = 0;
      for (const c of chunks) {
        tail.set(c, to);
        to += c.byteLength;
      }
      return { json, tail };
    },
  };
}
