// Gallery card images: the committed beauty render (`recipes/<x>/out/<x>/hero.png`, card-sized by
// the media plugin), or a lazy live LOD2 render for assets that have no committed renders yet.

import { loadBuilt, recipe } from './compile.ts';
import type { Item } from './items.ts';
import { lookFor } from './look.ts';
import { disposeTree, Stage } from './stage.ts';
import { studioRenderer } from './studio.ts';

const W = 800;
const H = 450;
let renderer: ReturnType<typeof studioRenderer> | null = null;
const stage = new Stage(false);
stage.resize(W, H);

async function draw(item: Item): Promise<string> {
  if (!renderer) {
    renderer = studioRenderer();
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
  }
  const { scene } = await loadBuilt(recipe(item.name, 2));
  stage.setLook(lookFor(item.category), renderer);
  stage.show(scene, true);
  stage.syncShadow();
  stage.bakeContact(renderer);
  renderer.render(stage.scene, stage.camera);
  const url = renderer.domElement.toDataURL('image/png');
  disposeTree(scene);
  return url;
}

let queue: Promise<void> = Promise.resolve();

export function cardImage(img: HTMLImageElement, item: Item): void {
  img.loading = 'lazy';
  img.decoding = 'async';
  const src = item.media?.card;
  if (src) {
    img.src = src;
    return;
  }
  img.closest('figure')?.classList.add('live');
  if (item.recipe) renderFallback(img, item);
}

/** Render `item` into `img` once the image is near the viewport. Draws are serialised. */
function renderFallback(img: HTMLImageElement, item: Item): void {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      queue = queue
        .then(() => draw(item))
        .then((src) => {
          img.src = src;
        })
        .catch(() => img.closest('figure')?.classList.add('thumb-failed'));
    },
    { rootMargin: '200px' },
  );
  io.observe(img);
}
