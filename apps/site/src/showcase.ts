// The home page's hero: featured assets compiled live (heavy ones at LOD1), slowly orbiting in
// the studio light, one after another. The committed beauty render shows as a poster until the
// first compile lands. A model-first asset compiles with its committed model outputs (`neuralOf`),
// so it shows what its card shows; main.ts leaves the heavy ones out of this list. A water asset
// has no floor: the stage turns to deep water and the animal swims on the spot while it orbits.

import { formatCount } from '@developerz.ai/ts23d/core';
import { type AnimationClip, AnimationMixer, type Object3D, Vector3 } from 'three';
import { loadBuilt, type NeuralRef, recipe } from './compile.ts';
import type { Item } from './items.ts';
import { startLod } from './lod-policy.ts';
import { lookFor } from './look.ts';
import { qualityTier } from './quality.ts';
import { inPlace, swimClip } from './scenarios/clips.ts';
import { disposeTree, Stage } from './stage.ts';
import { studioRenderer } from './studio.ts';
import { reducedMotion } from './theme.ts';

const HOLD = 11; // seconds per featured asset

export class Showcase {
  private readonly stage = new Stage(false);
  private readonly renderer = studioRenderer(qualityTier());
  private readonly center = new Vector3();
  private distance = 10;
  private angle = 0.75;
  private shown = 0;
  private index = -1;
  private last = 0;
  private model: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private busy = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly label: HTMLAnchorElement | null,
    private readonly featured: readonly Item[],
    private readonly neuralOf: (item: Item) => NeuralRef | undefined = () => undefined,
  ) {
    const canvas = this.renderer.domElement;
    canvas.className = 'showcase-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(canvas);
    new ResizeObserver(() => this.resize()).observe(root);
    this.resize();
    const first = featured[0];
    const poster = root.querySelector<HTMLImageElement>('[data-poster]');
    if (poster && first?.media?.hero) poster.src = first.media.hero;
    this.setLabel(first);
    new IntersectionObserver(([e]) => {
      this.renderer.setAnimationLoop(e?.isIntersecting ? (t) => this.tick(t / 1000) : null);
    }).observe(root);
    void this.next();
  }

  private setLabel(item: Item | undefined): void {
    if (!this.label || !item) return;
    this.label.href = `#${item.name}`;
    const lod = startLod({ ...item, triangles: item.media?.triangles ?? [] });
    const tris = item.media?.triangles[lod];
    this.label.querySelector('[data-label-title]')?.replaceChildren(item.title);
    this.label
      .querySelector('[data-label-meta]')
      ?.replaceChildren(
        `${item.name} · ${item.category}${tris ? ` · ${formatCount(tris)} tris at LOD${lod}` : ''}`,
      );
  }

  private async next(): Promise<void> {
    if (this.busy || this.featured.length === 0) return;
    this.busy = true;
    const index = (this.index + 1) % this.featured.length;
    const item = this.featured[index];
    try {
      if (!item) return;
      // Heavy assets (sculpts, near-million-triangle cars) orbit at LOD1.
      const lod = startLod({ ...item, triangles: item.media?.triangles ?? [] });
      const { scene, animations, built } = await loadBuilt(
        recipe(item.name, lod, item.recipe?.file, this.neuralOf(item)),
      );
      const water = built.medium === 'water';
      this.root.classList.add('swapping');
      await new Promise((r) => setTimeout(r, this.model ? 450 : 0));
      this.mixer?.stopAllAction();
      if (this.model) disposeTree(this.model);
      this.model = scene;
      this.mixer = water ? this.swimmer(scene, animations) : null;
      this.root.closest('.showcase')?.classList.toggle('underwater', water);
      this.stage.setLook(lookFor(item.category, built.medium), this.renderer);
      this.stage.setFloor(!water);
      const sphereCenter = this.stage.show(scene, true);
      this.center.copy(sphereCenter);
      this.distance = this.stage.camera.position.distanceTo(sphereCenter) * 0.78;
      this.stage.syncShadow();
      if (!water) this.stage.bakeContact(this.renderer);
      this.index = index;
      this.shown = -1;
      this.setLabel(item);
      this.root.classList.add('live');
      this.root.classList.remove('swapping');
    } catch (error) {
      console.warn(`ts23d: showcase skipped ${item?.name}`, error);
      this.index = index;
    } finally {
      this.busy = false;
    }
  }

  private swimmer(scene: Object3D, clips: readonly AnimationClip[]): AnimationMixer | null {
    const clip = swimClip(clips);
    if (!clip) return null;
    const mixer = new AnimationMixer(scene);
    mixer.clipAction(inPlace(clip)).play();
    return mixer;
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.root;
    this.renderer.setSize(w, h, false);
    this.stage.resize(w, h);
    // On wide screens the copy sits on the left, so shift the subject right.
    if (w > 900) this.stage.camera.setViewOffset(w, h, -w * 0.2, h * 0.02, w, h);
    else this.stage.camera.clearViewOffset();
  }

  private tick(t: number): void {
    const dt = Math.min(t - this.last, 0.1);
    this.last = t;
    if (this.shown < 0) this.shown = t;
    if (!reducedMotion()) {
      this.angle += dt * 0.12;
      this.mixer?.update(dt);
    }
    const c = this.stage.camera;
    const elev = 0.38;
    // Narrow screens frame the subject alone, so pull back to keep it whole.
    const d = this.distance * (this.root.clientWidth < 900 ? 1.3 : 1);
    c.position.set(
      this.center.x + Math.sin(this.angle) * d * Math.cos(elev),
      this.center.y + d * Math.sin(elev),
      this.center.z + Math.cos(this.angle) * d * Math.cos(elev),
    );
    c.lookAt(this.center);
    if (this.model && t - this.shown > HOLD && this.featured.length > 1 && !reducedMotion())
      void this.next();
    this.renderer.render(this.stage.scene, c);
  }
}
