// Asset details: the manifest the CLI writes (draw calls, surfaces, emitters, sockets, real
// dimensions, measures with sources) and the asset's contact sheet, if the Pages build has one.

import { type AssetInfo, type Manifest, manifest } from './compile.ts';
import { contactSheetUrl } from './hero.ts';

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

const link = (href: string): HTMLElement => {
  if (!/^https?:\/\//.test(href)) return el('span', href);
  const a = el('a', new URL(href).hostname.replace(/^www\./, ''));
  a.href = href;
  a.rel = 'noopener';
  return a;
};

function facts(m: Manifest): HTMLElement {
  const dl = el('dl', undefined, 'facts-list');
  const row = (k: string, v: string | HTMLElement): void => {
    const dd = el('dd');
    dd.append(v);
    dl.append(el('dt', k), dd);
  };
  row('Draw calls', m.drawCalls.map((n, i) => `LOD${i} ${n}`).join(' · '));
  row('Triangles', m.triangles.map((n, i) => `LOD${i} ${n.toLocaleString('en')}`).join(' · '));
  row('Surfaces', m.surfaces.join(', ') || 'opaque');
  if (m.real)
    row('Real size', `${m.real.length} × ${m.real.width} × ${m.real.height} m (L × W × H)`);
  row('Pivots', String(m.pivots.length));
  row(
    'Emitters',
    m.emitters.length
      ? m.emitters.map((e) => `${e.name} (${e.kind}, ${e.when})`).join(', ')
      : 'none',
  );
  row(
    'Sockets',
    m.sockets.length ? m.sockets.map((s) => `${s.name} (${s.kind})`).join(', ') : 'none',
  );
  return dl;
}

function measures(m: Manifest): HTMLElement | null {
  if (!m.measures.length) return null;
  const table = el('table', undefined, 'measures');
  table.append(el('caption', 'Measures: spec against the compiled model'));
  const head = el('tr');
  for (const h of ['Measure', 'Spec', 'Model', 'Source']) head.append(el('th', h));
  table.append(head);
  for (const x of m.measures) {
    const tr = el('tr');
    const src = el('td');
    if (x.source) src.append(link(x.source));
    tr.append(
      el('td', x.label),
      el('td', `${x.spec} m`),
      el('td', x.measured === null ? '–' : `${x.measured.toFixed(2)} m`),
      src,
    );
    table.append(tr);
  }
  return table;
}

function sources(m: Manifest): HTMLElement | null {
  if (!m.sources.length) return null;
  const ul = el('ul', undefined, 'sources');
  for (const s of m.sources) {
    const li = el('li');
    const url = s.match(/https?:\/\/\S+/)?.[0];
    if (url) {
      li.append(link(url), el('span', ` ${s.replace(url, '').trim()}`));
    } else li.textContent = s;
    ul.append(li);
  }
  const wrap = el('div');
  wrap.append(el('h3', 'Sources'), ul);
  return wrap;
}

let token = 0;

export function renderDetails(root: HTMLElement, asset: AssetInfo): void {
  const body = root.querySelector<HTMLElement>('[data-details-body]');
  const figure = root.querySelector<HTMLElement>('[data-details-sheet]');
  const ticket = ++token;
  if (body)
    body.replaceChildren(el('p', 'Compiling all three LODs for the manifest…', 'section-note'));
  manifest(asset.name).then(
    (m) => {
      if (ticket !== token || !body) return;
      body.replaceChildren(...[facts(m), measures(m), sources(m)].filter((n) => n !== null));
    },
    (error: unknown) => {
      if (ticket === token && body)
        body.replaceChildren(el('p', `Manifest unavailable: ${String(error)}`));
    },
  );
  const img = figure?.querySelector('img');
  const caption = figure?.querySelector('figcaption');
  if (figure && img && caption) {
    figure.hidden = false;
    img.onerror = () => {
      figure.hidden = true;
    };
    img.src = contactSheetUrl(asset.name);
    img.alt = `Contact sheet for ${asset.name}: orthographic views and the far LOD`;
    caption.textContent = `renders/${asset.name}.png, from t3d shot`;
  }
}
