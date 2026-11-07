// The viewer: a compiled asset in one of two modes. Studio (default) is a product shot: the
// category's look (image-based light, key shadow, contact shadow, backdrop; AO + MSAA on the high
// tier), orbit controls with a slow turntable, and Play runs the baked `run` clip.
// Scene stages the asset on a diorama in a looping scenario picked from its named parts (driving,
// wind, a day on the turntable). Also switches LOD, wireframe and the trim sheet, lists the parts
// (hover one to outline it) and offers a GLB per LOD.

import { AnimationMixer, Box3, BoxHelper, Group, Mesh, type Object3D, Timer, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { backdrop } from './backdrop.ts';
import type { AssetInfo as Asset, Lod } from './compile.ts';
import { loadBuilt, recipe, trimSheet } from './compile.ts';
import { renderDownloads } from './downloads.ts';
import { categoryOf } from './items.ts';
import { LOOKS, type Look, lookFor } from './look.ts';
import { Particles } from './particles.ts';
import type { Post } from './post.ts';
import { FrameBudget, qualityTier, tierPinned } from './quality.ts';
import { readHooks } from './scenarios/hooks.ts';
import { pickScenario } from './scenarios/pick.ts';
import type { Scenario } from './scenarios/types.ts';
import { disposeTree, Stage } from './stage.ts';
import { anisotropyOf, studioRenderer } from './studio.ts';
import { applySheet } from './textures.ts';
import { reducedMotion, token } from './theme.ts';
import { renderParts, renderStats } from './viewer-panels.ts';
import { bindUi, type Mode, syncUi, wireUi } from './viewer-ui.ts';

export class Viewer {
  private readonly stage = new Stage(true);
  private readonly tier = qualityTier();
  private readonly renderer = studioRenderer(this.tier);
  private readonly budget = new FrameBudget(() => this.degrade());
  private post: Post | null = null;
  private look: Look = LOOKS.studio;
  private readonly controls: OrbitControls;
  private readonly timer = new Timer();
  private readonly particles = new Particles(7, 2000);
  private readonly ui: ReturnType<typeof bindUi>;
  private asset: Asset | null = null;
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

  constructor(private readonly root: HTMLElement) {
    this.ui = bindUi(root);
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
        this.applyWireframe();
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

  async show(
    asset: Asset,
    lod: Lod = this.lod,
    reframe = asset.name !== this.asset?.name,
  ): Promise<void> {
    const fresh = asset.name !== this.asset?.name;
    if (fresh) this.mode = 'studio';
    this.asset = asset;
    this.lod = lod;
    const ticket = ++this.token;
    this.ui.status.textContent = `Compiling ${asset.name} at LOD ${lod}…`;
    this.root.setAttribute('aria-busy', 'true');
    this.ui.loading.hidden = false;
    const loaded = await loadBuilt(recipe(asset.name, lod));
    const clip = loaded.animations.find((c) => c.name === 'run') ?? null;
    const hooks = readHooks(loaded.scene, asset.kind, clip);
    const def = pickScenario(hooks);
    const base =
      this.mode === 'scene'
        ? await loadBuilt({
            target: {
              kind: 'diorama',
              name: `${asset.name}_${def.id}`,
              footprint: def.ground(hooks),
            },
            lod: 0,
            animations: false,
          })
        : null;
    if (ticket !== this.token) {
      disposeTree(loaded.scene);
      if (base) disposeTree(base.scene);
      return;
    }
    this.root.removeAttribute('aria-busy');
    this.ui.loading.hidden = true;

    this.teardown();
    this.look = lookFor(categoryOf(asset.kind, asset.tags));
    this.stage.setLook(this.look, this.renderer);
    this.stage.scene.background = backdrop(this.look);
    this.model = loaded.scene;
    const carrier = new Group().add(loaded.scene);
    this.display = base ? new Group().add(base.scene, carrier) : carrier;
    this.stage.setFloor(!base);
    this.stage.showGrid(Boolean(base));
    this.applyWireframe();
    void this.applyTextures();
    const center = this.stage.show(this.display, reframe || Boolean(base));
    if (!base) this.stage.bakeContact(this.renderer, [this.particles.object]);
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
    syncUi(this.ui, lod, this.mode, this.playing);
    this.ui.play.disabled = this.mode === 'studio' && !clip;
    this.renderer.domElement.setAttribute('aria-label', `3D view of ${asset.name}, LOD ${lod}`);
    const b = loaded.built;
    renderStats(
      this.ui.stats,
      b.triangles,
      asset.budget.triangles[lod],
      b.glb.byteLength,
      b.ms,
      emitters.length,
    );
    renderParts(this.ui.parts, b.parts, (name) => this.highlight(name));
    this.ui.status.textContent = `Showing ${asset.name} at LOD ${lod}.`;
  }

  /** Outline one named node in the redline colour, or clear the outline (null). */
  private highlight(name: string | null): void {
    if (this.outline) {
      this.stage.scene.remove(this.outline);
      this.outline.dispose();
      this.outline = null;
    }
    const node = name ? this.model?.getObjectByName(name) : null;
    if (!node) return;
    this.outline = new BoxHelper(node, token('--redline'));
    this.stage.scene.add(this.outline);
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

  private applyWireframe(): void {
    this.model?.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat()) if ('wireframe' in m) m.wireframe = this.wireframe;
    });
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
    this.stage.syncShadow(this.model);
    // Scenarios may clear the sky they painted; fall back to the look's backdrop.
    this.stage.scene.background ??= backdrop(this.look);
    this.budget.tick(dt);
    if (this.post) this.post.render();
    else this.renderer.render(this.stage.scene, this.stage.camera);
  }
}
