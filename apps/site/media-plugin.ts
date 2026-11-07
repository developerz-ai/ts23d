// Vite plugin: publishes the committed renders under `recipes/<folder>/out/<asset>/` (hero.png,
// sheet.png, manifest.json) as `virtual:ts23d-media`, so the gallery grid shows real renders without
// compiling a single recipe. The build copies them to `media/<asset>/`, re-encoding each hero as
// WebP (full size and card size) when an image tool (cwebp, ImageMagick) is installed; without
// one, the hero PNG serves both roles.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { MediaEntry } from './src/media-types.ts';

const ID = 'virtual:ts23d-media';
const RESOLVED = `\0${ID}`;
const SIZES = { hero: { w: 1600, h: 900 }, card: { w: 800, h: 450 } } as const;
type Size = keyof typeof SIZES;

interface Found {
  readonly entry: Omit<MediaEntry, 'hero' | 'card' | 'sheet'>;
  readonly dir: string;
  readonly hero: boolean;
  readonly sheet: boolean;
}

type Json = Record<string, unknown>;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function read(dir: string, folder: string): Found | null {
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) return null;
  let m: Json;
  try {
    m = JSON.parse(readFileSync(file, 'utf8')) as Json;
  } catch {
    return null;
  }
  const qa = m['qa'] as { pass?: boolean; findings?: unknown[] } | undefined;
  const real = m['real'] as MediaEntry['real'] | undefined;
  const pivots = arr<{ motion?: string }>(m['pivots']);
  return {
    dir,
    hero: existsSync(join(dir, 'hero.png')),
    sheet: existsSync(join(dir, 'sheet.png')),
    entry: {
      name: str(m['name']),
      folder,
      kind: str(m['kind']),
      description: str(m['description']),
      tags: arr<string>(m['tags']),
      triangles: arr<number>(m['triangles']),
      drawCalls: arr<number>(m['drawCalls']),
      pivots: pivots.length,
      moving: pivots.filter((p) => p.motion).length,
      emitters: arr(m['emitters']),
      sockets: arr(m['sockets']),
      surfaces: arr<string>(m['surfaces']),
      real: real ?? null,
      measures: arr(m['measures']),
      sources: arr<string>(m['sources']),
      qa: qa ? { pass: qa.pass === true, findings: arr(qa.findings).length } : null,
    },
  };
}

function scan(recipes: string): Found[] {
  const out: Found[] = [];
  const dirs = (p: string): string[] =>
    existsSync(p)
      ? readdirSync(p, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
      : [];
  for (const folder of dirs(recipes)) {
    for (const asset of dirs(join(recipes, folder, 'out'))) {
      const found = read(join(recipes, folder, 'out', asset), folder);
      if (found?.entry.name) out.push(found);
    }
  }
  return out;
}

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
      };
    });

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
        const m = /\/media\/([\w-]+)\/(hero|sheet)\.png$/.exec(req.url ?? '');
        const f = m && found.find((x) => x.entry.name === m[1]);
        if (!m || !f) return next();
        res.setHeader('content-type', 'image/png');
        const bytes = tryRead(join(f.dir, `${m[2]}.png`));
        if (!bytes) return next();
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
        if (f.sheet) emit('sheet.png', tryRead(join(f.dir, 'sheet.png')));
      }
    },
  };
}
