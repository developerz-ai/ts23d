// Viewer side panels: the stats list (triangles vs budget, GLB size, compile time) and the parts
// tree (pivots, motion, emitters) — DOM only, no three.js.

import type { PartInfo } from './compile.ts';

export function renderStats(
  target: HTMLElement,
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

export function renderParts(target: HTMLOListElement, parts: readonly PartInfo[]): void {
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
  target.replaceChildren(...items);
  target.setAttribute('aria-label', `${parts.length} parts`);
}
