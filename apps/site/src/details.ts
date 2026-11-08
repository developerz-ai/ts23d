// The asset page's facts: title block, QA verdict, triangles and draw calls per LOD, real size
// against the model, measures (spec vs measured, with sources) and dossier links. Reads the
// committed manifest (light part bundled, measures fetched with the facts); assets without one get
// the worker's manifest (no QA). Renders, quality and sounds have their own panels.

import { manifest } from './compile.ts';
import { loadFacts } from './facts.ts';
import { dossierUrl, folderUrl, type Item, recipeUrl } from './items.ts';
import type { MediaEntry, MediaFacts } from './media-types.ts';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};

const ext = (href: string, text: string): HTMLAnchorElement => {
  const a = el('a', text);
  a.href = href;
  a.rel = 'noopener';
  return a;
};

const host = (href: string): string => new URL(href).hostname.replace(/^www\./, '');
const m = (n: number): string => `${n < 10 ? n.toFixed(2) : n.toFixed(1)} m`;

type Facts = Pick<MediaEntry, 'triangles' | 'drawCalls' | 'real' | 'qa' | 'emitters' | 'sockets'> &
  Pick<MediaFacts, 'measures' | 'sources'> & { readonly score?: number | null; liveries?: number };

function lodTable(f: Facts): HTMLTableElement {
  const t = el('table', undefined, 'lod-table');
  t.append(el('caption', 'Per level of detail', 'visually-hidden'));
  const head = el('tr');
  head.append(el('th'), ...f.triangles.map((_, i) => el('th', `LOD${i}`, 'lod-head')));
  const tris = el('tr');
  tris.append(el('th', 'triangles'), ...f.triangles.map((n) => el('td', n.toLocaleString('en'))));
  const draws = el('tr');
  draws.append(el('th', 'draw calls'), ...f.drawCalls.map((n) => el('td', String(n))));
  t.append(head, tris, draws);
  return t;
}

function measures(f: Facts): HTMLElement | null {
  if (!f.measures.length) return null;
  const table = el('table', undefined, 'measures');
  table.append(el('caption', 'Measures: the published spec against the compiled model'));
  const head = el('tr');
  for (const h of ['Measure', 'Spec', 'Model', 'Δ', 'Source']) head.append(el('th', h));
  table.append(head);
  for (const x of f.measures) {
    const tr = el('tr');
    const src = el('td');
    if (x.source && /^https?:\/\//.test(x.source)) src.append(ext(x.source, host(x.source)));
    else if (x.source) src.textContent = x.source;
    const delta = x.measured === null ? null : ((x.measured - x.spec) / x.spec) * 100;
    const d = el('td', delta === null ? '–' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`);
    if (delta !== null && Math.abs(delta) <= 2) d.className = 'ok';
    tr.append(
      el('td', x.label),
      el('td', m(x.spec)),
      el('td', x.measured === null ? '–' : m(x.measured)),
      d,
      src,
    );
    table.append(tr);
  }
  return table;
}

function sources(f: Facts): HTMLElement | null {
  if (!f.sources.length) return null;
  const ul = el('ul', undefined, 'sources');
  for (const s of f.sources) {
    const li = el('li');
    const url = s.match(/https?:\/\/[^\s)]+/)?.[0];
    if (url) li.append(ext(url, host(url)), el('span', ` ${s.replace(url, '').trim()}`));
    else li.textContent = s;
    ul.append(li);
  }
  return ul;
}

export interface DetailRoots {
  readonly info: HTMLElement;
  readonly measures: HTMLElement;
}

const count = (n: number, one: string, many = `${one}s`): HTMLElement =>
  el('span', `${n} ${n === 1 ? one : many}`, 'badge');

let token = 0;

export function renderDetails(roots: DetailRoots, item: Item): void {
  const ticket = ++token;
  const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T | null =>
    root.querySelector<T>(sel);
  const kind = item.category.toLowerCase().startsWith(item.kind) ? '' : ` · ${item.kind}`;
  q(roots.info, '[data-eyebrow]')?.replaceChildren(`${item.category}${kind}`);
  q(roots.info, '[data-title]')?.replaceChildren(item.title);
  q(roots.info, '[data-name]')?.replaceChildren(item.name);
  q(roots.info, '[data-desc]')?.replaceChildren(item.description);
  const links = q(roots.info, '[data-links]');
  links?.replaceChildren(
    ext(dossierUrl(item), 'Dossier & references'),
    ext(recipeUrl(item), 'Recipe on GitHub'),
    ext(folderUrl(item), 'Folder'),
  );

  const fill = (f: Facts): void => {
    if (ticket !== token) return;
    const badges = q(roots.info, '[data-badges]');
    badges?.replaceChildren(
      ...(f.qa
        ? [
            el(
              'span',
              f.qa.pass ? 'QA pass' : `QA ${f.qa.findings} findings`,
              `badge qa ${f.qa.pass ? 'pass' : 'fail'}`,
            ),
          ]
        : []),
      ...(f.score ? [el('span', `critique ${f.score.toFixed(1)} / 10`, 'badge')] : []),
      el('span', `${f.drawCalls[2] ?? '?'} draw calls at LOD2`, 'badge'),
      ...(f.emitters ? [count(f.emitters, 'emitter')] : []),
      ...(f.sockets ? [count(f.sockets, 'socket')] : []),
      ...(f.liveries ? [count(f.liveries, 'livery', 'liveries')] : []),
    );
    q(roots.info, '[data-lods]')?.replaceChildren(lodTable(f));
    const real = q(roots.info, '[data-real]');
    if (real)
      real.textContent = f.real
        ? `${m(f.real.length)} × ${m(f.real.width)} × ${m(f.real.height)}`
        : 'not declared';
    const body = q(roots.measures, '[data-measures]');
    const list = [measures(f), sources(f)].filter((n) => n !== null);
    roots.measures.hidden = list.length === 0;
    body?.replaceChildren(...list);
  };
  const media = item.media;
  if (media) {
    fill({ ...media, measures: [], sources: [] });
    void loadFacts(item).then((x) => x && fill({ ...media, ...x }));
  } else
    manifest(item.name, item.recipe?.file).then(
      (w) =>
        fill({
          ...w,
          real: w.real ?? null,
          qa: null,
          emitters: w.emitters.length,
          sockets: w.sockets.length,
        }),
      () => undefined,
    );
}

/** Show the measured model size (from the viewer) next to the declared real size. */
export function renderModelSize(
  info: HTMLElement,
  size: { x: number; y: number; z: number },
): void {
  // glTF frame: z = length (front), x = width, y = height.
  const out = info.querySelector('[data-model-size]');
  if (out) out.textContent = `${m(size.z)} × ${m(size.x)} × ${m(size.y)}`;
}
