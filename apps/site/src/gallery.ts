// The gallery: category filter chips and a grid of cards showing each asset's committed beauty
// render. No compile is needed to draw the grid; assets without renders get a live LOD2 render.

import { BLURB, CATEGORIES, type Category } from './categories.ts';
import type { Item } from './items.ts';
import { cardImage } from './thumbnails.ts';

type Filter = Category | 'All';

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

const tris = (n: number | undefined): string =>
  n === undefined
    ? ''
    : n >= 10_000
      ? `${(n / 1000).toFixed(1)}k tris`
      : `${n.toLocaleString('en')} tris`;

function card(item: Item): HTMLLIElement {
  const li = el('li');
  li.dataset['category'] = item.category;
  const a = el('a', 'card');
  a.href = `#${item.name}`;
  a.dataset['asset'] = item.name;

  const figure = el('figure', 'card-media');
  const img = el('img');
  img.alt = `${item.title}, rendered by ts23d`;
  img.width = 800;
  img.height = 450;
  figure.append(img);
  cardImage(img, item);
  if (item.media?.qa)
    figure.append(
      el(
        'span',
        `card-qa ${item.media.qa.pass ? 'pass' : 'fail'}`,
        item.media.qa.pass ? 'QA pass' : 'QA fail',
      ),
    );

  const body = el('div', 'card-body');
  body.append(el('h3', 'card-title', item.title));
  const meta = el('p', 'card-meta');
  meta.append(el('code', undefined, item.name));
  const t = tris(item.media?.triangles[0]);
  if (t) meta.append(el('span', undefined, t));
  const score = item.media?.score;
  if (score) meta.append(el('span', 'card-score', `critique ${score.toFixed(1)}`));
  const kind = item.category.toLowerCase().startsWith(item.kind) ? '' : ` · ${item.kind}`;
  body.append(meta, el('p', 'card-cat', `${item.category}${kind}`));
  a.append(figure, body);
  li.append(a);
  return li;
}

export class Gallery {
  private filter: Filter = 'All';
  private items: readonly Item[] = [];

  constructor(
    private readonly list: HTMLElement,
    private readonly chips: HTMLElement,
    private readonly count: HTMLElement | null,
  ) {}

  render(items: readonly Item[]): void {
    this.items = items;
    this.list.replaceChildren(...items.map(card));
    this.renderChips();
    this.apply();
  }

  private renderChips(): void {
    const counts = new Map<Filter, number>([['All', this.items.length]]);
    for (const i of this.items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    const filters: Filter[] = ['All', ...CATEGORIES.filter((c) => counts.has(c))];
    if (!filters.includes(this.filter)) this.filter = 'All';
    const legend = this.chips.querySelector('legend');
    this.chips.replaceChildren(
      ...(legend ? [legend] : []),
      ...filters.map((f) => {
        const b = el('button', 'chip');
        b.type = 'button';
        b.append(document.createTextNode(f), el('span', 'chip-n', String(counts.get(f) ?? 0)));
        b.setAttribute('aria-pressed', String(f === this.filter));
        if (f !== 'All') b.title = BLURB[f];
        b.addEventListener('click', () => {
          this.filter = f;
          for (const x of this.chips.querySelectorAll('button'))
            x.setAttribute('aria-pressed', String(x === b));
          this.apply();
        });
        return b;
      }),
    );
  }

  private apply(): void {
    let shown = 0;
    for (const li of this.list.querySelectorAll<HTMLLIElement>(':scope > li')) {
      const on = this.filter === 'All' || li.dataset['category'] === this.filter;
      li.hidden = !on;
      if (on) shown++;
    }
    if (this.count) this.count.textContent = String(shown);
  }
}
