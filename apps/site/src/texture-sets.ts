// A part's own texture set (ADR 016) in the viewer. The GLB writer gives each set one material
// named `ts23d_tex_<set>` (`ts23d_texcut_<set>` when cut out) with its own PNGs embedded; the
// browser decodes them through GLTFLoader (never the library's PNG decoder, which needs
// node:zlib). This file holds the glTF → three.js contract for those materials and applies it:
// albedo sRGB, normal and ORM linear, no Y flip (glTF UVs), one ORM texture read as occlusion (R),
// roughness (G) and metalness (B), and a normal map that follows the mesh's own tangents (green
// up: scale +1) or, without a TANGENT attribute, three's derivative tangents (scale −1 on Y for
// unflipped UVs). It also keeps the trim sheet off these materials, lists what is bound for the
// stats panel and frees their textures with the model.

import {
  type BufferGeometry,
  type ColorSpace,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  type Object3D,
  SRGBColorSpace,
  type Texture,
} from 'three';

const PREFIXES = ['ts23d_tex_', 'ts23d_texcut_'] as const;

/** `ts23d_tex_body` → `body`; null for a trim-sheet, paint, glow or finish material. */
export function setNameOf(materialName: string): string | null {
  const prefix = PREFIXES.find((p) => materialName.startsWith(p));
  return prefix && materialName.length > prefix.length ? materialName.slice(prefix.length) : null;
}

type Slot = 'map' | 'normalMap' | 'aoMap' | 'roughnessMap' | 'metalnessMap';

/** How each material slot of a texture set must be sampled. */
export const SLOTS: Readonly<Record<Slot, { readonly colorSpace: ColorSpace }>> = {
  map: { colorSpace: SRGBColorSpace },
  normalMap: { colorSpace: NoColorSpace },
  aoMap: { colorSpace: NoColorSpace },
  roughnessMap: { colorSpace: NoColorSpace },
  metalnessMap: { colorSpace: NoColorSpace },
};
const SLOT_NAMES = Object.keys(SLOTS) as Slot[];

/** One bound set as the stats panel names it; a map's edge in pixels, null when the set has none. */
export interface TextureSetInfo {
  readonly name: string;
  readonly albedo: number | null;
  readonly normal: number | null;
  /** Set only when occlusion, roughness and metalness read ONE texture (the packed ORM). */
  readonly orm: number | null;
  readonly cutout: boolean;
}

export const isTextureSetMaterial = (m: { readonly name: string }): boolean =>
  setNameOf(m.name) !== null;

const edge = (t: Texture | null): number | null => {
  const image = t?.image as { readonly width?: number } | null | undefined;
  return t ? (image?.width ?? 0) : null;
};

/** Sample `t` as the slot asks; a changed texture is re-uploaded. */
function sample(t: Texture, colorSpace: ColorSpace, anisotropy: number): void {
  if (t.colorSpace === colorSpace && !t.flipY && t.anisotropy === anisotropy) return;
  t.colorSpace = colorSpace;
  t.flipY = false;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
}

/** Normal-map Y scale for a mesh: +|y| with its own tangents, −|y| on derivative tangents. */
export const normalScaleY = (y: number, geometry: BufferGeometry): number =>
  geometry.hasAttribute('tangent') ? Math.abs(y) : -Math.abs(y);

/**
 * Apply the contract to every texture-set material under `root` and return what is bound, one
 * entry per set name (first use). Materials of other kinds are left exactly as they are.
 */
export function bindTextureSets(root: Object3D, anisotropy = 1): TextureSetInfo[] {
  const found = new Map<string, TextureSetInfo>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const mat of [node.material].flat()) {
      if (!(mat instanceof MeshStandardMaterial)) continue;
      const name = setNameOf(mat.name);
      if (name === null) continue;
      for (const slot of SLOT_NAMES) {
        const t = mat[slot];
        if (t) sample(t, SLOTS[slot].colorSpace, anisotropy);
      }
      if (mat.normalMap) mat.normalScale.y = normalScaleY(mat.normalScale.y, node.geometry);
      mat.needsUpdate = true;
      const packed =
        mat.roughnessMap !== null &&
        mat.roughnessMap === mat.metalnessMap &&
        mat.roughnessMap === mat.aoMap;
      if (!found.has(name))
        found.set(name, {
          name,
          albedo: edge(mat.map),
          normal: edge(mat.normalMap),
          orm: packed ? edge(mat.roughnessMap) : null,
          cutout: mat.alphaTest > 0,
        });
    }
  });
  return [...found.values()];
}

/** True when some material under `root` is the trim sheet's to bind (not a texture set's). */
export function usesTrimSheet(root: Object3D): boolean {
  let any = false;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const mat of [node.material].flat())
      any ||= mat instanceof MeshStandardMaterial && !isTextureSetMaterial(mat);
  });
  return any;
}

/** `body: albedo 2048² · normal 1024² · ORM 1024²`. */
export function describeSet(s: TextureSetInfo): string {
  const maps = [
    s.albedo === null ? null : `albedo ${s.albedo}²`,
    s.normal === null ? null : `normal ${s.normal}²`,
    s.orm === null ? null : `ORM ${s.orm}²`,
  ].filter((m) => m !== null);
  return `${s.name}: ${maps.join(' · ') || 'no maps'}${s.cutout ? ' · cutout' : ''}`;
}

/** Free the textures a texture-set material owns (the shared trim sheet is never touched). */
export function disposeTextureSet(mat: unknown): void {
  if (!(mat instanceof MeshStandardMaterial) || !isTextureSetMaterial(mat)) return;
  for (const t of new Set(SLOT_NAMES.map((slot) => mat[slot]))) t?.dispose();
}
