// The viewer's measuring bar: metre grid floor, L × W × H dimension overlay, a 1.8 m figure, a
// click-two-points ruler (raycast on the model, distance in metres) and the livery picker for
// assets whose manifest lists `variants` (repaints the `ts23d_paint_<slot>` materials, the same
// colours KHR_materials_variants switches in an engine). Studio mode only.

import {
  Box3,
  type Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { manifest } from './compile.ts';
import { dimensions, humanFigure, measureLine, metres } from './measure-overlay.ts';
import type { Stage } from './stage.ts';
import { token } from './theme.ts';

type Toggle = 'grid' | 'dims' | 'human' | 'ruler';

/** Paint slots → default sRGB hex, and the switchable liveries (variant → slots it repaints). */
export interface Livery {
  readonly paint: Readonly<Record<string, string>>;
  readonly variants: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export class MeasureTools {
  private readonly on = new Map<Toggle, boolean>();
  private readonly layer = new Group();
  private readonly ruler = new Group();
  private readonly select: HTMLSelectElement | null;
  private readonly picker: HTMLElement | null;
  private readonly readout: HTMLElement | null;
  private model: Object3D | null = null;
  private box = new Box3();
  private points: Vector3[] = [];
  private paint: Readonly<Record<string, string>> = {};
  private variants: Readonly<Record<string, Readonly<Record<string, string>>>> = {};
  private name = '';
  /** HTML tags pinned to the overlay's label anchors (positioned every frame by `update`). */
  private readonly tagLayer = document.createElement('div');
  private tags: { el: HTMLElement; at: Object3D }[] = [];
  /**
   * Where liveries come from. Defaults to the worker's manifest (compiles all three LODs); the
   * page swaps in the committed facts, which cost nothing.
   */
  liverySource: (name: string) => Promise<Livery> = (name) =>
    manifest(name).then((m) => ({ paint: m.paint ?? {}, variants: m.variants ?? {} }));

  constructor(
    root: HTMLElement,
    private readonly stage: Stage,
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    this.layer.name = 'measure_overlay';
    this.stage.scene.add(this.layer, this.ruler);
    this.tagLayer.className = 'measure-tags';
    this.tagLayer.setAttribute('aria-hidden', 'true');
    root.querySelector('[data-viewport]')?.append(this.tagLayer);
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-measure]')) {
      const key = input.dataset['measure'] as Toggle;
      this.on.set(key, input.checked);
      input.addEventListener('change', () => {
        this.on.set(key, input.checked);
        if (key === 'ruler') this.clearRuler();
        this.refresh();
      });
    }
    this.select = root.querySelector('[data-variant]');
    this.picker = root.querySelector('[data-livery]');
    this.readout = root.querySelector('[data-ruler-readout]');
    this.select?.addEventListener('change', () => this.applyLivery());
    let down: [number, number] | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = [e.clientX, e.clientY];
    });
    canvas.addEventListener('pointerup', (e) => {
      // A click, not an orbit drag.
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) this.pick(e);
      down = null;
    });
  }

  /** Show the tools for `model` (null in scene mode: everything hides). */
  attach(model: Object3D | null, name: string): void {
    this.model = model;
    this.clearRuler();
    if (model) this.box = new Box3().setFromObject(model);
    if (model && name !== this.name) {
      this.name = name;
      void this.liverySource(name).then(
        (m) => {
          if (this.name !== name) return;
          this.paint = m.paint;
          this.variants = m.variants;
          this.fillPicker();
          this.applyLivery();
        },
        () => undefined,
      );
    } else this.applyLivery();
    this.refresh();
  }

  private refresh(): void {
    this.layer.clear();
    const model = this.model;
    if (!model) return;
    this.stage.showGrid(this.on.get('grid') ?? false);
    if (this.on.get('dims')) this.layer.add(dimensions(this.box, token('--ink')));
    if (this.on.get('human')) this.layer.add(humanFigure(this.box));
    this.canvas.style.cursor = this.on.get('ruler') ? 'crosshair' : '';
    this.syncTags();
  }

  /** Rebuild the HTML tags from the label anchors in the overlay and the ruler. */
  private syncTags(): void {
    const tags: { el: HTMLElement; at: Object3D }[] = [];
    for (const root of [this.layer, this.ruler])
      root.traverse((o) => {
        const text = o.userData['measureTag'];
        if (typeof text !== 'string') return;
        const el = document.createElement('span');
        el.className = 'measure-tag';
        el.textContent = text;
        el.style.color = String(o.userData['color'] ?? '');
        tags.push({ el, at: o });
      });
    this.tags = tags;
    this.tagLayer.replaceChildren(...tags.map((t) => t.el));
  }

  /** Pin the tags to their anchors for this frame's camera. */
  update(): void {
    if (!this.tags.length) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const p = new Vector3();
    for (const t of this.tags) {
      t.at.getWorldPosition(p).project(this.camera);
      const hidden = p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1;
      t.el.hidden = hidden;
      if (!hidden)
        t.el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  private pick(e: PointerEvent): void {
    if (!this.model || !this.on.get('ruler')) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.model, true)[0];
    if (!hit) return;
    if (this.points.length === 2) this.clearRuler();
    this.points.push(hit.point.clone());
    const size = Math.max(this.box.getSize(hit.point.clone()).length() * 0.006, 0.004);
    const dot = new Mesh(
      new SphereGeometry(size, 12, 8),
      new MeshBasicMaterial({ color: token('--redline'), depthTest: false, depthWrite: false }),
    );
    dot.position.copy(hit.point);
    dot.renderOrder = 11;
    this.ruler.add(dot);
    const [a, b] = this.points;
    if (a && b) {
      const d = a.distanceTo(b);
      this.ruler.add(measureLine(a, b, metres(d), token('--redline'), size * 3));
      this.syncTags();
      if (this.readout) {
        this.readout.hidden = false;
        this.readout.textContent = `Ruler: ${metres(d)} (${d.toFixed(3)} m)`;
      }
    } else if (this.readout) {
      this.readout.hidden = false;
      this.readout.textContent = 'Ruler: click a second point';
    }
  }

  private clearRuler(): void {
    this.ruler.clear();
    this.syncTags();
    this.points = [];
    if (this.readout) this.readout.hidden = !this.on.get('ruler');
    if (this.readout && this.on.get('ruler'))
      this.readout.textContent = 'Ruler: click two points on the model';
  }

  private fillPicker(): void {
    if (!this.select || !this.picker) return;
    const names = Object.keys(this.variants);
    this.picker.hidden = names.length === 0;
    // Team colours on strategy-kit assets are the same mechanism as a vehicle livery.
    const label = this.picker.querySelector('[data-livery-label]');
    if (label)
      label.textContent =
        names.includes('red') && names.includes('blue') ? 'Team colour' : 'Livery';
    this.select.replaceChildren(
      ...['', ...names].map((v) =>
        Object.assign(document.createElement('option'), {
          value: v,
          textContent: v ? v.replaceAll('_', ' ') : 'default paint',
        }),
      ),
    );
  }

  private applyLivery(): void {
    const v = this.select?.value ?? '';
    const colours = { ...this.paint, ...(v ? this.variants[v] : {}) };
    this.model?.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat()) {
        const slot =
          m instanceof MeshStandardMaterial ? /^ts23d_paint_(.+)$/.exec(m.name)?.[1] : undefined;
        const hex = slot ? colours[slot] : undefined;
        if (hex && m instanceof MeshStandardMaterial) m.color.set(hex);
      }
    });
  }
}
