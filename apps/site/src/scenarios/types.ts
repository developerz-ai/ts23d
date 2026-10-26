// The scenario contract. A scenario is a short, looping, non-interactive show built from an asset's
// named parts (the engine hooks), never from its name. The viewer owns the clock; a scenario
// poses the model, the camera and the lights for a given time.

import type { AnimationClip, AnimationMixer, Object3D, PerspectiveCamera, Scene } from 'three';
import type { Footprint } from '../diorama.ts';
import type { Particles } from '../particles.ts';
import type { Stage } from '../stage.ts';
import type { Hooks } from './hooks.ts';

export interface ScenarioContext {
  readonly hooks: Hooks;
  /** The model's carrier: move and turn this (glTF frame: front +Z, left +X, up +Y). */
  readonly carrier: Object3D;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
  readonly particles: Particles;
  readonly mixer: AnimationMixer | null;
  readonly clip: AnimationClip | null;
  readonly reducedMotion: boolean;
}

export interface Scenario {
  /** Seconds per loop. */
  readonly duration: number;
  /** 0..1, how hard the asset is "working": drives 'moving' emitters (track dust, steam). */
  moving(): number;
  /** Pose everything for loop time `t` (0 ≤ t < duration). `dt` is 0 while paused. */
  update(t: number, dt: number): void;
  /** Undo anything added to the scene or changed on the stage. */
  dispose(): void;
}

export interface ScenarioDef {
  readonly id: string;
  /** Shown in the overlay, e.g. "Driving". */
  readonly title: string;
  matches(h: Hooks): boolean;
  /** The diorama this scenario needs, in authoring space (Z-up, front +X). */
  ground(h: Hooks): Footprint;
  /** One line naming the hooks used, for the overlay. */
  describe(h: Hooks): string;
  create(ctx: ScenarioContext): Scenario;
}
