// Open water, for anything whose asset declares `medium: 'water'`: the swim clip repeats on the spot
// (root travel removed), the camera drifts alongside, and once per loop a `burst` fades in and out
// when the asset has one. No floor, no diorama, no contact shadow. The pose is a pure function of
// loop time, and the loop is a whole number of clip repeats, so the wrap has no seam. `turn_*` clips
// stay out: they swing the whole body through a full circle, which no in-place fade can hide.
// Hooks: medium, clips. Reduced motion keeps the camera and body still and skips the burst.

import { type AnimationAction, MathUtils, type Vector3 } from 'three';
import { around, ease, phase } from './cinema.ts';
import { burstClip, inPlace, swimClip } from './clips.ts';
import type { Hooks } from './hooks.ts';
import type { Scenario, ScenarioContext, ScenarioDef } from './types.ts';

/** Shortest show, seconds; the clip's repeats round it up. */
const MIN_LOOP = 24;
const BURST_START = 0.5; // share of the loop
const BURST_SECONDS = 5;
const BURST_FADE = 0.9;
/** Radians off the nose (π/2 is side-on): a tail beat is sideways, so a flank view would hide it. */
const VIEW_ANGLE = 0.8;
const VIEW_DRIFT = 0.3;
const MARGIN = 1.3;
/** Share of the body length the animal rises and falls. */
const BOB = 0.012;
const TAU = 2 * Math.PI;

/** A whole number of `clip` repeats, at least MIN_LOOP seconds. */
export const loopSeconds = (clip: number | null): number =>
  clip ? Math.ceil(MIN_LOOP / clip) * clip : MIN_LOOP;

/** Weight of the burst at loop time `t`: 0 outside its window, so the loop wraps on cruise alone. */
export function burstWeight(t: number, duration: number): number {
  const start = duration * BURST_START;
  return (
    ease(phase(t, start, start + BURST_FADE)) *
    (1 - ease(phase(t, start + BURST_SECONDS - BURST_FADE, start + BURST_SECONDS)))
  );
}

/** Camera distance that keeps the body whole at any drift angle, in either screen orientation. */
export function fitDistance(size: Vector3, fovDeg: number, aspect: number): number {
  const tall = Math.tan(MathUtils.degToRad(fovDeg) / 2);
  const across = Math.max(size.x, size.z) / (2 * tall * aspect);
  return Math.max(across, size.y / (2 * tall)) * MARGIN + Math.min(size.x, size.z) / 2;
}

class Swim implements Scenario {
  readonly duration: number;
  private readonly swim: AnimationAction | null;
  private readonly burst: AnimationAction | null;

  constructor(private readonly ctx: ScenarioContext) {
    const { hooks: h, mixer, reducedMotion } = ctx;
    const clip = swimClip(h.clips);
    const fast = reducedMotion ? null : burstClip(h.clips);
    this.duration = loopSeconds(clip?.duration ?? null);
    this.swim = clip && mixer ? mixer.clipAction(inPlace(clip)) : null;
    this.burst = fast && mixer && fast !== clip ? mixer.clipAction(inPlace(fast)) : null;
    this.swim?.play();
    this.burst?.setEffectiveWeight(0).play();
    ctx.stage.reach(Math.max(h.size.x, h.size.y, h.size.z) * 20);
  }

  moving(): number {
    return 1;
  }

  update(t: number): void {
    const { hooks: h, camera, carrier, mixer, reducedMotion } = this.ctx;
    this.pose(t);
    mixer?.update(0);
    const turn = reducedMotion ? 0 : (TAU * t) / this.duration;
    carrier.position.y = Math.sin(turn * 2) * h.size.z * BOB;
    const r = fitDistance(h.size, camera.fov, camera.aspect) * (1 + 0.05 * Math.cos(turn));
    const eye = around(
      h.center,
      r,
      r * (0.2 + 0.04 * Math.sin(turn)),
      VIEW_ANGLE + VIEW_DRIFT * Math.sin(turn),
    );
    camera.position.copy(eye);
    camera.lookAt(h.center);
  }

  private pose(t: number): void {
    const { swim, burst } = this;
    if (swim) swim.time = t % swim.getClip().duration;
    if (!burst) return;
    const length = burst.getClip().duration;
    const since = t - this.duration * BURST_START;
    burst.time = ((since % length) + length) % length;
    const w = burstWeight(t, this.duration);
    burst.setEffectiveWeight(w);
    swim?.setEffectiveWeight(1 - w);
  }

  dispose(): void {
    this.ctx.mixer?.stopAllAction();
    this.ctx.carrier.position.y = 0;
  }
}

export const swim: ScenarioDef = {
  id: 'swim',
  title: 'Open water',
  matches: (h: Hooks) => h.medium === 'water',
  ground: () => null,
  describe: (h) => {
    const clip = swimClip(h.clips);
    if (!clip) return 'no floor, no clip to play';
    return `clip: ${clip.name}, on the spot${burstClip(h.clips) ? ' · burst' : ''}`;
  },
  create: (ctx) => new Swim(ctx),
};
