// Entry: the home page (live showcase, gallery, how it works) and the asset page, routed by hash:
// `#<asset_name>` opens an asset; anything else is home. Committed renders draw the gallery at
// once and already name each recipe's entry file, so viewers start compiling immediately; the
// worker's full catalog (recipes with no renders yet) loads when the page is idle. The viewer and
// its panels are a lazy chunk, fetched on the first asset page. Without WebGL neither the showcase
// nor the viewer starts: the committed renders stay, with one line saying why (GLBs still download).
// An asset with a model-tier pair (`<name>_hybrid` with committed model outputs) gets a
// "CPU tier / With models" switch; `#<name>_hybrid` opens the pair on its model tier.

import './style.css';
import { NEURAL } from 'virtual:ts23d-media';
import { manifest } from './compile.ts';
import { creditLine, renderCredits } from './credits-panel.ts';
import { renderDetails, renderModelSize } from './details.ts';
import { renderDownloads } from './downloads.ts';
import { loadFacts } from './facts.ts';
import { Gallery } from './gallery.ts';
import { renderHow } from './how.ts';
import { FLAGSHIPS, type Item, mediaItems, mergeRecipes, order } from './items.ts';
import { startLod } from './lod-policy.ts';
import { renderQuality } from './quality-panel.ts';
import { loadCatalog } from './recipes.ts';
import { renderRenders } from './renders-panel.ts';
import { Showcase } from './showcase.ts';
import type { SoundPanel } from './sound-panel.ts';
import { renderRecipe } from './source.ts';
import { baseOf, gridItems, HYBRID, pairOf, type Tier, tierSwitch } from './tier-toggle.ts';
import type { Subject, Viewer } from './viewer.ts';
import { endInMessage, hasWebGl, loadingParts, noWebGlLine } from './viewer-fallback.ts';

const $ = <T extends HTMLElement>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`page markup is missing ${sel}`);
  return node;
};

/** The flagships first (items.ts), then the rest of the showcase. */
const FEATURED = [
  ...FLAGSHIPS,
  'tiger_1',
  'roadster_v10',
  'loco_440',
  'rts_faction',
  'dropship',
  'pbr_showcase',
  'eiffel_tower',
  'mountain_range',
];

let items: Item[] = order(mediaItems());
const home = $('[data-view="home"]');
const page = $('[data-view="asset"]');
const pair = (item: Item): Item | null => pairOf(item, items, NEURAL);
/** The card's switch: the hybrid and its credit line, when the asset has one. */
const tiersOf = (item: Item) => {
  const hybrid = pair(item);
  return hybrid ? { hybrid, line: creditLine(NEURAL[hybrid.folder] ?? []) } : null;
};
const gallery = new Gallery($('[data-gallery]'), $('[data-filters]'), $('[data-count]'), tiersOf);
gallery.render(gridItems(items));

const tiger = items.find((i) => i.name === 'tiger_1') ?? items.find((i) => i.media?.sheet);
renderHow($('#how'), tiger?.media?.sheet ? { name: tiger.folder, src: tiger.media.sheet } : null);

const featured = (): Item[] =>
  FEATURED.map((n) => items.find((i) => i.name === n)).filter((i) => i !== undefined);

const posterItem = featured().find((i) => i.media?.hero);
if (posterItem?.media?.hero) $<HTMLImageElement>('[data-poster]').src = posterItem.media.hero;

const roots = { info: $('[data-info]'), measures: $('[data-measures-section]') };
let viewer: Promise<{ viewer: Viewer; sounds: SoundPanel }> | null = null;
let current: Item | null = null;
let currentTier: Tier = 'cpu';
let showcaseOn = false;
const webgl = hasWebGl(() => document.createElement('canvas'));
const loading = loadingParts($('[data-loading]'));

/** What the viewer needs to know about an item (a hybrid also brings its model outputs). */
const subjectOf = (item: Item, tier: Tier = 'cpu'): Subject => {
  const neural = tier === 'models' ? (NEURAL[item.folder] ?? []) : [];
  return {
    name: item.name,
    kind: item.kind,
    tags: item.tags,
    triangles: item.media?.triangles ?? [],
    ...(item.recipe ? { file: item.recipe.file } : {}),
    ...(neural.length ? { neural: { recipe: item.folder, dirs: neural.map((n) => n.dir) } } : {}),
  };
};

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
  const list = gridItems(items);
  const at = list.indexOf(item);
  const link = (sel: string, other: Item | undefined): void => {
    const a = $<HTMLAnchorElement>(sel);
    a.hidden = !other;
    if (other) {
      a.href = `#${other.name}`;
      a.querySelector('span')?.replaceChildren(other.title);
    }
  };
  link('[data-prev]', list[(at - 1 + list.length) % list.length]);
  link('[data-next]', list[(at + 1) % list.length]);
}

/** The tier switch and the credits under the viewer, for `base` shown on `tier`. */
function renderTier(base: Item, hybrid: Item | null, tier: Tier): void {
  const bar = $('[data-tier-bar]');
  bar.hidden = !hybrid;
  bar.replaceChildren(
    ...(hybrid
      ? [
          tierSwitch(`Tier of ${base.name}`, tier, (t) =>
            location.replace(`#${t === 'models' ? hybrid.name : base.name}`),
          ),
        ]
      : []),
  );
  const shown = tier === 'models' && hybrid ? hybrid : base;
  renderCredits($('[data-credits]'), {
    tier,
    paired: Boolean(hybrid),
    neural: tier === 'models' ? (NEURAL[shown.folder] ?? []) : [],
    data: shown.media?.data ?? [],
    folder: shown.folder,
  });
}

function openAsset(base: Item, tier: Tier = 'cpu'): void {
  const hybrid = pair(base);
  const on: Tier = hybrid ? tier : 'cpu';
  const item = on === 'models' && hybrid ? hybrid : base;
  const same = current === base && currentTier === on;
  const sameAsset = current === base;
  current = base;
  currentTier = on;
  home.hidden = true;
  page.hidden = false;
  document.title = `${item.title} · ts23d`;
  $('[data-crumb-cat]').textContent = base.category;
  $('[data-crumb-name]').textContent = item.name;
  neighbours(base);
  renderTier(base, hybrid, on);
  renderDetails(roots, item);
  renderRenders($('[data-renders-section]'), item);
  renderQuality($('[data-quality-section]'), item);
  const poster = $<HTMLImageElement>('[data-viewer-poster]');
  poster.hidden = !item.media?.hero;
  if (item.media?.hero) poster.src = item.media.hero;
  if (!sameAsset) window.scrollTo({ top: 0 });
  const recipe = item.recipe;
  if (!recipe) return;
  renderRecipe($('[data-source]'), recipe);
  if (!webgl) {
    $('[data-viewer]').classList.add('no-webgl');
    endInMessage(loading, noWebGlLine(item.name, Boolean(item.media?.hero)));
    // Compiling needs no WebGL: the GLBs still download.
    renderDownloads($('[data-downloads]'), subjectOf(item, on));
    return;
  }
  viewerChunk().then(
    ({ viewer: v, sounds }) => {
      if (current !== base || currentTier !== on) return;
      sounds.render(item);
      if (same) return;
      const subject = subjectOf(item, on);
      void v.show(subject, startLod(subject)).then((shown) => {
        if (shown && current === base && currentTier === on) poster.hidden = true;
      });
    },
    (error: unknown) => {
      console.error('ts23d: the viewer failed to start', error);
      endInMessage(loading, `The 3D viewer failed to start, so ${item.name} cannot be shown live.`);
    },
  );
}

function route(): void {
  const name = decodeURIComponent(location.hash.slice(1));
  const item = items.find((i) => i.name === name);
  const base = baseOf(name);
  const paired = base ? items.find((i) => i.name === base) : undefined;
  if (paired && pair(paired)?.name === `${base}${HYBRID}`) {
    openAsset(paired, 'models');
    return;
  }
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
  if (!showcaseOn && webgl)
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
      if (items.length !== before) gallery.render(gridItems(items));
      if (!current) route();
    });
});
