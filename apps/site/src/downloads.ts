// Download buttons: one GLB per LOD. Nothing compiles until a button is pressed (LOD0 of a heavy
// asset is a 20-second compile and a 30 MB file); labels show the committed triangle counts, then
// the real size once built. The bytes are exactly what `toGlb` writes (pivots merged, `rest` +
// `run` clips baked).

import { build, LODS, recipe } from './compile.ts';
import type { Subject } from './viewer-load.ts';

const kib = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

function save(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'model/gltf-binary' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderDownloads(root: HTMLElement, asset: Subject): void {
  const buttons = LODS.map((lod) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'download';
    const file = `${asset.name}_lod${lod}.glb`;
    const lodSpan = Object.assign(document.createElement('span'), {
      className: 'download-lod',
      textContent: `LOD${lod}`,
    });
    const size = Object.assign(document.createElement('span'), { className: 'download-size' });
    const tris = asset.triangles[lod];
    size.textContent = tris ? `${tris.toLocaleString('en')} tris` : 'compile & save';
    b.append(lodSpan, size);
    b.setAttribute('aria-label', `Download ${file}`);
    b.addEventListener('click', () => {
      b.setAttribute('aria-busy', 'true');
      size.textContent = 'compiling…';
      build(recipe(asset.name, lod, asset.file)).then(
        ({ glb, triangles }) => {
          b.removeAttribute('aria-busy');
          size.textContent = `${kib(glb.byteLength)} · ${triangles.toLocaleString('en')} tris`;
          save(file, glb);
        },
        () => {
          b.removeAttribute('aria-busy');
          size.textContent = 'failed: try again';
        },
      );
    });
    return b;
  });
  root.replaceChildren(...buttons);
}
