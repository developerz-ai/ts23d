// Locomotive: runs along a long line built by tiling its own `track` part, baked `run` clip on
// (axles, rods), stack smoke always and steam while moving; the camera pans from trackside.
// Hooks: `axle_*` / `*driver*`, `track`, the `run` clip, emitters.

import { Box3, Group, Vector3 } from 'three';
import { Dolly } from './cinema.ts';
import { emitterSummary, footprint, type Hooks } from './hooks.ts';
import type { Scenario, ScenarioContext, ScenarioDef } from './types.ts';

const RUNNING = /^axle_|driver/;
const DURATION = 12;

class LocoRun implements Scenario {
  readonly duration = DURATION;
  private readonly dolly: Dolly;
  private readonly rails = new Group();
  private readonly D: number;

  constructor(private readonly ctx: ScenarioContext) {
    const h = ctx.hooks;
    this.dolly = new Dolly(ctx.camera, 3);
    this.D = h.size.z * 2.5;
    const track = h.node('track');
    if (track) {
      // The model carries its own short track; lay copies of it end to end as a static line.
      track.updateWorldMatrix(true, false);
      const len = Math.max(0.5, new Box3().setFromObject(track).getSize(new Vector3()).z);
      const n = Math.min(40, Math.ceil((this.D + h.size.z) / len) + 1);
      for (let i = -n; i <= n; i++) {
        const tile = track.clone();
        track.matrixWorld.decompose(tile.position, tile.quaternion, tile.scale);
        tile.position.z += i * len;
        this.rails.add(tile);
      }
      track.visible = false;
      ctx.scene.add(this.rails);
    }
    ctx.stage.reach(this.D * 6);
    if (ctx.clip && ctx.mixer) ctx.mixer.clipAction(ctx.clip).play();
  }

  moving(): number {
    return 1;
  }

  update(t: number, dt: number): void {
    const { carrier, hooks: h } = this.ctx;
    const z = -this.D + (2 * this.D * t) / DURATION;
    carrier.position.set(0, 0, z);
    carrier.rotation.y = 0;
    this.ctx.mixer?.update(dt);
    // Trackside, a little ahead of the middle: the loco approaches, passes and runs away.
    const eye = new Vector3(h.size.x * 2.2 + h.size.y * 1.4, h.size.y * 0.55, this.D * 0.2);
    const look = new Vector3(0, h.center.y, z);
    this.dolly.aim(t, dt, eye, look, this.ctx.reducedMotion);
  }

  dispose(): void {
    this.ctx.scene.remove(this.rails);
    const track = this.ctx.hooks.node('track');
    if (track) track.visible = true;
    this.ctx.mixer?.stopAllAction();
  }
}

export const locomotive: ScenarioDef = {
  id: 'locomotive',
  title: 'Running',
  matches: (h: Hooks) => h.all(RUNNING).length > 0 && h.node('track') !== null,
  ground: (h) => footprint(h, h.size.z * 3.6, Math.max(h.size.x * 2.5, h.size.z * 0.45)),
  describe: (h) =>
    `running: ${h.families(RUNNING)}, track${h.clip ? ' · clip: run' : ''}${emitterSummary(h)}`,
  create: (ctx) => new LocoRun(ctx),
};
