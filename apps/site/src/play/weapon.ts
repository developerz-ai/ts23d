// Cosmetic main gun: muzzle flash at the barrel tip and a recoil slide of `gun_barrel`.

import {
  AdditiveBlending,
  Box3,
  ConeGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Vector3,
} from 'three';

const COOLDOWN = 1.2;
const RECOIL = 0.35; // metres
const FLASH = 0.09; // seconds

export class Weapon {
  private readonly flash: Mesh;
  /** An empty at the muzzle, oriented like the barrel: particle bursts start here. */
  readonly muzzle = new Object3D();
  private readonly light = new PointLight(0xffc46b, 0, 30, 1.6);
  private readonly rest: Vector3;
  private t = Number.POSITIVE_INFINITY;
  private cooldown = 0;

  constructor(private readonly barrel: Object3D) {
    this.rest = barrel.position.clone();
    // The barrel's own geometry tells us where the muzzle is: its far end along local +X.
    const parent = barrel.parent;
    barrel.removeFromParent();
    barrel.position.set(0, 0, 0);
    barrel.updateMatrixWorld(true);
    const box = new Box3().setFromObject(barrel);
    parent?.add(barrel);
    barrel.position.copy(this.rest);
    // Detached, the barrel's world frame is its own Z-up local frame, so the box is local too.
    const local = new Vector3(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);

    const cone = new ConeGeometry(0.35, 1.6, 10, 1, true);
    cone.rotateZ(-Math.PI / 2);
    cone.translate(0.8, 0, 0);
    this.flash = new Mesh(
      cone,
      new MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.visible = false;
    this.flash.position.copy(local);
    this.light.position.copy(local).x += 0.6;
    this.muzzle.position.copy(local);
    barrel.add(this.flash, this.light, this.muzzle);
  }

  /** Returns true when a shot actually went off (not on cooldown). */
  update(dt: number, fire: boolean): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    let fired = false;
    if (fire && this.cooldown === 0) {
      this.t = 0;
      this.cooldown = COOLDOWN;
      fired = true;
    } else {
      this.t += dt;
    }
    const lit = this.t < FLASH;
    this.flash.visible = lit;
    this.flash.scale.setScalar(lit ? 0.7 + Math.random() * 0.6 : 1);
    this.light.intensity = lit ? 60 : 0;
    // Recoil: snap back in 60 ms, run out over ~0.8 s.
    const k = this.t < 0.06 ? this.t / 0.06 : Math.max(0, 1 - (this.t - 0.06) / 0.8);
    this.barrel.position.x = this.rest.x - RECOIL * k * k;
    return fired;
  }
}
