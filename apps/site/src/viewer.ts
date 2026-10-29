// The viewer: shows a compiled asset in a looping scenario picked from its named parts (driving,
// running, wind, a day on the turntable), or in free look with orbit controls. Also switches LOD,
// wireframe and the trim sheet, lists the parts and offers a GLB per LOD.

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
import type { AssetInfo as Asset, Lod } from './compile.ts';
import { loadBuilt, recipe, trimSheet } from './compile.ts';
import { renderDownloads } from './downloads.ts';
import { Particles } from './particles.ts';
import { readHooks } from './scenarios/hooks.ts';
import { pickScenario } from './scenarios/pick.ts';
import type { Scenario } from './scenarios/types.ts';
import { disposeTree, Stage } from './stage.ts';
import { applySheet } from './textures.ts';
import { reducedMotion } from './theme.ts';
import { renderParts, renderStats } from './viewer-panels.ts';

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
  replay: q<HTMLButtonElement>(root, '[data-replay]'),
  freeLook: q<HTMLInputElement>(root, '[data-freelook]'),
  scenario: q<HTMLElement>(root, '[data-scenario]'),
  wire: q<HTMLInputElement>(root, '[data-wireframe]'),
  textures: q<HTMLInputElement>(root, '[data-textures]'),
  downloads: q<HTMLElement>(root, '[data-downloads]'),
  status: q<HTMLElement>(root, '[data-viewer-status]'),
});

export class Viewer {
  private readonly stage = new Stage(true);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly timer = new Timer();
  private model: Object3D | null = null;
  private display: Object3D | null = null;
  private readonly particles = new Particles(7, 2000);
  private textured = false;
  private asset: Asset | null = null;
  private lod: Lod = 0;
  private scenario: Scenario | null = null;
  private time = 0;
  // Scenarios autoplay unless the user asked for reduced motion; then they wait for Play.
  private playing = !reducedMotion();
  private freeLook = false;
  private wireframe = false;
  private token = 0;

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
    this.controls.enabled = false;

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
    // The scenario comes from the asset's kind and named parts; it also sizes the diorama.
    const clip = loaded.animations.find((c) => c.name === 'run') ?? null;
    const hooks = readHooks(loaded.scene, asset.kind, clip);
    const def = pickScenario(hooks);
    const base = await loadBuilt({
      target: { kind: 'diorama', name: `${asset.name}_${def.id}`, footprint: def.ground(hooks) },
      lod: 0,
      animations: false,
    });
    this.root.removeAttribute('aria-busy');
    if (ticket !== this.token) {
      disposeTree(loaded.scene);
      disposeTree(base.scene);
      return;
    }

    this.scenario?.dispose();
    if (this.model) this.particles.detach(this.model);
    if (this.display) disposeTree(this.display);
    this.stage.relight();
    this.model = loaded.scene;
    base.scene.traverse((n) => {
      if (n instanceof Mesh) n.receiveShadow = true;
    });
    const carrier = new Group().add(loaded.scene);
    this.display = new Group().add(base.scene, carrier);
    this.applyWireframe();
    void this.applyTextures();
    this.stage.show(this.display, reframe);

    const mixer = clip ? new AnimationMixer(loaded.scene) : null;
    const scenario = def.create({
      hooks,
      carrier,
      scene: this.stage.scene,
      camera: this.stage.camera,
      stage: this.stage,
      particles: this.particles,
      mixer,
      clip,
      reducedMotion: reducedMotion(),
    });
    this.scenario = scenario;
    this.time = 0;
    // 'moving' emitters (track dust, steam) follow how hard the scenario works the asset.
    const emitters = this.particles.attach(loaded.scene, (e) =>
      (e.when ?? 'always') === 'moving' ? scenario.moving() : 1,
    );
    this.ui.scenario.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: def.title }),
      document.createTextNode(` · ${def.describe(hooks)}`),
    );
    if (reframe) {
      renderDownloads(this.ui.downloads, asset);
      this.setFreeLook(false);
    }
    this.seekFromUrl();
    this.syncPlay();

    this.ui.name.textContent = asset.name;
    this.ui.desc.textContent = asset.description ?? '';
    this.renderer.domElement.setAttribute('aria-label', `3D view of ${asset.name}, LOD ${lod}`);
    renderStats(
      this.ui.stats,
      built.triangles,
      asset.budget.triangles[lod],
      built.glb.byteLength,
      built.ms,
      emitters.length,
    );
    renderParts(this.ui.parts, built.parts);
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
      // From free look, Play always resumes the scenario; otherwise it toggles.
      this.playing = this.freeLook ? true : !this.playing;
      this.setFreeLook(false);
    });
    this.ui.replay.addEventListener('click', () => {
      this.time = 0;
      this.playing = true;
      this.setFreeLook(false);
      this.syncPlay();
    });
    this.ui.freeLook.addEventListener('change', () => this.setFreeLook(this.ui.freeLook.checked));
    this.ui.textures.addEventListener('change', () => {
      this.textured = this.ui.textures.checked;
      void this.applyTextures();
    });
  }

  /**
   * `?t=7.5` deep-links to a moment: the scenario runs forward from 0 in fixed steps (wheels,
   * smoke and the fire event included) and pauses there. Handy for sharing and screenshots.
   */
  private seekFromUrl(): void {
    const at = Number(new URLSearchParams(location.search).get('t'));
    const scenario = this.scenario;
    if (!scenario || !Number.isFinite(at) || at <= 0) return;
    const step = 1 / 30;
    const end = at % scenario.duration;
    for (let t = 0; t < end; t += step) {
      scenario.update(t, step);
      this.particles.update(step);
    }
    this.time = end;
    this.playing = false;
  }

  private syncPlay(): void {
    this.ui.play.textContent = this.playing && !this.freeLook ? 'Pause' : 'Play';
    this.ui.play.setAttribute('aria-pressed', String(this.playing && !this.freeLook));
  }

  /** Free look stops the scenario where it is and hands the camera to orbit controls. */
  private setFreeLook(on: boolean): void {
    this.freeLook = on;
    this.ui.freeLook.checked = on;
    this.controls.enabled = on;
    if (on && this.model) {
      this.controls.target.copy(new Box3().setFromObject(this.model).getCenter(new Vector3()));
      this.controls.update();
    }
    this.root.classList.toggle('free-look', on);
    this.syncPlay();
  }

  /** Trim sheet on or off. The sheet paints once in the worker (about a second) on first use. */
  private async applyTextures(): Promise<void> {
    const model = this.model;
    if (!model) return;
    if (!this.textured) return applySheet(model, null);
    this.ui.status.textContent = 'Painting the trim sheet…';
    const sheet = await trimSheet();
    // The user may have switched it off or opened another asset meanwhile.
    if (this.textured && this.model === model) applySheet(model, sheet);
    this.ui.status.textContent = this.textured ? 'Trim sheet bound.' : '';
  }

  private applyWireframe(): void {
    this.model?.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat()) if ('wireframe' in m) m.wireframe = this.wireframe;
    });
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
    const scenario = this.scenario;
    if (scenario && !this.freeLook) {
      const step = this.playing ? dt : 0;
      this.time = (this.time + step) % scenario.duration;
      scenario.update(this.time, step);
      this.particles.update(step);
    } else {
      this.controls.update();
      this.particles.update(dt);
    }
    this.renderer.render(this.stage.scene, this.stage.camera);
  }
}
