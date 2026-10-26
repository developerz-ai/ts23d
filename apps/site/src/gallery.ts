// The gallery grid: one drawing-sheet card per discovered asset, linking to the viewer via #name.

import { build, LODS, recipe } from './compile.ts';
import type { Recipe } from './recipes.ts';
import { lazyThumbnail } from './thumbnails.ts';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function whenVisible(node: Element, fn: () => void): void {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fn();
    },
    { rootMargin: '200px' },
  );
  io.observe(node);
}

function card(entry: Recipe): HTMLElement {
  const { asset } = entry;
  const li = el('li');
  const a = el('a', 'card');
  a.href = `#${asset.name}`;
  a.dataset['asset'] = asset.name;

  const figure = el('figure', 'card-thumb');
  const img = el('img');
  img.alt = `${asset.name}, rendered at LOD 2`;
  img.width = 480;
  img.height = 360;
  figure.append(img);
  lazyThumbnail(img, asset);

  const head = el('div', 'card-head');
  head.append(el('h3', 'card-name', asset.name), el('span', 'card-kind', asset.kind));
  if (entry.family) {
    const badge = el('span', 'family', `family ${entry.family}`);
    badge.title = `One of several variants exported by recipes/${entry.file}`;
    head.append(badge);
  }

  const desc = el('p', 'card-desc', asset.description ?? '');
  const tags = el('ul', 'tags');
  tags.setAttribute('aria-label', 'Tags');
  for (const t of asset.tags ?? []) tags.append(el('li', 'tag', t));

  const table = el('table', 'tris');
  const caption = el('caption', 'visually-hidden', 'Triangles per LOD against budget');
  const row = el('tr');
  const counts = el('tr');
  const cells = LODS.map((lod) => {
    row.append(el('th', undefined, `LOD${lod}`));
    const td = el('td', undefined, '…');
    td.title = `budget ${asset.budget.triangles[lod]} triangles`;
    counts.append(td);
    return td;
  });
  // Counts compile in the worker once the card is on screen, cheapest LOD first.
  whenVisible(a, () => {
    for (const lod of [2, 1, 0] as const) {
      build(recipe(asset.name, lod)).then(
        ({ triangles }) => {
          const td = cells[lod];
          if (!td) return;
          td.textContent = triangles.toLocaleString('en');
          td.title = `${triangles} of ${asset.budget.triangles[lod]} triangle budget`;
        },
        () => {
          const td = cells[lod];
          if (td) td.textContent = 'error';
        },
      );
    }
  });
  const thead = el('thead');
  thead.append(row);
  const tbody = el('tbody');
  tbody.append(counts);
  table.append(caption, thead, tbody);

  a.append(figure, head, desc, tags, table);
  li.append(a);
  return li;
}

export function renderGallery(list: HTMLElement, recipes: readonly Recipe[]): void {
  list.replaceChildren(...recipes.map(card));
}

export function markCurrent(list: HTMLElement, name: string): void {
  for (const a of list.querySelectorAll<HTMLAnchorElement>('a.card')) {
    if (a.dataset['asset'] === name) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}
