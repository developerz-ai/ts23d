// The home page's hero: featured assets compiled live, slowly orbiting in the studio light, one
// after another. The committed beauty render shows as a poster until the first compile lands.

import { type Object3D, Vector3 } from 'three';
import { loadBuilt, recipe } from './compile.ts';
import type { Item } from './items.ts';
import { disposeTree, Stage } from './stage.ts';
import { studioEnvironment, studioRenderer } from './studio.ts';
import { reducedMotion } from './theme.ts';

const HOLD = 11; // seconds per featured asset

export class Showcase {
  private readonly stage = new Stage(false);
  private readonly renderer = studioRenderer();
  private readonly center = new Vector3();
  private distance = 10;
  private angle = 0.75;
  private shown = 0;
  private index = -1;
  private last = 0;
  private model: Object3D | null = null;
  private busy = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly label: HTMLAnchorElement | null,
    private readonly featured: readonly Item[],
  ) {
    const canvas = this.renderer.domElement;
    canvas.className = 'showcase-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(canvas);
    this.stage.scene.environment = studioEnvironment(this.renderer);
    this.stage.scene.environmentIntensity = 0.25;
    this.stage.catcher.material.opacity = 0.28;
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
    const tris = item.media?.triangles[0];
    this.label.querySelector('[data-label-title]')?.replaceChildren(item.title);
    this.label
      .querySelector('[data-label-meta]')
      ?.replaceChildren(
        `${item.name} · ${item.category}${tris ? ` · LOD0 ${tris.toLocaleString('en')} tris` : ''}`,
      );
  }

  private async next(): Promise<void> {
    if (this.busy || this.featured.length === 0) return;
    this.busy = true;
    const index = (this.index + 1) % this.featured.length;
    const item = this.featured[index];
    try {
      if (!item) return;
      const { scene } = await loadBuilt(recipe(item.name, 0));
      this.root.classList.add('swapping');
      await new Promise((r) => setTimeout(r, this.model ? 450 : 0));
      if (this.model) disposeTree(this.model);
      this.model = scene;
      const sphereCenter = this.stage.show(scene, true);
      this.center.copy(sphereCenter);
      this.distance = this.stage.camera.position.distanceTo(sphereCenter) * 0.78;
      this.stage.syncShadow();
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
    if (!reducedMotion()) this.angle += dt * 0.12;
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
