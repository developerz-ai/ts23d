// The shared three.js stage: lights (a shadow-casting sun), a metre grid and a shadow-catching floor
// under the asset, and camera framing for it.

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
} from 'three';
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
  private grid: GridHelper | null = null;
  private gridOn = true;
  private content: Object3D | null = null;
  private radius = 1;

  constructor(private readonly withGrid: boolean) {
    this.relight();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.hemi, this.sun, this.fill, this.sun.target, this.catcher);
    onSchemeChange(() => this.content && this.layGrid(this.bounds(this.content)));
  }

  /** The neutral studio lighting every scenario starts from. */
  relight(): void {
    // Matches the CLI beauty rig (src/render/lighting.ts): a warm key that lands the albedo on
    // sun-facing surfaces, a cool sky fill with a warm ground bounce, from the camera's left.
    this.hemi.intensity = 1.1;
    this.hemi.color.setRGB(0.78, 0.84, 1);
    this.hemi.groundColor.setRGB(0.55, 0.5, 0.44);
    this.sun.intensity = 3;
    this.sun.color.setRGB(0.95, 0.91, 0.84);
    this.sun.position.set(-4, 10, 8);
    this.sun.target.position.set(0, 0, 0);
    this.fill.intensity = 0.2;
    this.fill.position.set(8, 3, -6);
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
    this.catcher.scale.setScalar(sphere.radius * 8);
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
