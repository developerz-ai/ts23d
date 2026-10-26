// Small camera and timing helpers shared by the scenarios.

import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';

/** 0..1 progress of `t` through [a, b], clamped. */
export const phase = (t: number, a: number, b: number): number =>
  MathUtils.clamp((t - a) / (b - a), 0, 1);

/** Smooth in and out. */
export const ease = (u: number): number => u * u * (3 - 2 * u);

/**
 * A camera that eases toward a goal instead of snapping, so cuts between shots read as camera
 * moves. Snaps when time jumps (first frame, replay, loop wrap) or when motion is reduced.
 */
export class Dolly {
  private readonly look = new Vector3();
  private last = Number.NaN;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly lag: number,
  ) {}

  aim(t: number, dt: number, position: Vector3, target: Vector3, reduced: boolean): void {
    const jumped = !(Math.abs(t - this.last) < 0.5);
    this.last = t;
    const k = jumped || reduced ? 1 : dt > 0 ? 1 - Math.exp(-this.lag * dt) : 0;
    this.camera.position.lerp(position, k);
    this.look.lerp(target, k);
    this.camera.lookAt(this.look);
  }
}

/** A point on a horizontal circle around `center`. */
export const around = (center: Vector3, radius: number, height: number, angle: number): Vector3 =>
  new Vector3(
    center.x + Math.sin(angle) * radius,
    center.y + height,
    center.z + Math.cos(angle) * radius,
  );
