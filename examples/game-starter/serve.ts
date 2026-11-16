// Serve the starter: this folder at /, the build's import folder (public/models, the three.js
// engine layout of `t3d init --engine three`) at /models, three.js from node_modules at /three.
//   bun serve.ts [--port 5180] [--models <dir>]
import { existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const here = import.meta.dir;
const roots: Record<string, string> = {
  '/models/': arg('--models', join(here, 'public/models')),
  '/three/': join(here, 'node_modules/three'),
  '/': here,
};

const server = Bun.serve({
  port: Number(arg('--port', '5180')),
  fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    for (const [prefix, dir] of Object.entries(roots)) {
      if (!path.startsWith(prefix)) continue;
      const rel = normalize(path.slice(prefix.length) || 'index.html');
      if (rel.startsWith('..')) return new Response('forbidden', { status: 403 });
      const file = join(dir, rel);
      if (existsSync(file) && statSync(file).isFile()) return new Response(Bun.file(file));
      return new Response(`not found: ${path}`, { status: 404 });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log(`game-starter on http://localhost:${server.port}/  (models from ${roots['/models/']})`);
