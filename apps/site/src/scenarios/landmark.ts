// Building, tower or other static asset: a turntable orbit through a day (morning, noon, golden
// hour, dusk); tall things get a camera that rises from street level to the top.
// Hooks: none needed; the kind and the size decide.

import { Color, Vector3 } from 'three';
import { around, Dolly, ease } from './cinema.ts';
import { footprint, type Hooks } from './hooks.ts';
import type { Scenario, ScenarioContext, ScenarioDef } from './types.ts';

const DURATION = 16;

/** Sun colour and strength through the day, keyed by loop progress. */
const DAY: readonly { at: number; color: Color; sun: number; sky: number; bg: Color }[] = [
  { at: 0, color: new Color(1, 0.8, 0.6), sun: 1.3, sky: 1.0, bg: new Color('#b9a99a') },
  { at: 0.45, color: new Color(1, 0.98, 0.95), sun: 2.6, sky: 1.7, bg: new Color('#9db4c8') },
  { at: 0.78, color: new Color(1, 0.68, 0.38), sun: 1.8, sky: 1.1, bg: new Color('#c4946a') },
  { at: 1, color: new Color(0.8, 0.42, 0.36), sun: 0.7, sky: 0.6, bg: new Color('#3a3450') },
];

function sky(p: number): { color: Color; sun: number; sky: number; bg: Color } {
  const i = Math.max(0, DAY.findIndex((k) => k.at >= p) - 1);
  const a = DAY[i] ?? DAY[0];
  const b = DAY[i + 1] ?? a;
  if (!a || !b) return { color: new Color(1, 1, 1), sun: 2, sky: 1.5, bg: new Color('#9db4c8') };
  const u = b.at > a.at ? (p - a.at) / (b.at - a.at) : 0;
  return {
    color: a.color.clone().lerp(b.color, u),
    sun: a.sun + (b.sun - a.sun) * u,
    sky: a.sky + (b.sky - a.sky) * u,
    bg: a.bg.clone().lerp(b.bg, u),
  };
}

class Day implements Scenario {
  readonly duration = DURATION;
  private readonly dolly: Dolly;
  private readonly tall: boolean;
  private readonly background = new Color();

  constructor(private readonly ctx: ScenarioContext) {
    const h = ctx.hooks;
    this.dolly = new Dolly(ctx.camera, 2);
    this.tall = h.size.y > 1.5 * Math.max(h.size.x, h.size.z);
    ctx.stage.reach(Math.max(h.size.x, h.size.y, h.size.z) * 12);
    if (ctx.clip && ctx.mixer) ctx.mixer.clipAction(ctx.clip).play();
  }

  moving(): number {
    return 1;
  }

  update(t: number, dt: number): void {
    const { hooks: h, stage } = this.ctx;
    const p = t / DURATION;
    this.ctx.mixer?.update(dt);
    // The sun crosses the sky: up from the east, over, down in the west.
    const span = Math.max(h.size.x, h.size.y, h.size.z) * 3;
    const elev = Math.sin(Math.PI * Math.min(1, p * 1.05)) * 1.0 + 0.08;
    const az = Math.PI * (0.5 + p);
    stage.sun.position.set(
      h.center.x + Math.cos(az) * Math.cos(elev) * span,
      Math.sin(elev) * span,
      h.center.z + Math.sin(az) * Math.cos(elev) * span,
    );
    stage.sun.target.position.copy(h.center);
    const k = sky(p);
    stage.sun.color.copy(k.color);
    stage.sun.intensity = k.sun;
    stage.hemi.intensity = k.sky;
    stage.fill.intensity = 0.3 * k.sky;
    // The backdrop follows the sky, so the day reads even where the model is in shadow.
    this.ctx.scene.background = this.background.copy(k.bg);

    const ground = new Vector3(h.center.x, 0, h.center.z);
    const angle = 2 * Math.PI * p + 0.6;
    if (this.tall) {
      // Street level to the top: the camera climbs as it circles.
      const u = ease(p);
      const r = Math.max(h.size.x, h.size.z) * 1.25 + h.size.y * 0.35;
      const eye = around(ground, r, h.size.y * (0.04 + 1.0 * u), angle);
      const look = ground.clone().setY(h.size.y * (0.25 + 0.6 * u));
      this.dolly.aim(t, dt, eye, look, true);
    } else {
      const r = Math.max(h.size.x, h.size.y, h.size.z) * 1.7;
      const eye = around(ground, r, h.size.y * 0.8 + r * 0.25, angle);
      this.dolly.aim(t, dt, eye, h.center.clone(), true);
    }
  }

  dispose(): void {
    this.ctx.mixer?.stopAllAction();
    this.ctx.scene.background = null;
    this.ctx.stage.relight();
  }
}

export const landmark: ScenarioDef = {
  id: 'landmark',
  title: 'Turntable, time of day',
  matches: (h: Hooks) => h.kind === 'building' || (h.clip === null && h.kind !== 'vehicle'),
  ground: (h) => footprint(h, h.size.z / 2, h.size.x / 2),
  describe: (h) =>
    h.size.y > 1.5 * Math.max(h.size.x, h.size.z)
      ? 'turntable, morning to dusk, camera rising to the top'
      : 'turntable, morning to dusk',
  create: (ctx) => new Day(ctx),
};
