// The viewer: orbit a compiled asset, switch LOD, play its baked `run` clip, toggle wireframe,
// list its named parts and download the exact GLB bytes being shown.

import {
  AnimationMixer,
  Box3,
  Group,
  Mesh,
  type Object3D,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { authoringFromGltf } from './axes.ts';
import type { AssetInfo as Asset, Lod } from './compile.ts';
import { loadBuilt, type PartInfo, recipe } from './compile.ts';
import { Particles } from './particles.ts';
import { disposeTree, Stage } from './stage.ts';
import { reducedMotion } from './theme.ts';

const q = <T extends Element>(root: ParentNode, sel: string): T => {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`viewer markup is missing ${sel}`);
  return node;
};

const bindUi = (root: ParentNode) => ({
  viewport: q<HTMLElement>(root, '[data-viewport]'),
  name: q<HTMLElement>(root, '[data-viewer-name]'),
  desc: q<HTMLElement>(root, '[data-viewer-desc]'),
  stats: q<HTMLElement>(root, '[data-viewer-stats]'),
  parts: q<HTMLOListElement>(root, '[data-parts]'),
  play: q<HTMLButtonElement>(root, '[data-play]'),
  wire: q<HTMLInputElement>(root, '[data-wireframe]'),
  reset: q<HTMLButtonElement>(root, '[data-reset]'),
  download: q<HTMLButtonElement>(root, '[data-download]'),
  status: q<HTMLElement>(root, '[data-viewer-status]'),
});

export class Viewer {
  private readonly stage = new Stage(true);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly timer = new Timer();
  private mixer: AnimationMixer | null = null;
  private model: Object3D | null = null;
  private display: Object3D | null = null;
  private readonly particles = new Particles(7, 2000);
  private hasClip = false;
  /** The exact GLB bytes on screen, for the download button. */
  private shown: Uint8Array | null = null;
  private asset: Asset | null = null;
  private lod: Lod = 0;
  // Paused by default; the visible Play run button starts the baked clip.
  private playing = false;
  private wireframe = false;
  private token = 0;
  private home = new Vector3();

  private readonly ui: ReturnType<typeof bindUi>;

  constructor(private readonly root: HTMLElement) {
    this.ui = bindUi(root);
    this.stage.scene.add(this.particles.object);
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    this.ui.viewport.prepend(canvas);
    this.controls = new OrbitControls(this.stage.camera, canvas);
    this.controls.enableDamping = !reducedMotion();
    this.controls.listenToKeyEvents(canvas);

    new ResizeObserver(() => this.resize()).observe(this.ui.viewport);
    this.wire();
    // Render only while the viewer is on screen: no GPU work for a canvas nobody can see.
    new IntersectionObserver(([e]) => {
      this.renderer.setAnimationLoop(e?.isIntersecting ? (time) => this.tick(time) : null);
    }).observe(this.ui.viewport);
  }

  async show(asset: Asset, lod: Lod = this.lod): Promise<void> {
    const reframe = asset.name !== this.asset?.name;
    this.asset = asset;
    this.lod = lod;
    const ticket = ++this.token;
    this.ui.status.textContent = `Compiling ${asset.name} at LOD ${lod}…`;
    this.root.setAttribute('aria-busy', 'true');
    const loaded = await loadBuilt(recipe(asset.name, lod));
    const built = loaded.built;
    // A diorama base sized to the model, so it sits on ground instead of floating on the grid.
    const box = new Box3().setFromObject(loaded.scene);
    const c = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const [cx, cy] = authoringFromGltf(c.x, c.y, c.z);
    const [hx, hy] = authoringFromGltf(size.x / 2, size.y / 2, size.z / 2);
    const footprint = { cx, cy, hx, hy };
    const base = await loadBuilt({
      target: { kind: 'diorama', name: asset.name, footprint },
      lod: 0,
      animations: false,
    });
    this.root.removeAttribute('aria-busy');
    if (ticket !== this.token) {
      disposeTree(loaded.scene);
      disposeTree(base.scene);
      return;
    }

    if (this.model) this.particles.detach(this.model);
    if (this.display) disposeTree(this.display);
    this.model = loaded.scene;
    this.shown = built.glb;
    base.scene.traverse((n) => {
      if (n instanceof Mesh) n.receiveShadow = true;
    });
    this.display = new Group().add(base.scene, loaded.scene);
    this.applyWireframe();
    const center = this.stage.show(this.display, reframe);
    if (reframe) {
      this.home = center.clone();
      this.controls.target.copy(center);
      this.controls.saveState();
    }
    this.controls.update();

    this.mixer?.stopAllAction();
    // Find the clip by name: `rest` comes first so external viewers open paused.
    const clip = loaded.animations.find((c) => c.name === 'run');
    this.mixer = clip ? new AnimationMixer(loaded.scene) : null;
    this.hasClip = Boolean(clip);
    // Recipe emitters: 'moving' ones (track dust) run while the run clip plays.
    const emitters = this.particles.attach(loaded.scene, (e) =>
      (e.when ?? 'always') === 'moving' ? (this.playing && this.hasClip ? 1 : 0) : 1,
    );
    if (clip && this.mixer) this.mixer.clipAction(clip).play();
    this.ui.play.disabled = !clip;
    this.ui.play.textContent = clip ? (this.playing ? 'Pause run' : 'Play run') : 'No motion';
    this.ui.play.setAttribute('aria-pressed', String(Boolean(clip) && this.playing));

    this.ui.name.textContent = asset.name;
    this.ui.desc.textContent = asset.description ?? '';
    this.renderer.domElement.setAttribute('aria-label', `3D view of ${asset.name}, LOD ${lod}`);
    this.renderStats(
      built.triangles,
      asset.budget.triangles[lod],
      built.glb.byteLength,
      built.ms,
      emitters.length,
    );
    this.renderParts(built.parts);
    for (const r of this.root.querySelectorAll<HTMLInputElement>('input[name="lod"]'))
      r.checked = Number(r.value) === lod;
    this.ui.status.textContent = `Showing ${asset.name} at LOD ${lod}.`;
  }

  private wire(): void {
    for (const r of this.root.querySelectorAll<HTMLInputElement>('input[name="lod"]')) {
      r.addEventListener('change', () => {
        if (r.checked && this.asset) void this.show(this.asset, Number(r.value) as Lod);
      });
    }
    this.ui.wire.addEventListener('change', () => {
      this.wireframe = this.ui.wire.checked;
      this.applyWireframe();
    });
    this.ui.play.addEventListener('click', () => {
      this.playing = !this.playing;
      this.ui.play.textContent = this.playing ? 'Pause run' : 'Play run';
      this.ui.play.setAttribute('aria-pressed', String(this.playing));
    });
    this.ui.reset.addEventListener('click', () => {
      this.controls.reset();
      this.controls.target.copy(this.home);
    });
    this.ui.download.addEventListener('click', () => this.download());
  }

  private download(): void {
    if (!this.asset) return;
    const bytes = this.shown;
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'model/gltf-binary' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.asset.name}_lod${this.lod}.glb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private applyWireframe(): void {
    this.model?.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat()) if ('wireframe' in m) m.wireframe = this.wireframe;
    });
  }

  private renderStats(
    tris: number,
    budget: number,
    bytes: number,
    ms: number,
    emitters: number,
  ): void {
    const rows: [string, string][] = [
      ['triangles', `${tris.toLocaleString('en')} / ${budget.toLocaleString('en')}`],
      ['glb', `${(bytes / 1024).toFixed(1)} KiB`],
      ['compile', `${ms.toFixed(1)} ms`],
      ...(emitters ? [['emitters', String(emitters)] as [string, string]] : []),
    ];
    this.ui.stats.replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        return [dt, dd];
      }),
    );
  }

  private renderParts(parts: readonly PartInfo[]): void {
    const depth = new Map<string, number>();
    const items = parts.map((p) => {
      const d = p.parent === null ? 0 : (depth.get(p.parent) ?? 0) + 1;
      depth.set(p.name, d);
      const li = document.createElement('li');
      li.style.setProperty('--depth', String(d));
      const name = document.createElement('code');
      name.textContent = p.name;
      const meta = document.createElement('span');
      meta.className = 'part-meta';
      const bits = [p.triangles ? `${p.triangles} tris` : 'pivot'];
      if (p.motion) bits.push(p.motion);
      if (p.emitter) bits.push(`emitter: ${p.emitter}`);
      meta.textContent = bits.join(' · ');
      li.append(name, meta);
      if (p.motion) li.classList.add('moves');
      return li;
    });
    this.ui.parts.replaceChildren(...items);
    this.ui.parts.setAttribute('aria-label', `${parts.length} parts`);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.ui.viewport;
    this.renderer.setSize(w, h, false);
    this.stage.resize(w, h);
  }

  private tick(time: number): void {
    this.timer.update(time);
    // Clamped: the loop pauses offscreen, and the first frame back must not jump.
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.playing) this.mixer?.update(dt);
    this.particles.update(dt);
    this.controls.update();
    this.renderer.render(this.stage.scene, this.stage.camera);
  }
}
