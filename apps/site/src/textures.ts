// Textures on/off: bind the painted trim sheet (albedo, normal, ORM) to a loaded asset's
// materials, the way a textured GLB from `toGlb({ sheet })` would, or restore vertex colour only.

import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  type Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { Sheet } from './compile.ts';

interface Maps {
  readonly albedo: Texture;
  readonly normal: Texture;
  readonly orm: Texture;
}

let maps: Maps | null = null;

/** glTF sampler of the sheet: repeat along U (strips tile), clamp along V (rows never wrap). */
function texture(sheet: Sheet, data: Uint8Array, srgb: boolean): Texture {
  const t = new DataTexture(data, sheet.size, sheet.size);
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function mapsFor(sheet: Sheet): Maps {
  maps ??= {
    albedo: texture(sheet, sheet.albedo, true),
    normal: texture(sheet, sheet.normal, false),
    orm: texture(sheet, sheet.orm, false),
  };
  return maps;
}

interface Saved {
  readonly roughness: number;
  readonly metalness: number;
}

/** Bind (sheet given) or unbind (null) the trim sheet on every standard material under `root`. */
export function applySheet(root: Object3D, sheet: Sheet | null): void {
  const m = sheet ? mapsFor(sheet) : null;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const mat of [node.material].flat()) {
      if (!(mat instanceof MeshStandardMaterial)) continue;
      const saved = mat.userData['ts23dSaved'] as Saved | undefined;
      if (m) {
        if (!saved)
          mat.userData['ts23dSaved'] = { roughness: mat.roughness, metalness: mat.metalness };
        mat.map = m.albedo;
        mat.normalMap = m.normal;
        mat.aoMap = m.orm;
        mat.roughnessMap = m.orm;
        mat.metalnessMap = m.orm;
        // Opaque surfaces take roughness and metal from the ORM map, as the textured GLB does.
        if (!mat.transparent) {
          mat.roughness = 1;
          mat.metalness = 1;
        }
      } else {
        mat.map = null;
        mat.normalMap = null;
        mat.aoMap = null;
        mat.roughnessMap = null;
        mat.metalnessMap = null;
        if (saved) {
          mat.roughness = saved.roughness;
          mat.metalness = saved.metalness;
        }
      }
      mat.needsUpdate = true;
    }
  });
}
