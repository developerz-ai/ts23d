// The high-tier frame: MSAA scene render → ground-truth ambient occlusion (three's GTAOPass, no
// extra dependency) → tone map + sRGB (OutputPass). Loaded lazily by the viewer only, so the home
// page never pays for it. AO radius follows the asset's size: a 30 cm bust and a 2 km terrain
// both get crevice shading at their own scale.

import {
  type Box3,
  HalfFloatType,
  type PerspectiveCamera,
  type Scene,
  Sphere,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';

export class Post {
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, size.x, size.y);
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.composer.addPass(new OutputPass());
  }

  /**
   * AO reach for the shown asset, and AO clipped to its bounds (plus a margin for the contact
   * with the floor) so the far floor edge never draws a dark line across the backdrop.
   */
  fit(box: Box3 | null): void {
    const radius = box ? box.getBoundingSphere(new Sphere()).radius : 1;
    if (box) this.ao.setSceneClipBox(box.clone().expandByScalar(radius * 0.25));
    this.ao.updateGtaoMaterial({
      radius: Math.max(0.02, radius * 0.12),
      distanceExponent: 1.5,
      thickness: Math.max(0.02, radius * 0.08),
      scale: 1,
      samples: 16,
      distanceFallOff: 1,
      screenSpaceRadius: false,
    });
    this.ao.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      rings: 2,
      samples: 16,
    });
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.ao.dispose();
    this.composer.dispose();
  }
}
