// The Studio's motion controls: a clip picker over every baked clip of the GLB (idle, walk, trot,
// gallop, blink, talk, run…; never the still `rest` pose) and a skeleton display toggle for
// skinned assets (three's SkeletonHelper in the redline colour). The viewer owns the clock and
// the Play state; this binds the chosen clip on its mixer and keeps the controls in step. A skinned
// asset's travelling loops play on the spot, so the model neither walks away nor snaps back. The
// model keeps its rest pose until Play; a clip that carries it outside the framed rest pose (a
// reared snake lying down to crawl) is reported once, posed, so the viewer can pull back.

import {
  type AnimationClip,
  type AnimationMixer,
  Box3,
  type Object3D,
  type Scene,
  SkeletonHelper,
  SkinnedMesh,
} from 'three';
import { firstClip, inPlace } from './scenarios/clips.ts';
import { token } from './theme.ts';

export interface MotionUi {
  readonly clip: HTMLSelectElement;
  readonly clipBox: HTMLElement;
  readonly skeleton: HTMLInputElement;
  readonly skeletonBox: HTMLElement;
}

/** Clips a visitor may pick: every baked clip but the still `rest` pose. */
export const pickable = (clips: readonly AnimationClip[]): AnimationClip[] =>
  clips.filter((c) => c.name !== 'rest');

const hasBones = (model: Object3D): boolean => {
  let bones = false;
  model.traverse((o) => {
    bones ||= (o as Object3D & { isBone?: boolean }).isBone === true;
  });
  return bones;
};

/** World bounds of the skin as posed now (bone matrices otherwise wait for the next render). */
function posedBounds(model: Object3D): Box3 {
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (o instanceof SkinnedMesh) o.skeleton.update();
  });
  return new Box3().expandByObject(model, true);
}

export class Motion {
  private mixer: AnimationMixer | null = null;
  private clips: AnimationClip[] = [];
  private model: Object3D | null = null;
  private helper: SkeletonHelper | null = null;
  private framed = false;

  constructor(
    private readonly ui: MotionUi,
    private readonly scene: Scene,
    /** Told when the visitor picks a clip (the viewer starts playing it). */
    onPick: () => void,
    /** Told the posed bounds the first time a bound clip runs. */
    private readonly onPose: (bounds: Box3) => void,
  ) {
    ui.clip.addEventListener('change', () => {
      this.play(ui.clip.value);
      onPick();
    });
    ui.skeleton.addEventListener('change', () => this.showSkeleton(ui.skeleton.checked));
  }

  /** True when a clip is bound (Play has something to run). */
  get has(): boolean {
    return this.clips.length > 0;
  }

  /** Bind `clips` on `mixer` (the first one ready to play) and offer the skeleton of `model`. */
  bind(model: Object3D, mixer: AnimationMixer | null, clips: readonly AnimationClip[]): void {
    this.model = model;
    this.mixer = mixer;
    const bones = hasBones(model);
    this.clips = mixer ? clips.map((c) => (bones ? inPlace(c) : c)) : [];
    const first = firstClip(this.clips);
    this.ui.clip.replaceChildren(
      ...this.clips.map((c) => new Option(c.name, c.name, false, c === first)),
    );
    this.ui.clipBox.hidden = this.clips.length < 2;
    if (first) this.play(first.name);
    this.ui.skeletonBox.hidden = !bones;
    this.showSkeleton(bones && this.ui.skeleton.checked);
  }

  /** Run the bound clip by `dt` seconds; at 0 (paused) the model holds whatever pose it has. */
  advance(dt: number): void {
    if (!this.mixer || dt <= 0) return;
    if (!this.framed && this.model && this.has) {
      this.framed = true;
      this.mixer.update(0);
      this.onPose(posedBounds(this.model));
    }
    this.mixer.update(dt);
  }

  private play(name: string): void {
    const clip = this.clips.find((c) => c.name === name);
    if (!clip || !this.mixer) return;
    this.framed = false;
    this.mixer.stopAllAction();
    this.mixer.clipAction(clip).play();
  }

  private showSkeleton(on: boolean): void {
    if (this.helper) {
      this.helper.removeFromParent();
      this.helper.geometry.dispose();
      for (const m of [this.helper.material].flat()) m.dispose();
    }
    this.helper = on && this.model ? new SkeletonHelper(this.model) : null;
    if (!this.helper) return;
    this.helper.setColors(token('--redline'), token('--redline'));
    this.scene.add(this.helper);
  }

  /** Forget the shown model (before the viewer disposes it). */
  clear(): void {
    this.showSkeleton(false);
    [this.model, this.mixer, this.clips] = [null, null, []];
    this.ui.clipBox.hidden = true;
    this.ui.skeletonBox.hidden = true;
  }
}
