// Entry: the home page (live showcase, gallery, how it works) and the asset page, routed by hash:
// `#<asset_name>` opens an asset; anything else is home. Committed renders draw the gallery at
// once and already name each recipe's entry file, so viewers start compiling immediately; the
// worker's full catalog (recipes with no renders yet) loads when the page is idle. The viewer and
// its panels are a lazy chunk, fetched on the first asset page.

import './style.css';
import { manifest } from './compile.ts';
import { renderDetails, renderModelSize } from './details.ts';
import { loadFacts } from './facts.ts';
import { Gallery } from './gallery.ts';
import { renderHow } from './how.ts';
import { type Item, mediaItems, mergeRecipes, order } from './items.ts';
import { startLod } from './lod-policy.ts';
import { renderQuality } from './quality-panel.ts';
import { loadCatalog } from './recipes.ts';
import { renderRenders } from './renders-panel.ts';
import { Showcase } from './showcase.ts';
import type { SoundPanel } from './sound-panel.ts';
import { renderRecipe } from './source.ts';
import type { Subject, Viewer } from './viewer.ts';

const $ = <T extends HTMLElement>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`page markup is missing ${sel}`);
  return node;
};

const FEATURED = [
  'tiger_1',
  'roadster_v10',
  'dragon',
  'loco_440',
  'rts_faction',
  'orc_head',
  'dropship',
  'pbr_showcase',
  'eiffel_tower',
  'mountain_range',
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

const roots = { info: $('[data-info]'), measures: $('[data-measures-section]') };
let viewer: Promise<{ viewer: Viewer; sounds: SoundPanel }> | null = null;
let current: Item | null = null;
let showcaseOn = false;

/** What the viewer needs to know about an item. */
const subjectOf = (item: Item): Subject => ({
  name: item.name,
  kind: item.kind,
  tags: item.tags,
  triangles: item.media?.triangles ?? [],
  ...(item.recipe ? { file: item.recipe.file } : {}),
});

/** The viewer chunk (three.js controls, scenarios, particles, measuring, sounds), once. */
function viewerChunk(): NonNullable<typeof viewer> {
  viewer ??= Promise.all([import('./viewer.ts'), import('./sound-panel.ts')]).then(
    ([{ Viewer }, { SoundPanel }]) => {
      const v = new Viewer($('[data-viewer]'));
      v.onSize = (size) => renderModelSize(roots.info, size);
      let model: Parameters<NonNullable<Viewer['onModel']>>[0] = null;
      v.onModel = (m) => {
        model = m;
      };
      v.tools.liverySource = (name) => {
        const item = items.find((i) => i.name === name);
        return item?.media
          ? loadFacts(item).then((f) => ({ paint: f?.paint ?? {}, variants: f?.variants ?? {} }))
          : manifest(name, item?.recipe?.file).then((m) => ({
              paint: m.paint ?? {},
              variants: m.variants ?? {},
            }));
      };
      const sounds = new SoundPanel($('[data-sound-section]'), {
        camera: v.stage.camera,
        model: () => model,
      });
      return { viewer: v, sounds };
    },
  );
  return viewer;
}

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
  renderRenders($('[data-renders-section]'), item);
  renderQuality($('[data-quality-section]'), item);
  const poster = $<HTMLImageElement>('[data-viewer-poster]');
  poster.hidden = !item.media?.hero;
  if (item.media?.hero) poster.src = item.media.hero;
  if (!same) window.scrollTo({ top: 0 });
  const recipe = item.recipe;
  if (!recipe) return;
  renderRecipe($('[data-source]'), recipe);
  void viewerChunk().then(({ viewer: v, sounds }) => {
    if (current !== item) return;
    sounds.render(item);
    if (same) return;
    const subject = subjectOf(item);
    void v.show(subject, startLod(subject)).then(() => {
      if (current === item) poster.hidden = true;
    });
  });
}

function route(): void {
  const name = decodeURIComponent(location.hash.slice(1));
  const item = items.find((i) => i.name === name);
  if (item) {
    openAsset(item);
    return;
  }
  if (current)
    void viewer?.then(({ viewer: v, sounds }) => {
      v.abandon();
      sounds.stop();
    });
  current = null;
  document.title = 'ts23d · free 3D asset generator';
  page.hidden = true;
  home.hidden = false;
  // The showcase compiles only once home is actually seen (not behind a deep link).
  if (!showcaseOn)
    new Showcase($('[data-showcase]'), $<HTMLAnchorElement>('[data-showcase-label]'), featured());
  showcaseOn = true;
  if (name) document.getElementById(name)?.scrollIntoView();
}

route();
window.addEventListener('hashchange', route);

/** Recipes with no committed renders yet join the gallery once the page is idle. */
const idle = (fn: () => void): void => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 6000 });
  else setTimeout(fn, 3000);
};
idle(() => {
  void loadCatalog()
    .catch((error: unknown) => {
      console.error('ts23d: recipe catalog failed to load', error);
      return [];
    })
    .then((found) => {
      const before = items.length;
      items = mergeRecipes(items, found);
      if (items.length !== before) gallery.render(items);
      if (!current) route();
    });
});
