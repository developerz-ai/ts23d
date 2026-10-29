// Tracked vehicle: rolls along a gentle S-curve, stops, traverses the turret toward a target,
// elevates the gun, fires (the `muzzle` event emitter, a recoil slide, a little camera shake),
// returns the turret and drives on. Hooks: `turret`, `gun`, optional `gun_barrel`, running gear
// (`wheel_*`, `road_wheel_*`, `sprocket_*`, `idler_*`), emitters.

import { Box3, MathUtils, type Object3D, Vector3 } from 'three';
import { around, Dolly, ease, phase } from './cinema.ts';
import { emitterSummary, footprint, type Hooks } from './hooks.ts';
import type { Scenario, ScenarioContext, ScenarioDef } from './types.ts';

const GEAR = /^(road_)?wheel_|^sprocket|^idler|^return_roller/;
const DRIVE_IN = 5;
const STOP = 10;
const FIRE = 7.4;
const DURATION = 14;

interface Wheel {
  readonly node: Object3D;
  readonly radius: number;
}

class TrackedRun implements Scenario {
  readonly duration = DURATION;
  private readonly dolly: Dolly;
  private readonly wheels: Wheel[];
  private readonly turret: Object3D | null;
  private readonly gun: Object3D | null;
  private readonly barrel: Object3D | null;
  private readonly rest: Vector3;
  private readonly D: number;
  private readonly A: number;
  private speed = 0;
  private lastT = -1;

  constructor(private readonly ctx: ScenarioContext) {
    const h = ctx.hooks;
    this.dolly = new Dolly(ctx.camera, 2.2);
    this.wheels = h.all(GEAR).map((node) => ({
      node,
      radius: Math.max(0.1, new Box3().setFromObject(node).getSize(new Vector3()).y / 2),
    }));
    this.turret = h.node('turret');
    this.gun = h.node('gun');
    this.barrel = h.node('gun_barrel') ?? this.gun;
    this.rest = this.barrel?.position.clone() ?? new Vector3();
    this.D = h.size.z * 1.9;
    this.A = Math.min(h.size.x * 0.6, h.size.z * 0.35);
  }

  moving(): number {
    return MathUtils.clamp(Math.abs(this.speed) / (this.D / 2.5), 0, 1);
  }

  /** Distance along the path at time t: ease in to the stop, wait, accelerate away. */
  private s(t: number): number {
    if (t < DRIVE_IN) return -this.D + this.D * ease(t / DRIVE_IN);
    if (t < STOP) return 0;
    const u = phase(t, STOP, DURATION);
    return this.D * u * u;
  }

  update(t: number, dt: number): void {
    const { carrier, hooks: h, particles, camera } = this.ctx;
    const s = this.s(t);
    this.speed = (s - this.s(Math.max(0, t - 0.05))) / 0.05;
    const x = this.A * Math.sin((Math.PI * s) / this.D);
    const slope = ((this.A * Math.PI) / this.D) * Math.cos((Math.PI * s) / this.D);
    const heading = Math.atan2(slope, 1);
    carrier.position.set(x, 0, s);
    carrier.rotation.y = heading;

    // Every wheel turns at track speed over its own radius.
    for (const w of this.wheels) w.node.rotation.y += (this.speed / w.radius) * dt;

    // Turret out to the target, gun up, fire, then everything home.
    const yaw = 0.9 * (ease(phase(t, 5.3, 6.8)) - ease(phase(t, 8.6, 9.8)));
    const pitch = MathUtils.degToRad(8) * (ease(phase(t, 6.0, 7.0)) - ease(phase(t, 8.8, 9.8)));
    if (this.turret) this.turret.rotation.z = yaw;
    if (this.gun) this.gun.rotation.y = -pitch;
    const since = t - FIRE;
    const kick =
      since < 0 ? 0 : since < 0.06 ? since / 0.06 : Math.max(0, 1 - (since - 0.06) / 0.7);
    if (this.barrel) this.barrel.position.x = this.rest.x - h.size.z * 0.04 * kick * kick;
    if (dt > 0 && this.lastT < FIRE && t >= FIRE) particles.trigger(h.root);
    this.lastT = t;

    // Camera: slow follow from behind-left while driving, an orbit while stopped.
    const L = h.size.z;
    const H = h.size.y;
    const centre = new Vector3(x, h.center.y, s);
    const stopped = t >= DRIVE_IN - 0.5 && t < STOP + 0.5;
    const goal = stopped
      ? around(centre, L * 1.7, H * 0.9, heading + 0.9 + (t - DRIVE_IN) * 0.22)
      : around(centre, L * 1.9, H * 1.1, heading + Math.PI * 0.78);
    const look = centre.clone().setY(h.center.y * 0.9);
    this.dolly.aim(t, dt, goal, look, this.ctx.reducedMotion);
    if (since >= 0 && since < 0.5 && !this.ctx.reducedMotion) {
      const a = (1 - since / 0.5) * L * 0.012;
      camera.position.x += Math.sin(since * 90) * a;
      camera.position.y += Math.cos(since * 70) * a;
    }
  }

  dispose(): void {
    if (this.turret) this.turret.rotation.z = 0;
    if (this.gun) this.gun.rotation.y = 0;
    this.barrel?.position.copy(this.rest);
  }
}

export const tracked: ScenarioDef = {
  id: 'tracked',
  title: 'Driving',
  matches: (h: Hooks) =>
    h.kind === 'vehicle' && h.node('turret') !== null && h.node('gun') !== null,
  ground: (h) => footprint(h, h.size.z * 2.6, Math.max(h.size.x * 1.6, h.size.z * 0.9)),
  describe: (h) =>
    `driving: ${[h.families(GEAR), 'turret', 'gun'].filter(Boolean).join(', ')}${emitterSummary(h)}`,
  create: (ctx) => new TrackedRun(ctx),
};
