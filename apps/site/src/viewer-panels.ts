// Viewer side panels: the stats list (triangles vs budget, GLB size, compile time, physics mass
// when the recipe declares it) and the parts
// tree (pivots, motion, emitters; hovering or focusing a row outlines that node) — DOM only.

import type { BuildResult, PartInfo } from './compile.ts';

const kib = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MiB` : `${(n / 1024).toFixed(1)} KiB`;
const kg = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 1 : 2)} t` : `${n.toFixed(n >= 10 ? 0 : 2)} kg`;

export function renderStats(target: HTMLElement, b: BuildResult, emitters: number): void {
  const rows: [string, string][] = [
    ['triangles', `${b.triangles.toLocaleString('en')} / ${b.budget.toLocaleString('en')}`],
    ['glb', kib(b.glb.byteLength)],
    ['compile', b.ms >= 1000 ? `${(b.ms / 1000).toFixed(1)} s` : `${b.ms.toFixed(0)} ms`],
    ...(emitters ? [['emitters', String(emitters)] as [string, string]] : []),
    ...(b.mass ? [['mass', kg(b.mass.kg)] as [string, string]] : []),
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
