// Studio look shared by the hero showcase and the viewer: a filmic renderer (ACES, sRGB, soft
// shadows), a room environment for image-based light, and a ground that only shows shadows.

import {
  ACESFilmicToneMapping,
  Mesh,
  type Object3D,
  PCFSoftShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  ShadowMaterial,
  SRGBColorSpace,
  type Texture,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function studioRenderer(): WebGLRenderer {
  const r = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.outputColorSpace = SRGBColorSpace;
  r.toneMapping = ACESFilmicToneMapping;
  r.toneMappingExposure = 1;
  r.shadowMap.enabled = true;
  r.shadowMap.type = PCFSoftShadowMap;
  return r;
}

const envs = new WeakMap<WebGLRenderer, Texture>();

/** A prefiltered studio room for `scene.environment`, built once per renderer. */
export function studioEnvironment(renderer: WebGLRenderer): Texture {
  const hit = envs.get(renderer);
  if (hit) return hit;
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  envs.set(renderer, tex);
  return tex;
}

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
