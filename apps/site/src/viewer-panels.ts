// Viewer side panels: the stats list (triangles vs budget, GLB size, compile time, physics mass
// when the recipe declares it, the texture sets bound as the GLB carries them) and the parts
// tree (pivots, motion, emitters; hovering or focusing a row outlines that node, `Outline`).

import { BoxHelper, type Object3D, type Scene } from 'three';
import type { BuildResult, PartInfo } from './compile.ts';
import { describeSet, type TextureSetInfo } from './texture-sets.ts';
import { token } from './theme.ts';

/** The redline box around one named node of the shown model (the parts list's hover). */
export class Outline {
  private box: BoxHelper | null = null;
  constructor(private readonly scene: Scene) {}

  /** Outline `name` in `model`, or clear the outline (null). */
  show(model: Object3D | null, name: string | null): void {
    this.box?.removeFromParent();
    this.box?.dispose();
    const node = name ? model?.getObjectByName(name) : null;
    this.box = node ? new BoxHelper(node, token('--redline')) : null;
    if (this.box) this.scene.add(this.box);
  }

  update(): void {
    this.box?.update();
  }
}

const kib = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MiB` : `${(n / 1024).toFixed(1)} KiB`;
const kg = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 1 : 2)} t` : `${n.toFixed(n >= 10 ? 0 : 2)} kg`;

export function renderStats(
  target: HTMLElement,
  b: BuildResult,
  emitters: number,
  sets: readonly TextureSetInfo[] = [],
): void {
  const rows: [string, string][] = [
    ['triangles', `${b.triangles.toLocaleString('en')} / ${b.budget.toLocaleString('en')}`],
    ['glb', kib(b.glb.byteLength)],
    ['compile', b.ms >= 1000 ? `${(b.ms / 1000).toFixed(1)} s` : `${b.ms.toFixed(0)} ms`],
    ...(emitters ? [['emitters', String(emitters)] as [string, string]] : []),
    ...(b.mass ? [['mass', kg(b.mass.kg)] as [string, string]] : []),
    ...sets.map((s) => ['textures', describeSet(s)] as [string, string]),
  ];
  target.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      return [dt, dd];
    }),
  );
}

/** The stats line and the parts list of a build; hovering a part calls `highlight`. */
export function renderBuild(
  ui: { readonly stats: HTMLElement; readonly parts: HTMLOListElement },
  b: BuildResult,
  emitters: number,
  sets: readonly TextureSetInfo[],
  highlight: (name: string | null) => void,
): void {
  renderStats(ui.stats, b, emitters, sets);
  renderParts(ui.parts, b.parts, highlight);
}

export function renderParts(
  target: HTMLOListElement,
  parts: readonly PartInfo[],
  highlight: (name: string | null) => void,
): void {
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
    li.tabIndex = 0;
    li.addEventListener('pointerenter', () => highlight(p.name));
    li.addEventListener('focus', () => highlight(p.name));
    li.addEventListener('pointerleave', () => highlight(null));
    li.addEventListener('blur', () => highlight(null));
    if (p.motion) li.classList.add('moves');
    if (p.emitter) li.classList.add('emits');
    return li;
  });
  target.replaceChildren(...items);
  target.setAttribute('aria-label', `${parts.length} parts`);
}
