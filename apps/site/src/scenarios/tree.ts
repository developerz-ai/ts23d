// Tree: a wind gust on the baked crown sway (weight and speed ramp up and down), a few falling
// leaves, and a slow orbit under a soft sun. Hooks: `crown`, the `run` clip.

import { type AnimationAction, Box3, Object3D, Vector3 } from 'three';
import { around, Dolly } from './cinema.ts';
import { emitterSummary, footprint, type Hooks } from './hooks.ts';
import type { Scenario, ScenarioContext, ScenarioDef } from './types.ts';

const DURATION = 16;

class Gust implements Scenario {
  readonly duration = DURATION;
  private readonly dolly: Dolly;
  private readonly action: AnimationAction | null;
  private readonly leaves = new Object3D();
  private gust = 0;

  constructor(private readonly ctx: ScenarioContext) {
    const h = ctx.hooks;
    this.dolly = new Dolly(ctx.camera, 1.5);
    this.action = ctx.clip && ctx.mixer ? ctx.mixer.clipAction(ctx.clip) : null;
    this.action?.play();
    const crown = h.node('crown');
    if (crown) {
      // A leaf emitter at the crown's centre, declared the same way a recipe would.
      const centre = new Box3().setFromObject(crown).getCenter(new Vector3());
      this.leaves.position.copy(crown.worldToLocal(centre));
      this.leaves.userData['ts23d'] = {
        emitter: {
          kind: 'dust',
          rate: 5,
          life: 5,
          size: [0.22, 0.16],
          color: [0.16, 0.24, 0.05],
          dir: [0, 0, -1],
          speed: 0.8,
          spreadDeg: 75,
          when: 'moving',
        },
      };
      crown.add(this.leaves);
      ctx.particles.attach(this.leaves, () => this.gust);
    }
    ctx.stage.hemi.intensity = 2;
    ctx.stage.sun.intensity = 1.5;
    ctx.stage.sun.color.setRGB(1, 0.94, 0.84);
  }

  moving(): number {
    return this.gust;
  }

  update(t: number, dt: number): void {
    const h = this.ctx.hooks;
    // One gust per loop: calm, build, peak, die away.
    this.gust = 0.2 + 0.8 * Math.sin((Math.PI * t) / DURATION) ** 2;
    this.action?.setEffectiveWeight(0.35 + 0.65 * this.gust);
    this.action?.setEffectiveTimeScale(0.6 + 1.4 * this.gust);
    this.ctx.mixer?.update(dt);
    // Far enough that the whole tree fits the 35° lens, with a little ground around it.
    const r = Math.max(h.size.y * 1.9, Math.max(h.size.x, h.size.z) * 1.6);
    const angle = (2 * Math.PI * t) / DURATION;
    const eye = around(new Vector3(h.center.x, 0, h.center.z), r, h.size.y * 0.42, angle);
    this.dolly.aim(t, dt, eye, new Vector3(h.center.x, h.size.y * 0.45, h.center.z), true);
  }

  dispose(): void {
    this.ctx.particles.detach(this.leaves);
    this.leaves.removeFromParent();
    this.ctx.mixer?.stopAllAction();
    this.ctx.stage.relight();
  }
}

export const tree: ScenarioDef = {
  id: 'tree',
  title: 'Wind',
  matches: (h: Hooks) => h.kind === 'vegetation' || h.node('crown') !== null,
  ground: (h) => {
    const r = Math.max(h.size.x, h.size.z) * 0.6 + 1;
    return footprint(h, r, r);
  },
  describe: (h) =>
    `wind: ${h.node('crown') ? 'crown' : 'whole tree'} sway${h.clip ? ' (run clip)' : ''}${emitterSummary(h)}`,
  create: (ctx) => new Gust(ctx),
};
