// GitHub Pages build of the demo. Recipes and the site import `@developerz-ai/ts23d` straight from
// ../../src, so the library compiles client-side as-is. Only `/render` touches node:zlib; a stub
// keeps that import resolvable and tree-shaking drops it. `mediaPlugin` publishes the committed
// renders (recipes/<folder>/out/<asset>/) so the gallery grid needs no compile.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { mediaPlugin } from './media-plugin.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const lib = fileURLToPath(new URL('../../src', import.meta.url));
const zlibStub = fileURLToPath(new URL('./src/shims/zlib.ts', import.meta.url));

export default defineConfig({
  base: '/ts23d/',
  plugins: [mediaPlugin(root)],
  resolve: {
    alias: [
      { find: /^@developerz-ai\/ts23d$/, replacement: `${lib}/index.ts` },
      { find: /^node:zlib$/, replacement: zlibStub },
      { find: /^@developerz-ai\/ts23d\/(.+)$/, replacement: `${lib}/$1/index.ts` },
    ],
  },
  server: { fs: { allow: ['../..'] } },
  worker: { format: 'es' },
  build: { target: 'es2023', chunkSizeWarningLimit: 800 },
});
