// Fallback: a slow turntable orbit with the baked `run` clip, if there is one.

import { around, Dolly } from './cinema.ts';
import { emitterSummary, footprint, type Hooks } from './hooks.ts';
import type { Scenario, ScenarioContext, ScenarioDef } from './types.ts';

const DURATION = 12;

class Turntable implements Scenario {
  readonly duration = DURATION;
  private readonly dolly: Dolly;

  constructor(private readonly ctx: ScenarioContext) {
    this.dolly = new Dolly(ctx.camera, 2);
    if (ctx.clip && ctx.mixer) ctx.mixer.clipAction(ctx.clip).play();
  }

  moving(): number {
    return this.ctx.clip ? 1 : 0;
  }

  update(t: number, dt: number): void {
    const h = this.ctx.hooks;
    this.ctx.mixer?.update(dt);
    const r = Math.max(h.size.x, h.size.y, h.size.z) * 1.6;
    const eye = around(h.center, r, r * 0.35, (2 * Math.PI * t) / DURATION + 0.6);
    this.dolly.aim(t, dt, eye, h.center.clone(), true);
  }

  dispose(): void {
    this.ctx.mixer?.stopAllAction();
  }
}

export const turntable: ScenarioDef = {
  id: 'turntable',
  title: 'Turntable',
  matches: () => true,
  ground: (h: Hooks) => footprint(h, h.size.z / 2, h.size.x / 2),
  describe: (h) => `turntable${h.clip ? ' · clip: run' : ''}${emitterSummary(h)}`,
  create: (ctx) => new Turntable(ctx),
};
