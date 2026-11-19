// Textures on/off: bind the painted trim sheet (albedo, normal, ORM) to a loaded asset's
// materials, the way a textured GLB from `toGlb({ sheet })` would, or restore vertex colour only.
// A part's own texture set (texture-sets.ts) is never the sheet's: those materials keep their maps
// whichever way the toggle stands. Also the wireframe toggle, the other per-material switch.

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
import { type BuildRequest, type Sheet, trimSheet } from './compile.ts';
import { isTextureSetMaterial, usesTrimSheet } from './texture-sets.ts';

interface Maps {
  readonly albedo: Texture;
  readonly normal: Texture;
  readonly orm: Texture;
}

/** The textures of the sheet bound last: each asset has its own sheet (its materials' rows). */
let bound: { readonly sheet: Sheet; readonly maps: Maps } | null = null;

/** The build a loaded model came from: whose sheet `showSheet` asks the worker for. */
export const sheetOwner = new WeakMap<Object3D, BuildRequest>();

/** glTF sampler of the sheet: repeat along U (strips tile), clamp along V (rows never wrap). */
function texture(sheet: Sheet, data: Uint8Array, srgb: boolean, anisotropy: number): Texture {
  const t = new DataTexture(data, sheet.size, sheet.size);
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.flipY = false;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function mapsFor(sheet: Sheet, anisotropy: number): Maps {
  if (bound?.sheet === sheet) return bound.maps;
  for (const t of Object.values(bound?.maps ?? {})) t.dispose();
  const maps = {
    albedo: texture(sheet, sheet.albedo, true, anisotropy),
    normal: texture(sheet, sheet.normal, false, anisotropy),
    orm: texture(sheet, sheet.orm, false, anisotropy),
  };
  bound = { sheet, maps };
  return maps;
}

interface Saved {
  readonly roughness: number;
  readonly metalness: number;
}

/**
 * Bind (sheet given) or unbind (null) the trim sheet on every standard material under `root`
 * (MeshPhysicalMaterial too: GLTFLoader builds one for KHR_materials_clearcoat/sheen/
 * transmission/anisotropy/iridescence/specular/volume/ior, which the GLB writes as declared).
 * `anisotropy` sharpens the sheet at grazing angles (long hull sides, ground planes).
 */
export function applySheet(root: Object3D, sheet: Sheet | null, anisotropy = 1): void {
  const m = sheet ? mapsFor(sheet, anisotropy) : null;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const mat of [node.material].flat()) {
      if (!(mat instanceof MeshStandardMaterial) || isTextureSetMaterial(mat)) continue;
      const saved = mat.userData['ts23dSaved'] as Saved | undefined;
      // Finishes and lacquered paint that declare their own metal/roughness (glTF extras
      // `ts23d.ownFactors`, see export/pbr.ts) keep them, as the textured GLB does.
      const own = (mat.userData['ts23d'] as { ownFactors?: boolean } | undefined)?.ownFactors;
      if (m) {
        if (!saved)
          mat.userData['ts23dSaved'] = { roughness: mat.roughness, metalness: mat.metalness };
        mat.map = m.albedo;
        mat.normalMap = m.normal;
        mat.aoMap = m.orm;
        mat.roughnessMap = own ? null : m.orm;
        mat.metalnessMap = own ? null : m.orm;
        // Opaque surfaces take roughness and metal from the ORM map, as the textured GLB does.
        if (!mat.transparent && !own) {
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

/**
 * The viewer's toggle: paint the model's sheet in the worker (once per asset and size; whose it
 * is: `sheetOwner`) and bind it, or unbind it.
 * A model with nothing for the sheet (every material a texture set's, which keep their own maps)
 * skips the paint and shows the toggle off and disabled. `wanted` says whether `model` is still
 * the one shown and wanted textured, now and once the paint lands.
 */
export async function showSheet(
  model: Object3D | null,
  size: 1024 | 2048,
  anisotropy: number,
  wanted: () => boolean,
  ui: {
    readonly textures: { disabled: boolean; checked: boolean };
    readonly status: { textContent: string | null };
  },
): Promise<void> {
  if (!model) return;
  const on = wanted();
  ui.textures.disabled = !usesTrimSheet(model);
  ui.textures.checked = on && !ui.textures.disabled;
  if (!ui.textures.checked) return applySheet(model, null);
  ui.status.textContent = 'Painting the trim sheet…';
  const sheet = await trimSheet(size, sheetOwner.get(model));
  if (wanted()) applySheet(model, sheet, anisotropy);
  ui.status.textContent = wanted() ? 'Trim sheet bound.' : '';
}

/** Wireframe on or off for every material under `root`. */
export function setWireframe(root: Object3D, on: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    for (const m of [o.material].flat()) if ('wireframe' in m) m.wireframe = on;
  });
}
