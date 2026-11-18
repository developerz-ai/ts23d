// The gallery: category filter chips and a grid of cards showing each asset's committed beauty
// render. No compile is needed to draw the grid; assets without renders get a live LOD2 render.
// An asset with a model tier shows its hybrid (with its credit line) and carries a
// "CPU tier / Model tier" switch beside its link that swaps the whole card to the CPU asset
// (hybrids have no card of their own).

import { formatCount } from '@developerz.ai/ts23d/core';
import { BLURB, CATEGORIES, type Category } from './categories.ts';
import type { Item } from './items.ts';
import { cardImage } from './thumbnails.ts';
import { tierSwitch } from './tier-toggle.ts';

type Filter = Category | 'All';

/** An asset's model-tier variant and its credit line, or null for a CPU-only asset. */
export type TiersOf = (item: Item) => { readonly hybrid: Item; readonly line: string } | null;

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

const tris = (n: number | undefined): string => (n === undefined ? '' : `${formatCount(n)} tris`);

/** The card link: render, QA badge, title, name, triangles, score, category (+ credit line). */
function link(item: Item, credit?: string): HTMLAnchorElement {
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
  if (credit) body.append(el('p', 'card-credit', credit));
  a.append(figure, body);
  return a;
}

function card(item: Item, tiers: TiersOf | null): HTMLLIElement {
  const li = el('li');
  li.dataset['category'] = item.category;
  const pair = tiers?.(item);
  let a = pair ? link(pair.hybrid, pair.line) : link(item);
  li.append(a);
  if (!pair) return li;
  // The switch swaps the whole card link (render, name, triangles, credit) to the other tier.
  li.classList.add('has-tiers');
  li.append(
    tierSwitch(`Tier of ${item.name}`, 'models', (t) => {
      const next = t === 'models' ? link(pair.hybrid, pair.line) : link(item);
      a.replaceWith(next);
      a = next;
    }),
  );
  return li;
}

export class Gallery {
  private filter: Filter = 'All';
  private items: readonly Item[] = [];

  constructor(
    private readonly list: HTMLElement,
    private readonly chips: HTMLElement,
    private readonly count: HTMLElement | null,
    private readonly tiers: TiersOf | null = null,
  ) {}

  render(items: readonly Item[]): void {
    this.items = items;
    this.list.replaceChildren(...items.map((i) => card(i, this.tiers)));
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
