// Tracked-vehicle controller: integrates throttle/steer into hull motion, then drives the rig —
// each wheel spins at its own track's speed over its own radius, turret and gun follow the aim.

import { Group, MathUtils } from 'three';
import type { Controls } from './input.ts';
import type { TankRig } from './rig.ts';
import { fitToGround } from './terrain.ts';

const MAX_SPEED = 11; // m/s, ~40 km/h on road
const MAX_REVERSE = 4;
const ACCEL = 4.5;
const DRAG = 2.5;
const TURN_RATE = 0.7; // rad/s, pivot-capable
const TRAVERSE_RATE = MathUtils.degToRad(40);
const ELEVATION_RATE = MathUtils.degToRad(12);
const DEPRESSION = MathUtils.degToRad(-8);
const ELEVATION = MathUtils.degToRad(15);
const MOUSE = 0.0025; // rad per pixel
const ARENA = 170;

export class Vehicle {
  /** World-space carrier: Y-up, heading about +Y. The GLB root sits inside it. */
  readonly body = new Group();
  speed = 0;
  heading = 0;
  turretYaw = 0;
  gunPitch = 0;
  private aimYaw = 0;
  private aimPitch = 0;

  private pitch = 0;
  private roll = 0;

  constructor(readonly rig: TankRig) {
    this.body.add(rig.root);
    // Heading about world Y first, then pitch about the hull's Z, then roll about its X.
    this.body.rotation.order = 'YZX';
    this.settle(1);
  }

  /** Sit the hull on the terrain: height from the ground, pitch and roll from 4 samples. */
  private settle(k: number): void {
    const { x, z } = this.body.position;
    const fit = fitToGround(x, z, this.heading, this.rig.length * 0.8, this.rig.width * 0.8);
    this.pitch += (fit.pitch - this.pitch) * k;
    this.roll += (fit.roll - this.roll) * k;
    this.body.position.y += (fit.y - this.body.position.y) * k;
    this.body.rotation.set(this.roll, this.heading, this.pitch);
  }

  update(dt: number, c: Controls & { mouseX: number; mouseY: number }): void {
    const target = c.throttle > 0 ? MAX_SPEED : c.throttle < 0 ? -MAX_REVERSE : 0;
    const rate = c.throttle !== 0 ? ACCEL : DRAG;
    this.speed += MathUtils.clamp(target - this.speed, -rate * dt, rate * dt);
    // Hills cost speed going up and give some back going down.
    this.speed -= 9.81 * Math.sin(this.pitch) * 0.25 * dt;
    // Steering reverses with the hull, like a car, so S + A backs to the left.
    const turn = c.steer * TURN_RATE * (this.speed < -0.1 ? -1 : 1);
    this.heading += turn * dt;

    // The rig root is wrapped by frontToX, so authoring +X (front) is body +X before heading.
    this.body.position.x += Math.cos(this.heading) * this.speed * dt;
    this.body.position.z -= Math.sin(this.heading) * this.speed * dt;
    this.body.position.x = MathUtils.clamp(this.body.position.x, -ARENA, ARENA);
    this.body.position.z = MathUtils.clamp(this.body.position.z, -ARENA, ARENA);
    this.settle(1 - Math.exp(-12 * dt));

    // Track speeds differ when turning: the outer track runs faster than the inner one.
    const { wheels, halfTrack, turret, gun } = this.rig;
    for (const w of wheels) {
      const v = this.speed - w.side * turn * halfTrack;
      w.node.rotation.y += (v / w.radius) * dt;
    }

    this.aimYaw -= c.mouseX * MOUSE;
    this.aimYaw += c.traverse * TRAVERSE_RATE * dt;
    this.aimPitch = MathUtils.clamp(
      this.aimPitch - c.mouseY * MOUSE + c.elevate * ELEVATION_RATE * dt,
      DEPRESSION,
      ELEVATION,
    );
    // The turret drive has a finite slew rate; it chases the aim instead of snapping to it.
    const yawError = Math.atan2(
      Math.sin(this.aimYaw - this.turretYaw),
      Math.cos(this.aimYaw - this.turretYaw),
    );
    this.turretYaw += MathUtils.clamp(yawError, -TRAVERSE_RATE * dt, TRAVERSE_RATE * dt);
    this.gunPitch += MathUtils.clamp(
      this.aimPitch - this.gunPitch,
      -ELEVATION_RATE * dt,
      ELEVATION_RATE * dt,
    );
    // Turret yaws about its local Z (authoring up); the gun pitches about local Y, nose-up negative.
    if (turret) turret.rotation.z = this.turretYaw;
    if (gun) gun.rotation.y = -this.gunPitch;
  }
}
