// The shared three.js stage: lights, a metre grid on the ground, and camera framing for an asset.

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
import { onSchemeChange, token } from './theme.ts';

export class Stage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(35, 1, 0.05, 2000);
  private grid: GridHelper | null = null;
  private content: Object3D | null = null;

  constructor(private readonly withGrid: boolean) {
    const hemi = new HemisphereLight(0xffffff, 0x404850, 1.6);
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 10, 8);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-8, 4, -6);
    this.scene.add(hemi, sun, fill);
    onSchemeChange(() => this.content && this.layGrid(this.bounds(this.content)));
  }

  /** Swap the displayed object. `reframe` moves the camera; keep it false across LOD switches. */
  show(object: Object3D, reframe: boolean): Vector3 {
    if (this.content) this.scene.remove(this.content);
    this.content = object;
    this.scene.add(object);
    const box = this.bounds(object);
    this.layGrid(box);
    const sphere = box.getBoundingSphere(new Sphere());
    if (reframe) {
      const dist = (sphere.radius / Math.sin(((this.camera.fov / 2) * Math.PI) / 180)) * 1.05;
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
