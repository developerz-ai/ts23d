// Download buttons: one GLB per LOD, each labelled with its size once the worker has built it.
// The bytes are exactly what `toGlb` writes (pivots merged, `rest` + `run` clips baked).

import { type AssetInfo, build, LODS, recipe } from './compile.ts';

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

export function renderDownloads(root: HTMLElement, asset: AssetInfo): void {
  const buttons = LODS.map((lod) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'download';
    const file = `${asset.name}_lod${lod}.glb`;
    b.innerHTML = `<span class="download-lod">LOD${lod}</span><span class="download-size">…</span>`;
    b.setAttribute('aria-label', `Download ${file}`);
    const job = build(recipe(asset.name, lod));
    job.then(
      ({ glb, triangles }) => {
        const size = b.querySelector('.download-size');
        if (size)
          size.textContent = `${kib(glb.byteLength)} · ${triangles.toLocaleString('en')} tris`;
      },
      () => {
        b.disabled = true;
      },
    );
    b.addEventListener('click', () => void job.then(({ glb }) => save(file, glb)));
    return b;
  });
  root.replaceChildren(...buttons);
}
