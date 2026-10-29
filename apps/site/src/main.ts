// Entry: load the recipe catalog from the worker, fill the hero and gallery, and route
// `#<asset_name>` to the viewer, its details and its source.

import './style.css';
import { renderDetails } from './details.ts';
import { markCurrent, renderGallery } from './gallery.ts';
import { renderHero } from './hero.ts';
import { loadRecipes } from './recipes.ts';
import { renderSource } from './source.ts';
import { Viewer } from './viewer.ts';

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

// The worker imports the recipes and sends back their metadata; nothing compiles on this thread.
const recipes = await loadRecipes().catch((error: unknown) => {
  console.error('ts23d: recipe catalog failed to load', error);
  return [];
});
const gallery = $('[data-gallery]');
const viewerRoot = $('[data-viewer]');
const sourceRoot = $('[data-source]');
const detailsRoot = $('[data-details]');
const hero = $('.hero');
const count = $('[data-count]');

if (hero) {
  const names = recipes.map((r) => r.asset.name);
  renderHero(
    hero,
    ['tiger_1', 't34', ...names].filter((n, i, a) => a.indexOf(n) === i),
  );
}

if (gallery && viewerRoot && sourceRoot && detailsRoot && recipes.length > 0) {
  renderGallery(gallery, recipes);
  if (count) count.textContent = String(recipes.length);
  const viewer = new Viewer(viewerRoot);

  const showAsset = (name: string, scroll: boolean): void => {
    const recipe = recipes.find((r) => r.asset.name === name) ?? recipes[0];
    if (!recipe) return;
    markCurrent(gallery, recipe.asset.name);
    void recipe.source().then((text) => renderSource(sourceRoot, recipe.file, text));
    renderDetails(detailsRoot, recipe.asset);
    void viewer.show(recipe.asset);
    if (scroll) viewerRoot.scrollIntoView({ block: 'start' });
  };

  showAsset(decodeURIComponent(location.hash.slice(1)), false);
  window.addEventListener('hashchange', () => {
    const name = decodeURIComponent(location.hash.slice(1));
    if (recipes.some((r) => r.asset.name === name)) showAsset(name, true);
  });
} else if (gallery) {
  gallery.textContent = 'No recipes found in recipes/*.ts.';
}
