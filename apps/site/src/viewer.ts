// The viewer: a compiled asset in one of two modes. Studio (default) is a product shot: the
// category's look (image-based light, key shadow, contact shadow, backdrop; AO + MSAA on the high
// tier), orbit controls with a slow turntable, and Play runs the baked `run` clip.
// Scene stages the asset on a diorama in a looping scenario picked from its named parts (driving,
// wind, a day on the turntable). Also switches LOD, wireframe and the trim sheet, lists the parts
// (hover one to outline it) and offers a GLB per LOD. Heavy assets open at LOD1 with a button for
// LOD0; a progress bar runs while the worker compiles (a failure ends it in a visible message), and
// leaving cancels the compile.

import { AnimationMixer, Box3, BoxHelper, Group, type Object3D, Timer, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { backdrop } from './backdrop.ts';
import { categoryOf } from './categories.ts';
import { type BuildRequest, cancelBuild, type Lod, recipe, trimSheet } from './compile.ts';
import { renderDownloads } from './downloads.ts';
import { estimateSeconds } from './lod-policy.ts';
import { LOOKS, type Look, lookFor } from './look.ts';
import { MeasureTools } from './measure-tools.ts';
import { Particles } from './particles.ts';
import type { Post } from './post.ts';
import { FrameBudget, qualityTier, tierPinned } from './quality.ts';
import type { Scenario } from './scenarios/types.ts';
import { disposeTree, Stage } from './stage.ts';
import { anisotropyOf, studioRenderer } from './studio.ts';
import { applySheet, setWireframe } from './textures.ts';
import { reducedMotion, token } from './theme.ts';
import { disposeStaged, loadStaged, type Staged, type Subject } from './viewer-load.ts';
import { renderParts, renderStats } from './viewer-panels.ts';
import { Progress, syncLod0 } from './viewer-progress.ts';
import { bindUi, type Mode, syncUi, wireUi } from './viewer-ui.ts';
import { CancelledError } from './worker-pool.ts';

export type { Subject } from './viewer-load.ts';

export class Viewer {
  readonly stage = new Stage(true);
  private readonly tier = qualityTier();
  private readonly renderer = studioRenderer(this.tier);
  private readonly budget = new FrameBudget(() => this.degrade());
  private post: Post | null = null;
  private look: Look = LOOKS.studio;
  private readonly controls: OrbitControls;
  private readonly timer = new Timer();
  private readonly particles = new Particles(7, 2000);
  private readonly ui: ReturnType<typeof bindUi>;
  readonly tools: MeasureTools;
  private readonly progress: Progress;
  private asset: Subject | null = null;
  private pending: BuildRequest | null = null;
  private lod: Lod = 0;
  private mode: Mode = 'studio';
  private model: Object3D | null = null;
  private display: Object3D | null = null;
  private scenario: Scenario | null = null;
  private mixer: AnimationMixer | null = null;
  private outline: BoxHelper | null = null;
  private playing = false;
  private wireframe = false;
  private textured = false;
  private time = 0;
  private token = 0;
  /** Told the model's measured size (glTF frame, metres) whenever an asset loads. */
  onSize: ((size: Vector3) => void) | null = null;
  /** Told the shown model (null while compiling), e.g. to anchor positional sounds on its nodes. */
  onModel: ((model: Object3D | null) => void) | null = null;

  constructor(root: HTMLElement) {
    this.ui = bindUi(root);
    this.progress = new Progress(this.ui.loading, root);
    this.ui.lod0.addEventListener('click', () => {
      if (this.asset) void this.show(this.asset, 0, false);
    });
    this.stage.scene.add(this.particles.object);
    this.stage.setLook(this.look, this.renderer);
    // The high tier shows the painted trim sheet by default, as a textured GLB would look.
    this.textured = this.tier === 'high';
    this.ui.textures.checked = this.textured;
    if (this.tier === 'high')
      void import('./post.ts').then(({ Post }) => {
        this.post = new Post(this.renderer, this.stage.scene, this.stage.camera);
        this.post.fit(this.stage.contentBox());
        this.resize();
      });
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    this.ui.viewport.prepend(canvas);
    this.controls = new OrbitControls(this.stage.camera, canvas);
    this.tools = new MeasureTools(root, this.stage, canvas, this.stage.camera);
    this.controls.enableDamping = !reducedMotion();
    this.controls.autoRotateSpeed = 0.6;
    this.controls.listenToKeyEvents(canvas);
    // Any touch of the controls stops the turntable: the user is looking at something.
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
    });
    new ResizeObserver(() => this.resize()).observe(this.ui.viewport);
    wireUi(this.ui, {
      lod: (lod) => {
        if (this.asset) void this.show(this.asset, lod, false);
      },
      mode: (mode) => {
        this.mode = mode;
        this.playing = mode === 'scene' && !reducedMotion();
        if (this.asset) void this.show(this.asset, this.lod, true);
      },
      play: () => {
        this.playing = !this.playing;
        syncUi(this.ui, this.lod, this.mode, this.playing);
      },
      wireframe: (on) => {
        this.wireframe = on;
        if (this.model) setWireframe(this.model, this.wireframe);
      },
      textures: (on) => {
        this.textured = on;
        void this.applyTextures();
      },
    });
    new IntersectionObserver(([e]) => {
      this.renderer.setAnimationLoop(e?.isIntersecting ? (t) => this.tick(t) : null);
    }).observe(this.ui.viewport);
  }

  /** Stop a compile nobody is waiting for any more (the visitor left the asset page). */
  abandon(): void {
    if (this.pending) cancelBuild(this.pending);
    [this.pending, this.token] = [null, this.token + 1];
    this.progress.stop();
  }

  /** Compile and show `asset`; true once it is on screen, false if superseded, cancelled or failed. */
  async show(
    asset: Subject,
    lod: Lod = this.lod,
    reframe = asset.name !== this.asset?.name,
  ): Promise<boolean> {
    const fresh = asset.name !== this.asset?.name;
    if (fresh) this.mode = 'studio';
    this.asset = asset;
    this.lod = lod;
    const ticket = ++this.token;
    const request = recipe(asset.name, lod, asset.file);
    if (this.pending && fresh) cancelBuild(this.pending);
    this.pending = request;
    const label = `Compiling ${asset.name} at LOD ${lod}…`;
    this.ui.status.textContent = label;
    syncLod0(this.ui.lod0, asset, lod, true);
    syncUi(this.ui, lod, this.mode, this.playing);
    this.progress.start(label, estimateSeconds(asset, lod));
    let staged: Staged;
    try {
      staged = await loadStaged(asset, request, this.mode === 'scene');
    } catch (error) {
      if (ticket !== this.token || error instanceof CancelledError) return false;
      // A visible message, not a rethrow: every caller fires and forgets.
      this.ui.status.textContent = this.progress.fail(asset.name, error);
      return false;
    }
    if (ticket !== this.token) {
      disposeStaged(staged);
      return false;
    }
    this.pending = null;
    const { loaded, clip, hooks, def, base } = staged;
    this.progress.stop();
    this.teardown();
    this.look = lookFor(categoryOf(asset.kind, asset.tags, asset.name));
    this.stage.setLook(this.look, this.renderer);
    this.stage.scene.background = backdrop(this.look);
    this.model = loaded.scene;
    const carrier = new Group().add(loaded.scene);
    this.display = base ? new Group().add(base.scene, carrier) : carrier;
    this.stage.setFloor(!base);
    this.stage.showGrid(Boolean(base));
    if (this.model) setWireframe(this.model, this.wireframe);
    void this.applyTextures();
    const center = this.stage.show(this.display, reframe || Boolean(base));
    if (!base) this.stage.bakeContact(this.renderer, [this.particles.object]);
    this.tools.attach(base ? null : loaded.scene, asset.name);
    this.post?.fit(this.stage.contentBox());
    this.mixer = clip ? new AnimationMixer(loaded.scene) : null;
    if (base) {
      this.scenario = def.create({
        hooks,
        carrier,
        scene: this.stage.scene,
        camera: this.stage.camera,
        stage: this.stage,
        particles: this.particles,
        mixer: this.mixer,
        clip,
        reducedMotion: reducedMotion(),
      });
      this.ui.scenario.replaceChildren(
        Object.assign(document.createElement('strong'), { textContent: def.title }),
        document.createTextNode(` · ${def.describe(hooks)}`),
      );
    } else {
      if (clip && this.mixer) this.mixer.clipAction(clip).play();
      if (reframe) {
        this.controls.target.copy(center);
        this.controls.autoRotate = !reducedMotion();
      }
    }
    this.controls.enabled = !base;
    this.time = 0;
    const scenario = this.scenario;
    const emitters = this.particles.attach(loaded.scene, (e) =>
      (e.when ?? 'always') === 'moving' ? (scenario ? scenario.moving() : 1) : 1,
    );
    if (fresh) {
      renderDownloads(this.ui.downloads, asset);
      this.playing = false;
      this.onSize?.(new Box3().setFromObject(loaded.scene).getSize(new Vector3()));
    }
    this.onModel?.(base ? null : loaded.scene);
    syncUi(this.ui, lod, this.mode, this.playing);
    syncLod0(this.ui.lod0, asset, lod, false);
    this.ui.play.disabled = this.mode === 'studio' && !clip;
    this.renderer.domElement.setAttribute('aria-label', `3D view of ${asset.name}, LOD ${lod}`);
    const b = loaded.built;
    renderStats(this.ui.stats, b, emitters.length);
    renderParts(this.ui.parts, b.parts, (name) => this.highlight(name));
    this.ui.status.textContent = `Showing ${asset.name} at LOD ${lod}.`;
    return true;
  }

  /** Outline one named node in the redline colour, or clear the outline (null). */
  private highlight(name: string | null): void {
    this.outline?.removeFromParent();
    this.outline?.dispose();
    const node = name ? this.model?.getObjectByName(name) : null;
    this.outline = node ? new BoxHelper(node, token('--redline')) : null;
    if (this.outline) this.stage.scene.add(this.outline);
  }

  private teardown(): void {
    this.highlight(null);
    this.scenario?.dispose();
    this.scenario = null;
    this.mixer?.stopAllAction();
    this.mixer = null;
    if (this.model) this.particles.detach(this.model);
    if (this.display) disposeTree(this.display);
    this.stage.relight();
  }

  private async applyTextures(): Promise<void> {
    const model = this.model;
    if (!model) return;
    if (!this.textured) return applySheet(model, null);
    this.ui.status.textContent = 'Painting the trim sheet…';
    const sheet = await trimSheet(this.tier === 'high' ? 2048 : 1024);
    if (this.textured && this.model === model)
      applySheet(model, sheet, anisotropyOf(this.renderer));
    this.ui.status.textContent = this.textured ? 'Trim sheet bound.' : '';
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.ui.viewport;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    this.stage.resize(w, h);
  }

  /** Too slow for the high tier: drop the post chain and render at a lower pixel ratio. */
  private degrade(): void {
    if (tierPinned()) return;
    this.post?.dispose();
    this.post = null;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.resize();
  }

  private tick(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const step = this.playing ? dt : 0;
    if (this.scenario) {
      this.time = (this.time + step) % this.scenario.duration;
      this.scenario.update(this.time, step);
    } else {
      this.mixer?.update(step);
      this.controls.update(dt);
    }
    // Paused means still: no smoke drifting over a product shot until Play.
    this.particles.update(step);
    this.outline?.update();
    this.tools.update();
    this.stage.syncShadow(this.model);
    // Scenarios may clear the sky they painted; fall back to the look's backdrop.
    this.stage.scene.background ??= backdrop(this.look);
    this.budget.tick(dt);
    if (this.post) this.post.render();
    else this.renderer.render(this.stage.scene, this.stage.camera);
  }
}
