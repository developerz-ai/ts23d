// Renderer setup shared by the hero showcase, the viewer and the thumbnails: Khronos PBR Neutral
// tone mapping (keeps the trim sheet's base colours true, unlike ACES's hue shifts), sRGB output,
// soft PCF shadows, and a ground that only shows shadows. Light comes from `lightbox.ts`/`look.ts`.

import {
  Mesh,
  NeutralToneMapping,
  type Object3D,
  PCFShadowMap,
  PlaneGeometry,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { pixelRatioFor, type Tier } from './quality.ts';

export function studioRenderer(tier: Tier = 'high'): WebGLRenderer {
  const r = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  r.setPixelRatio(pixelRatioFor(tier));
  r.outputColorSpace = SRGBColorSpace;
  r.toneMapping = NeutralToneMapping;
  r.toneMappingExposure = 1;
  r.shadowMap.enabled = true;
  // PCF with a shadow radius is the soft filter since r180 (PCFSoftShadowMap was removed).
  r.shadowMap.type = PCFShadowMap;
  return r;
}

/** Anisotropic filtering for textures seen at grazing angles (the trim sheet on long hulls). */
export const anisotropyOf = (r: WebGLRenderer): number =>
  Math.min(8, r.capabilities.getMaxAnisotropy());

/** Every mesh under `root` casts and receives shadows (self-shadowing reads as depth). */
export function castShadows(root: Object3D): void {
  root.traverse((n) => {
    if (n instanceof Mesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
}

/** An invisible floor that only darkens where shadows fall: the product-shot contact shadow. */
export function shadowCatcher(opacity = 0.32): Mesh<PlaneGeometry, ShadowMaterial> {
  const ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = -1;
  return ground;
}
