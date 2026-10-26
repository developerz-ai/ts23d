// Entry: discover recipes, fill the hero, gallery and play mode, and route the hash:
// `#play` runs the game, `#<asset_name>` opens that asset in the viewer + source panel.

import './style.css';
import { markCurrent, renderGallery } from './gallery.ts';
import { renderHero } from './hero.ts';
import { PlayMode } from './play/index.ts';
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
const hero = $('.hero');
const count = $('[data-count]');
const playRoot = $('[data-play-root]');

if (hero) {
  const names = recipes.map((r) => r.asset.name);
  renderHero(
    hero,
    ['tiger_1', 't34', ...names].filter((n, i, a) => a.indexOf(n) === i),
  );
}

const play = (() => {
  const viewport = $('[data-play-viewport]');
  const hud = $('[data-hud]');
  const toast = $('[data-toast]');
  const status = $('[data-play-status]');
  if (!playRoot || !viewport || !hud || !toast || !status || recipes.length === 0) return null;
  return new PlayMode(viewport, recipes, hud, toast, status);
})();

if (gallery && viewerRoot && sourceRoot && recipes.length > 0) {
  renderGallery(gallery, recipes);
  if (count) count.textContent = String(recipes.length);
  const viewer = new Viewer(viewerRoot);

  const showAsset = (name: string, scroll: boolean): void => {
    const recipe = recipes.find((r) => r.asset.name === name) ?? recipes[0];
    if (!recipe) return;
    markCurrent(gallery, recipe.asset.name);
    void recipe.source().then((text) => renderSource(sourceRoot, recipe.file, text));
    void viewer.show(recipe.asset);
    if (scroll) viewerRoot.scrollIntoView({ block: 'start' });
  };

  const route = (scroll: boolean): void => {
    const name = decodeURIComponent(location.hash.slice(1));
    const playing = name === 'play';
    playRoot?.classList.toggle('is-playing', playing);
    if (playing) {
      playRoot?.scrollIntoView({ block: 'start' });
      void play?.start();
      return;
    }
    play?.stop();
    if (recipes.some((r) => r.asset.name === name)) showAsset(name, scroll);
  };
  // Fills the viewer with the hashed asset, or the first one when the hash is empty or `#play`.
  showAsset(decodeURIComponent(location.hash.slice(1)), false);
  window.addEventListener('hashchange', () => route(true));
  if (location.hash === '#play') route(false);
} else if (gallery) {
  gallery.textContent = 'No recipes found in recipes/*.ts.';
}
