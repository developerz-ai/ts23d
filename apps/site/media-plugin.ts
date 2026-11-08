// Vite plugin: publishes the committed outputs under `recipes/<folder>/out/<asset>/` as
// `virtual:ts23d-media` (the light card data, so the gallery grid shows real renders without
// compiling a single recipe) plus `media/<asset>/facts.json` (measures, critique, liveries,
// sounds; fetched by the asset page). The build copies renders, blueprints, RTS icons and WAVs to
// `media/<asset>/`, re-encoding each hero as WebP (full size and card size) when an image tool
// (cwebp, ImageMagick) is installed; without one, the hero PNG serves both roles.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { type Found, scan } from './media-scan.ts';
import type { MediaEntry, MediaFacts } from './src/media-types.ts';

const ID = 'virtual:ts23d-media';
const RESOLVED = `\0${ID}`;
const SIZES = { hero: { w: 1600, h: 900 }, card: { w: 800, h: 450 } } as const;
type Size = keyof typeof SIZES;

/** A file's bytes, or null if it vanished since the scan (`bun run shots` rewrites out/ dirs). */
function tryRead(file: string): Uint8Array | null {
  try {
    return readFileSync(file);
  } catch {
    return null;
  }
}

/** The hero as a WebP of the given size, or null when no image tool is installed. */
function webp(png: string, { w, h }: { w: number; h: number }): Uint8Array | null {
  const size = `${w}x${h}`;
  const q = '86';
  const tools: [string, string[]][] = [
    ['cwebp', ['-quiet', '-q', q, '-resize', String(w), String(h), png, '-o', '-']],
    ['magick', [png, '-resize', size, '-quality', q, 'webp:-']],
    ['convert', [png, '-resize', size, '-quality', q, 'webp:-']],
  ];
  for (const [cmd, args] of tools) {
    const r = spawnSync(cmd, args, { maxBuffer: 16 * 1024 * 1024 });
    if (r.status === 0 && r.stdout.length > 0) return new Uint8Array(r.stdout);
  }
  return null;
}

export function mediaPlugin(repoRoot: string): Plugin {
  const recipes = join(repoRoot, 'recipes');
  let base = '/';
  let build = false;
  let found: Found[] = [];
  const encoded = new Map<string, Uint8Array | null>();

  /** Build-time WebP of the hero (dev serves the PNG as is). */
  const encode = (f: Found, size: Size): Uint8Array | null => {
    if (!build || !f.hero) return null;
    const key = `${f.entry.name}/${size}`;
    if (!encoded.has(key)) encoded.set(key, webp(join(f.dir, 'hero.png'), SIZES[size]));
    return encoded.get(key) ?? null;
  };

  const entries = (): MediaEntry[] =>
    found.map((f) => {
      const at = (file: string): string => `${base}media/${f.entry.name}/${file}`;
      const hero = f.hero ? at(encode(f, 'hero') ? 'hero.webp' : 'hero.png') : null;
      return {
        ...f.entry,
        hero,
        card: encode(f, 'card') ? at('card.webp') : hero,
        sheet: f.sheet ? at('sheet.png') : null,
        facts: at('facts.json'),
      };
    });

  const factsOf = (f: Found): MediaFacts => {
    const at = (file: string): string => `${base}media/${f.entry.name}/${file}`;
    return {
      ...f.facts,
      sounds: f.facts.sounds.map(({ file, ...s }) => ({ ...s, url: file ? at(file) : null })),
      images: Object.fromEntries(f.facts.images.map((i) => [i, at(`${i}.png`)])),
    };
  };
  const json = (f: Found): Uint8Array => new TextEncoder().encode(JSON.stringify(factsOf(f)));

  return {
    name: 'ts23d-media',
    configResolved(config) {
      base = config.base;
      build = config.command === 'build';
    },
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null;
      found = scan(recipes);
      for (const f of found) this.addWatchFile(join(f.dir, 'manifest.json'));
      return `export const MEDIA = ${JSON.stringify(entries())};`;
    },
    configureServer(server) {
      found = scan(recipes);
      server.middlewares.use((req, res, next) => {
        const m = /\/media\/([\w-]+)\/([\w-]+\.(png|wav|json))$/.exec(req.url ?? '');
        const f = m && found.find((x) => x.entry.name === m[1]);
        if (!m || !f) return next();
        const file = m[2] ?? '';
        const type = { png: 'image/png', wav: 'audio/wav', json: 'application/json' }[m[3] ?? ''];
        const bytes =
          file === 'facts.json'
            ? json(f)
            : f.files.includes(file)
              ? tryRead(join(f.dir, file))
              : null;
        if (!bytes || !type) return next();
        res.setHeader('content-type', type);
        res.end(bytes);
      });
    },
    generateBundle() {
      for (const f of found) {
        const emit = (fileName: string, source: Uint8Array | null): void => {
          if (source)
            this.emitFile({ type: 'asset', fileName: `media/${f.entry.name}/${fileName}`, source });
        };
        const hero = encode(f, 'hero');
        if (hero) emit('hero.webp', hero);
        else if (f.hero) emit('hero.png', tryRead(join(f.dir, 'hero.png')));
        const card = encode(f, 'card');
        if (card) emit('card.webp', card);
        emit('facts.json', json(f));
        // Contact sheet, blueprint, RTS icon/portrait/shot, sound clips: published as they are.
        for (const file of f.files)
          if (file !== 'hero.png' && file !== 'thumb.png') emit(file, tryRead(join(f.dir, file)));
      }
    },
  };
}
