// The materials of an imported model as ONE TextureSet (ADR 016): the PNG bytes of baseColor,
// normal and occlusion/roughness/metallic exactly as stored in the file, never decoded. A model
// with several different textured materials is refused (v1: one set per model); JPEG / WebP are
// refused with the re-encode to make. ORM rule: the metallicRoughness image is `orm` when the
// occlusion slot points at the same image; without that, its red channel is undefined by glTF, so
// the image is kept only on `ormWithoutOcclusion: 'keep'` and otherwise dropped for the defaults.

import { pngHeader, type TextureSet, Ts23dError, textureKey } from '../core/index.ts';
import { at, type GlbDoc, type GltfJson, num, readImage, textureSource } from './glb-read.ts';

export interface TextureOptions {
  /** Name of the set. Default: the material's name in snake_case, else 'model'. */
  readonly textureName?: string;
  /** Keep a metallicRoughness image as `orm` although no occlusion map shares it. Default 'drop'. */
  readonly ormWithoutOcclusion?: 'keep' | 'drop';
}

export interface ImportedTextures {
  readonly set?: TextureSet;
  readonly warnings: readonly string[];
}

interface Slots {
  readonly name: string;
  readonly albedo?: number;
  readonly normal?: number;
  readonly mr?: number;
  readonly occlusion?: number;
  readonly roughness: number;
  readonly metallic: number;
}

/** 'Body Material.001' → 'body_material_001'; anything unusable → `fallback`. */
export function snakeName(text: string, fallback: string): string {
  const s = text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) return fallback;
  return /^[a-z]/.test(s) ? s : `${fallback}_${s}`;
}

function slotsOf(doc: GlbDoc, i: number): Slots {
  const mat = at(doc, 'materials', i);
  const name = typeof mat['name'] === 'string' && mat['name'] ? mat['name'] : `material_${i}`;
  const pbr = (mat['pbrMetallicRoughness'] ?? {}) as GltfJson;
  const slot = (ref: unknown, what: string): { [k: string]: number } => {
    const src = textureSource(doc, ref, `material '${name}' ${what}`);
    return src === undefined ? {} : { [what]: src };
  };
  return {
    name,
    ...slot(pbr['baseColorTexture'], 'albedo'),
    ...slot(mat['normalTexture'], 'normal'),
    ...slot(pbr['metallicRoughnessTexture'], 'mr'),
    ...slot(mat['occlusionTexture'], 'occlusion'),
    roughness: num(pbr, 'roughnessFactor', 1),
    metallic: num(pbr, 'metallicFactor', 1),
  };
}

const textured = (s: Slots | undefined): boolean =>
  !!s && [s.albedo, s.normal, s.mr, s.occlusion].some((v) => v !== undefined);

/** Materials are one set when their maps hold the same bytes (not merely the same index). */
function signature(doc: GlbDoc, s: Slots | undefined): string {
  if (!s || !textured(s)) return 'untextured';
  const key = (i: number | undefined): string | null =>
    i === undefined ? null : textureKey(readImage(doc, i).bytes);
  return JSON.stringify([
    key(s.albedo),
    key(s.normal),
    key(s.mr),
    key(s.occlusion),
    s.roughness,
    s.metallic,
  ]);
}

function png(doc: GlbDoc, image: number, what: string): Uint8Array {
  const { bytes, mime } = readImage(doc, image);
  if (!pngHeader(bytes))
    throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
      cause: `${what} is ${mime || 'an unknown format'}, not PNG`,
      fix: 'export with PNG textures: the Blender `export` step writes them; or re-encode the image as an 8-bit RGB/RGBA PNG and repack the .glb',
    });
  // A copy: the set must not pin the whole GLB buffer, and writers hash it by identity.
  return bytes.slice();
}

/**
 * The texture set of the primitives' materials (`undefined` entries = no material).
 * `credit` is stamped on the set.
 */
export function importTextures(
  doc: GlbDoc,
  materials: readonly (number | undefined)[],
  credit: string,
  o: TextureOptions = {},
): ImportedTextures {
  const slots = materials.map((m) => (m === undefined ? undefined : slotsOf(doc, m)));
  const kinds = new Map<string, string[]>();
  slots.forEach((s) => {
    const sig = signature(doc, s);
    const names = kinds.get(sig) ?? [];
    const name = s?.name ?? '(no material)';
    if (!names.includes(name)) names.push(name);
    kinds.set(sig, names);
  });
  const first = slots.find(textured);
  if (!first) return { warnings: [] };
  if (kinds.size > 1)
    throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
      cause: `the model uses ${kinds.size} different materials (${[...kinds.values()].flat().join(', ')}); importModel carries one texture set`,
      fix: 'bake them to one set first (the Blender `bake` step: one UV layout, one albedo / normal / ORM), then export again',
    });
  const warnings: string[] = [];
  const where = `material '${first.name}'`;
  if (first.albedo === undefined) {
    warnings.push(
      `${where} has maps but no baseColor texture: imported untextured (a texture set needs an albedo)`,
    );
    return { warnings };
  }
  const albedo = png(doc, first.albedo, `${where} baseColor`);
  const normal =
    first.normal === undefined ? undefined : png(doc, first.normal, `${where} normal map`);
  let orm: Uint8Array | undefined;
  if (first.mr !== undefined) {
    const shared = first.occlusion === first.mr;
    if (shared || o.ormWithoutOcclusion === 'keep') {
      orm = png(doc, first.mr, `${where} metallicRoughness`);
      if (!shared)
        warnings.push(
          `${where}: metallicRoughness image kept as ORM without a matching occlusion map; its red channel is read as occlusion`,
        );
    } else
      warnings.push(
        `${where}: metallicRoughness image dropped (no occlusion map shares it, so its red channel is undefined); roughness/metallic fall back to the defaults. Bake an ORM map (Blender \`bake\` step) or pass ormWithoutOcclusion: 'keep'`,
      );
  }
  if (first.occlusion !== undefined && first.occlusion !== first.mr)
    warnings.push(
      `${where}: separate occlusion image dropped (a set carries one ORM map); pack occlusion into the red channel of the metallicRoughness image`,
    );
  const set: TextureSet = {
    name: o.textureName ?? snakeName(first.name, 'model'),
    albedo,
    ...(normal ? { normal } : {}),
    ...(orm ? { orm } : {}),
    ...(first.mr === undefined ? { roughness: first.roughness, metallic: first.metallic } : {}),
    credit,
  };
  return { set, warnings };
}
