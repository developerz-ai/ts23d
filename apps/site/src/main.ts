// Entry: the home page (live showcase, gallery, how it works) and the asset page, routed by hash:
// `#<asset_name>` opens an asset; anything else is home. Committed renders draw the gallery at
// once; the compile worker's catalog follows and enables the live viewers.

import './style.css';
import { renderDetails, renderModelSize } from './details.ts';
import { Gallery } from './gallery.ts';
import { renderHow } from './how.ts';
import { type Item, mediaItems, mergeRecipes, order } from './items.ts';
import { loadRecipes } from './recipes.ts';
import { Showcase } from './showcase.ts';
import { renderSource } from './source.ts';
import { Viewer } from './viewer.ts';

const $ = <T extends HTMLElement>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`page markup is missing ${sel}`);
  return node;
};

const FEATURED = [
  'tiger_1',
  'loco_440',
  'station_halt',
  'orc_head',
  'dropship',
  'eiffel_tower',
  'mountain_range',
  'water_tower',
  'asteroid',
];

let items: Item[] = order(mediaItems());
const home = $('[data-view="home"]');
const page = $('[data-view="asset"]');
const gallery = new Gallery($('[data-gallery]'), $('[data-filters]'), $('[data-count]'));
gallery.render(items);

const tiger = items.find((i) => i.name === 'tiger_1') ?? items.find((i) => i.media?.sheet);
renderHow($('#how'), tiger?.media?.sheet ? { name: tiger.folder, src: tiger.media.sheet } : null);

const featured = (): Item[] =>
  FEATURED.map((n) => items.find((i) => i.name === n)).filter((i) => i !== undefined);

const posterItem = featured().find((i) => i.media?.hero);
if (posterItem?.media?.hero) $<HTMLImageElement>('[data-poster]').src = posterItem.media.hero;

const roots = {
  info: $('[data-info]'),
  measures: $('[data-measures-section]'),
  sheet: $('[data-sheet-section]'),
};
let viewer: Viewer | null = null;
let current: Item | null = null;

function neighbours(item: Item): void {
  const at = items.indexOf(item);
  const link = (sel: string, other: Item | undefined): void => {
    const a = $<HTMLAnchorElement>(sel);
    a.hidden = !other;
    if (other) {
      a.href = `#${other.name}`;
      a.querySelector('span')?.replaceChildren(other.title);
    }
  };
  link('[data-prev]', items[(at - 1 + items.length) % items.length]);
  link('[data-next]', items[(at + 1) % items.length]);
}

function openAsset(item: Item): void {
  const same = current === item;
  current = item;
  home.hidden = true;
  page.hidden = false;
  document.title = `${item.title} · ts23d`;
  $('[data-crumb-cat]').textContent = item.category;
  $('[data-crumb-name]').textContent = item.name;
  neighbours(item);
  renderDetails(roots, item);
  const poster = $<HTMLImageElement>('[data-viewer-poster]');
  poster.hidden = !item.media?.hero;
  if (item.media?.hero) poster.src = item.media.hero;
  if (!same) window.scrollTo({ top: 0 });
  const recipe = item.recipe;
  if (!recipe) return;
  viewer ??= new Viewer($('[data-viewer]'));
  viewer.onSize = (size) => renderModelSize(roots.info, size);
  void viewer.show(recipe.asset).then(() => {
    poster.hidden = true;
  });
  void recipe.source().then((text) => renderSource($('[data-source]'), recipe.file, text));
}

function route(): void {
  const name = decodeURIComponent(location.hash.slice(1));
  const item = items.find((i) => i.name === name);
  if (item) {
    openAsset(item);
    return;
  }
  current = null;
  document.title = 'ts23d · free 3D asset generator';
  page.hidden = true;
  home.hidden = false;
  if (name) document.getElementById(name)?.scrollIntoView();
}

route();
window.addEventListener('hashchange', route);
const showcase = $('[data-showcase]');

void loadRecipes()
  .catch((error: unknown) => {
    console.error('ts23d: recipe catalog failed to load', error);
    return [];
  })
  .then((recipes) => {
    items = mergeRecipes(items, recipes);
    gallery.render(items);
    new Showcase(showcase, $<HTMLAnchorElement>('[data-showcase-label]'), featured());
    if (current) openAsset(current);
    else route();
  });
