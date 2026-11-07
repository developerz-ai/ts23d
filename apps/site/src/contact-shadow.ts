// The product-shot contact shadow: render the asset's depth from under the floor once, blur it
// twice, and lay it on a plane under the asset. Dark where the asset meets the ground, fading with
// height; soft and cheap (baked once per asset, not per frame), so every quality tier grounds it.

import {
  type Box3,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  type Object3D,
  OrthographicCamera,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

const RES = 512;

export class ContactShadow {
  readonly plane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly target = new WebGLRenderTarget(RES, RES);
  private readonly scratch = new WebGLRenderTarget(RES, RES);
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly depth = new MeshDepthMaterial({ depthTest: false, depthWrite: false });
  private readonly h = new ShaderMaterial(HorizontalBlurShader);
  private readonly v = new ShaderMaterial(VerticalBlurShader);
  private readonly quad = new FullScreenQuad();

  constructor() {
    this.target.texture.generateMipmaps = false;
    this.scratch.texture.generateMipmaps = false;
    // Seen from below, the depth render has +Z at the top; the floor plane has -Z there.
    this.target.texture.repeat.set(1, -1);
    this.target.texture.offset.set(0, 1);
    this.camera.rotation.x = Math.PI / 2; // look up at the asset's underside
    // Depth → black with alpha falling off with height above the floor.
    this.depth.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.2 ) * 1.6 );',
      );
    };
    this.plane = new Mesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        map: this.target.texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.plane.renderOrder = -2;
  }

  /**
   * Bake the shadow of `scene`'s visible meshes inside `box`, hiding `hide` while it renders.
   * `opacity` is the darkest the shadow gets.
   */
  bake(
    renderer: WebGLRenderer,
    scene: Scene,
    box: Box3,
    hide: readonly Object3D[],
    opacity: number,
  ): void {
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    // A margin around the footprint so the blur has room to fade out.
    const span = Math.max(size.x, size.z) * 1.6 + 0.02;
    const height = Math.max(size.y * 0.6, 0.01);
    const cam = this.camera;
    cam.left = cam.bottom = -span / 2;
    cam.right = cam.top = span / 2;
    cam.near = 0;
    cam.far = height;
    cam.position.set(center.x, box.min.y, center.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.plane.position.set(center.x, box.min.y + span * 0.0005, center.z);
    this.plane.scale.set(span, 1, span);
    this.plane.material.opacity = opacity;

    const visible = [this.plane, ...hide].map((o) => [o, o.visible] as const);
    for (const [o] of visible) o.visible = false;
    const background = scene.background;
    const auto = renderer.shadowMap.autoUpdate;
    const alpha = renderer.getClearAlpha();
    const before = renderer.getRenderTarget();
    scene.background = null;
    scene.overrideMaterial = this.depth;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    scene.overrideMaterial = null;
    // Two blur passes, wider then tighter, for a soft penumbra with a dense core.
    this.blur(renderer, 2.2);
    this.blur(renderer, 0.9);
    renderer.setRenderTarget(before);
    renderer.setClearAlpha(alpha);
    renderer.shadowMap.autoUpdate = auto;
    scene.background = background;
    for (const [o, was] of visible) o.visible = was;
  }

  private blur(renderer: WebGLRenderer, amount: number): void {
    this.h.uniforms['tDiffuse'] = { value: this.target.texture };
    this.h.uniforms['h'] = { value: amount / 256 };
    this.quad.material = this.h;
    renderer.setRenderTarget(this.scratch);
    this.quad.render(renderer);
    this.v.uniforms['tDiffuse'] = { value: this.scratch.texture };
    this.v.uniforms['v'] = { value: amount / 256 };
    this.quad.material = this.v;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
  }
}
