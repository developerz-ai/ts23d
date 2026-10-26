// Play mode: compose the world from recipes, bind the player's tank by part names, run the loop.
// Built lazily on first visit to #play and paused whenever the section is hidden.

import { type LOD, PerspectiveCamera, Timer, Vector3, WebGLRenderer } from 'three';
import { frontToX } from '../axes.ts';
import { loadBuilt, recipe } from '../compile.ts';
import { GUN_FLASH, GUN_SMOKE } from '../particle-kinds.ts';
import { emitterOf, Particles } from '../particles.ts';
import type { Recipe } from '../recipes.ts';
import { reducedMotion } from '../theme.ts';
import { ChaseCamera } from './camera.ts';
import { Hud } from './hud.ts';
import { Input } from './input.ts';
import { bindRig } from './rig.ts';
import { Vehicle } from './vehicle.ts';
import { Weapon } from './weapon.ts';
import { composeWorld, pickPlayer, type World } from './world.ts';

interface Session {
  readonly world: World;
  readonly vehicle: Vehicle;
  readonly weapon: Weapon | null;
  readonly chase: ChaseCamera;
  /** Which 'event' emitter kinds the tank recipe declares itself (muzzle, smoke, …). */
  readonly ownEvents: ReadonlySet<string>;
}

const mix = (lods: readonly LOD[]): [number, number, number] => {
  const out: [number, number, number] = [0, 0, 0];
  for (const lod of lods) {
    const i = lod.getCurrentLevel();
    if (i === 0 || i === 1 || i === 2) out[i]++;
  }
  return out;
};

export class PlayMode {
  private readonly renderer = new WebGLRenderer({ antialias: true });
  private readonly camera = new PerspectiveCamera(55, 16 / 9, 0.1, 400);
  private readonly timer = new Timer();
  private readonly particles = new Particles(1943);
  private throttle = 0;
  private readonly hud: Hud;
  private input: Input | null = null;
  private session: Promise<Session | null> | null = null;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly recipes: readonly Recipe[],
    hud: HTMLElement,
    toast: HTMLElement,
    private readonly status: HTMLElement,
  ) {
    this.hud = new Hud(hud, toast);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute(
      'aria-label',
      'Play mode: drive with WASD or the arrow keys, Space to fire',
    );
    viewport.prepend(canvas);
    new ResizeObserver(() => this.resize()).observe(viewport);
  }

  /** Measured FPS, exposed for the smoke test. */
  get fps(): number {
    return this.hud.framesPerSecond;
  }

  async start(): Promise<void> {
    this.session ??= this.setup();
    const s = await this.session;
    if (!s) return;
    this.input ??= new Input(this.renderer.domElement);
    this.renderer.domElement.focus({ preventScroll: true });
    this.timer.reset();
    this.renderer.setAnimationLoop((t) => this.tick(s, t));
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
    this.input?.dispose();
    this.input = null;
  }

  private async setup(): Promise<Session | null> {
    const asset = await pickPlayer(this.recipes);
    if (!asset) {
      this.status.textContent =
        'No vehicle recipe found in recipes/*.ts, so there is nothing to drive yet.';
      return null;
    }
    this.status.textContent = `Compiling ${this.recipes.length} recipes × 3 LODs in your browser…`;
    const t0 = performance.now();
    const [world, loaded] = await Promise.all([
      composeWorld(this.recipes, asset, this.particles),
      loadBuilt(recipe(asset.name, 0)),
    ]);
    const rig = bindRig(frontToX(loaded.scene));
    loaded.scene.traverse((n) => {
      n.castShadow = true;
    });
    const vehicle = new Vehicle(rig);
    world.scene.add(vehicle.body);
    const weapon = rig.barrel ? new Weapon(rig.barrel) : null;
    // 'moving' emitters (track dust, exhaust under load) follow the throttle and the hull speed.
    const own = this.particles.attach(loaded.scene, (e) =>
      (e.when ?? 'always') === 'moving'
        ? Math.max(Math.abs(this.throttle) * 0.6, Math.abs(vehicle.speed) / 11)
        : 1,
    );
    const ownEvents = new Set<string>();
    loaded.scene.traverse((n) => {
      const e = emitterOf(n);
      if (e?.when === 'event') ownEvents.add(e.kind);
    });
    const chase = new ChaseCamera(this.camera, 13, 5.5, !reducedMotion());
    chase.snap(vehicle.body, 0);
    const ms = performance.now() - t0;
    this.status.textContent = `Driving ${asset.name}. ${world.props.length} other recipes as scenery. Compiled and loaded in ${ms.toFixed(0)} ms.`;
    const emitters = own.length ? [`${own.length} × emitter → particles (${own.join(', ')})`] : [];
    this.hud.toast(`${asset.name}: game code bound to these part names`, [
      ...rig.bound,
      ...emitters,
    ]);
    return { world, vehicle, weapon, chase, ownEvents };
  }

  private tick(s: Session, time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const controls = this.input?.read() ?? {
      throttle: 0,
      steer: 0,
      traverse: 0,
      elevate: 0,
      fired: false,
      mouseX: 0,
      mouseY: 0,
    };
    const { world, vehicle, weapon, chase } = s;
    this.throttle = controls.throttle;
    vehicle.update(dt, controls);
    if (weapon?.update(dt, controls.fired)) this.fire(s);
    for (const move of world.movers) move(dt);
    for (const mixer of world.mixers) mixer.update(dt);
    vehicle.body.updateMatrixWorld();
    this.particles.update(dt);

    const p = vehicle.body.position;
    world.sun.position.set(p.x + 30, 50, p.z + 20);
    world.sun.target.position.copy(p);
    chase.update(dt, vehicle.body, vehicle.heading, vehicle.turretYaw);
    this.renderer.render(world.scene, this.camera);

    this.hud.frame({
      dt,
      renderer: this.renderer,
      levels: mix(world.lods),
      ground: mix(world.terrain),
      particles: this.particles.count,
      speed: vehicle.speed,
      turretYaw: vehicle.turretYaw,
    });
  }

  /** The recipe's 'event' emitters, plus a built-in flash or smoke puff for whichever it lacks. */
  private fire(s: Session): void {
    this.particles.trigger(s.vehicle.rig.root);
    if (!s.weapon) return;
    const h = s.vehicle.heading;
    const v = new Vector3(Math.cos(h), 0, -Math.sin(h)).multiplyScalar(s.vehicle.speed);
    if (!s.ownEvents.has('muzzle')) this.particles.puff(s.weapon.muzzle, GUN_FLASH, v);
    if (!s.ownEvents.has('smoke')) this.particles.puff(s.weapon.muzzle, GUN_SMOKE, v);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.viewport;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
