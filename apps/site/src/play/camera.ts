// Chase camera: trails the hull, looks a little ahead of it, and eases rather than snaps.

import { MathUtils, type Object3D, type PerspectiveCamera, Vector3 } from 'three';

export class ChaseCamera {
  private readonly goal = new Vector3();
  private readonly look = new Vector3();
  private readonly lookGoal = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly distance: number,
    private readonly height: number,
    private readonly smooth: boolean,
  ) {}

  update(dt: number, target: Object3D, heading: number, aim: number): void {
    // Sit behind the hull, swung part of the way toward where the turret points.
    const yaw = heading + aim * 0.35;
    this.goal.set(
      target.position.x - Math.cos(yaw) * this.distance,
      target.position.y + this.height,
      target.position.z + Math.sin(yaw) * this.distance,
    );
    this.lookGoal.set(
      target.position.x + Math.cos(yaw) * 6,
      target.position.y + 1.5,
      target.position.z - Math.sin(yaw) * 6,
    );
    const k = this.smooth ? 1 - Math.exp(-4 * dt) : 1;
    this.camera.position.lerp(this.goal, k);
    this.look.lerp(this.lookGoal, this.smooth ? 1 - Math.exp(-8 * dt) : 1);
    this.camera.lookAt(this.look);
  }

  /** Jump straight to the goal (first frame, or after a teleport). */
  snap(target: Object3D, heading: number): void {
    this.camera.position.set(
      target.position.x - Math.cos(heading) * this.distance,
      target.position.y + this.height,
      target.position.z + Math.sin(heading) * this.distance,
    );
    this.look.set(target.position.x, target.position.y + 1.5, target.position.z);
    this.camera.lookAt(this.look);
    this.camera.near = MathUtils.clamp(this.distance / 50, 0.05, 0.5);
    this.camera.updateProjectionMatrix();
  }
}
