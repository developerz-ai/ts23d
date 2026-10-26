// HUD and start toast. Renders numbers the renderer already reports; computes nothing itself.

import type { WebGLRenderer } from 'three';

export interface HudFrame {
  readonly dt: number;
  readonly renderer: WebGLRenderer;
  /** How many LOD'd props are currently at LOD 0, 1, 2. */
  readonly levels: readonly [number, number, number];
  /** Same for terrain chunks. */
  readonly ground: readonly [number, number, number];
  readonly particles: number;
  readonly speed: number;
  readonly turretYaw: number;
}

export class Hud {
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  private readonly cells = new Map<string, HTMLElement>();

  constructor(
    root: HTMLElement,
    private readonly toastEl: HTMLElement,
  ) {
    const dl = document.createElement('dl');
    for (const key of [
      'fps',
      'draw calls',
      'triangles',
      'props lod 0/1/2',
      'ground lod 0/1/2',
      'particles',
      'speed',
      'turret',
    ]) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = '–';
      this.cells.set(key, dd);
      dl.append(dt, dd);
    }
    root.replaceChildren(dl);
  }

  /** The measured frame rate, averaged over the last half second. */
  get framesPerSecond(): number {
    return this.fps;
  }

  frame(f: HudFrame): void {
    this.frames++;
    this.elapsed += f.dt;
    if (this.elapsed < 0.5) return;
    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    const { calls, triangles } = f.renderer.info.render;
    const deg = ((((f.turretYaw * 180) / Math.PI) % 360) + 360) % 360;
    this.set('fps', this.fps.toFixed(0));
    this.set('draw calls', String(calls));
    this.set('triangles', triangles.toLocaleString('en'));
    this.set('props lod 0/1/2', f.levels.join(' / '));
    this.set('ground lod 0/1/2', f.ground.join(' / '));
    this.set('particles', String(f.particles));
    this.set('speed', `${Math.abs(f.speed * 3.6).toFixed(0)} km/h${f.speed < -0.1 ? ' R' : ''}`);
    this.set('turret', `${deg.toFixed(0).padStart(3, '0')}°`);
  }

  /** Show which recipe part names the game code bound to. Dismisses itself. */
  toast(title: string, lines: readonly string[]): void {
    const h = document.createElement('p');
    h.className = 'toast-title';
    h.textContent = title;
    const ul = document.createElement('ul');
    for (const line of lines) {
      const li = document.createElement('li');
      const [name, rest] = line.split(' → ');
      const code = document.createElement('code');
      code.className = 'toast-part';
      code.textContent = name ?? line;
      li.append(code, rest ? ` → ${rest}` : '');
      ul.append(li);
    }
    this.toastEl.replaceChildren(h, ul);
    this.toastEl.hidden = false;
    window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 9000);
  }

  private set(key: string, value: string): void {
    const cell = this.cells.get(key);
    if (cell && cell.textContent !== value) cell.textContent = value;
  }
}
