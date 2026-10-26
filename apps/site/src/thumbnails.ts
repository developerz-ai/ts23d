// Gallery card images: the published thumbnail PNG, or a lazy LOD2 render as a fallback.

import { WebGLRenderer } from 'three';
import type { AssetInfo as Asset } from './compile.ts';
import { loadBuilt, recipe } from './compile.ts';
import { disposeTree, Stage } from './stage.ts';

const SIZE = 480;
let renderer: WebGLRenderer | null = null;
const stage = new Stage(false);
stage.resize(SIZE, SIZE * 0.75);

async function draw(asset: Asset): Promise<string> {
  renderer ??= new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE * 0.75, false);
  const { scene } = await loadBuilt(recipe(asset.name, 2));
  stage.show(scene, true);
  renderer.render(stage.scene, stage.camera);
  const url = renderer.domElement.toDataURL('image/png');
  disposeTree(scene);
  return url;
}

let queue: Promise<void> = Promise.resolve();

/**
 * Card image: the library's `thumbnail()` PNG that the Pages build publishes at /thumbs/<name>.png.
 * When it isn't there (site:dev, or a recipe newer than the deploy), render LOD2 here instead.
 */
export function cardImage(img: HTMLImageElement, asset: Asset): void {
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => renderFallback(img, asset), { once: true });
  img.src = `${import.meta.env.BASE_URL}thumbs/${asset.name}.png`;
}

/** Render `asset` into `img` once the image is near the viewport. Draws are serialised. */
function renderFallback(img: HTMLImageElement, asset: Asset): void {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      queue = queue
        .then(() => draw(asset))
        .then((src) => {
          img.src = src;
        })
        .catch(() => img.closest('figure')?.classList.add('thumb-failed'));
    },
    { rootMargin: '200px' },
  );
  io.observe(img);
}
