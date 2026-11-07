// The shared three.js stage: the look's lights (a shadow-casting key, image-based ambient), a metre
// grid, a shadow-catching floor plus a baked soft contact shadow under the asset, and camera framing.

import {
  Box3,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { ContactShadow } from './contact-shadow.ts';
import { environmentFor } from './lightbox.ts';
import { LOOKS, type Look } from './look.ts';
import { castShadows, shadowCatcher } from './studio.ts';
import { onSchemeChange, token } from './theme.ts';

export class Stage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(35, 1, 0.05, 2000);
  /** Lights are public so scenarios can sweep the time of day; `relight()` restores them. */
  readonly hemi = new HemisphereLight(0xffffff, 0x404850, 1.6);
  readonly sun = new DirectionalLight(0xffffff, 2.2);
  readonly fill = new DirectionalLight(0xffffff, 0.6);
  /** Contact-shadow floor for studio mode; hidden when a diorama base carries the shadows. */
  readonly catcher = shadowCatcher();
  /** Soft baked shadow right under the asset (studio mode, with the catcher). */
  readonly contact = new ContactShadow();
  private look: Look = LOOKS.studio;
  private grid: GridHelper | null = null;
  private gridOn = true;
  private content: Object3D | null = null;
  private radius = 1;

  /** World bounds of the shown content, or null before anything is shown. */
  contentBox(): Box3 | null {
    return this.content ? this.bounds(this.content) : null;
  }

  constructor(private readonly withGrid: boolean) {
    this.relight();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 6;
    this.scene.add(this.hemi, this.sun, this.fill, this.sun.target, this.catcher);
    this.scene.add(this.contact.plane);
    onSchemeChange(() => this.content && this.layGrid(this.bounds(this.content)));
  }

  /** Switch to `look`: its prefiltered environment, exposure and lights. */
  setLook(look: Look, renderer: WebGLRenderer): void {
    this.look = look;
    this.scene.environment = environmentFor(renderer, look.env);
    renderer.toneMappingExposure = look.exposure;
    this.relight();
  }

  /** The look's lighting, which every scenario starts from: image-based ambient plus one key. */
  relight(): void {
    const { key } = this.look;
    this.scene.environmentIntensity = this.look.envIntensity;
    this.hemi.intensity = this.look.hemi;
    this.hemi.color.setRGB(0.78, 0.84, 1);
    this.hemi.groundColor.setRGB(0.55, 0.5, 0.44);
    this.sun.intensity = key.intensity;
    this.sun.color.setRGB(key.rgb[0], key.rgb[1], key.rgb[2]);
    this.sun.position.set(key.dir[0], key.dir[1], key.dir[2]).multiplyScalar(10);
    this.sun.target.position.set(0, 0, 0);
    this.fill.intensity = 0;
    this.fill.position.set(8, 3, -6);
    this.catcher.material.opacity = this.look.shadow;
  }

  /** Studio floor (catcher + contact shadow) on, or off when a diorama carries the shadows. */
  setFloor(on: boolean): void {
    this.catcher.visible = on;
    this.contact.plane.visible = on;
  }

  /** Bake the contact shadow for the shown content; `hide` lists extra non-asset scene objects. */
  bakeContact(renderer: WebGLRenderer, hide: readonly Object3D[] = []): void {
    if (!this.content) return;
    const box = this.bounds(this.content);
    const extra = this.grid ? [this.grid] : [];
    this.contact.bake(
      renderer,
      this.scene,
      box,
      [this.catcher, ...extra, ...hide],
      this.look.contact,
    );
  }

  /** Grow the far plane for scenes larger than the framed content (long tracks, tall towers). */
  reach(far: number): void {
    if (far > this.camera.far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Swap the displayed object. `reframe` moves the camera; keep it false across LOD switches. */
  show(object: Object3D, reframe: boolean): Vector3 {
    if (this.content) this.scene.remove(this.content);
    this.content = object;
    this.scene.add(object);
    castShadows(object);
    const box = this.bounds(object);
    this.layGrid(box);
    const sphere = box.getBoundingSphere(new Sphere());
    this.radius = sphere.radius;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -sphere.radius * 1.3;
    cam.right = cam.top = sphere.radius * 1.3;
    cam.near = 0.1;
    cam.far = sphere.radius * 8;
    cam.updateProjectionMatrix();
    this.catcher.position.set(sphere.center.x, box.min.y - 0.005, sphere.center.z);
    // Wide enough that its edge stays off-screen at any orbit distance.
    this.catcher.scale.setScalar(sphere.radius * 40);
    if (reframe) {
      const dist = (sphere.radius / Math.sin(((this.camera.fov / 2) * Math.PI) / 180)) * 0.85;
      // Three-quarter view from the front-left, slightly above: the contact-sheet "iso" angle.
      const dir = new Vector3(1, 0.55, 1.1).normalize();
      this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
      this.camera.near = Math.max(0.01, dist / 100);
      this.camera.far = dist * 20;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(sphere.center);
    }
    return sphere.center;
  }

  /** Grid on or off (the studio look hides it; the drawing look keeps it). */
  showGrid(on: boolean): void {
    this.gridOn = on;
    if (this.grid) this.grid.visible = on;
  }

  /**
   * Keep the sun's direction (scenarios sweep it) but move its shadow camera onto the content,
   * wherever a scenario has driven it, so the shadow map always covers the asset.
   */
  syncShadow(focus: Object3D | null = this.content): void {
    if (!focus) return;
    const at = new Box3().setFromObject(focus).getCenter(new Vector3());
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.target.position.copy(at);
    this.sun.position.copy(at).addScaledVector(dir, this.radius * 4);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private bounds(object: Object3D): Box3 {
    const box = new Box3().setFromObject(object);
    return box.isEmpty() ? new Box3(new Vector3(-1, 0, -1), new Vector3(1, 1, 1)) : box;
  }

  private layGrid(box: Box3): void {
    if (!this.withGrid) return;
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.dispose();
    }
    const size = box.getSize(new Vector3());
    // 1 m cells, at least 2 m of margin around the footprint, rounded to an even count.
    const span = Math.ceil(Math.max(size.x, size.z, 2) / 2 + 2) * 2;
    this.grid = new GridHelper(span, span, token('--grid-major'), token('--grid-minor'));
    this.grid.position.y = Math.min(0, box.min.y) - 0.02;
    this.grid.visible = this.gridOn;
    this.scene.add(this.grid);
  }
}

/** Free the GPU buffers of a loaded GLB scene. */
export function disposeTree(object: Object3D): void {
  object.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of [o.material].flat()) m.dispose();
  });
}
