// `bun run ref <recipe> [--width 512]`: turn the dossier's reference photos into committed derived
// numbers. Reads the Wikimedia Commons `File:` links from `recipes/<name>/README.md` (one per view:
// side, front, top, 3/4), asks the Commons API for a thumbnail, its licence and author, fetches it
// once into the gitignored cache, segments it, fingerprints it and writes `recipes/<name>/ref.json`
// (mask PNG 128², Lab histograms, spectrum, edges, camera, source url/sha256/licence). The photos
// themselves are never committed. A solved camera already in ref.json is kept.

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import { sha256 } from '../src/data/index.ts';
import { decodePng, type Rgba } from '../src/material/index.ts';
import {
  checkRefFile,
  encodeRefMask,
  fingerprint,
  type RefFile,
  type RefView,
  type RefViewName,
} from '../src/qa/index.ts';
import { resizePhoto, segmentPhoto } from '../src/render/index.ts';
import { type Fetch, writeJson } from './data-wikidata.ts';
import { withTimeout } from './fetch-timeout.ts';

export const REF_CACHE = 'node_modules/.cache/ts23d/ref';
const API = 'https://commons.wikimedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'ts23d-ref (https://github.com/developerz-ai/ts23d)' };
/** Licences whose photos we may fingerprint and credit (all of Commons is free; we record which). */
const FREE = /^(cc0|cc[ -]by|public domain|pd\b|attribution)/i;

export interface PhotoLink {
  readonly view: RefViewName;
  /** `File:…` title on Commons. */
  readonly file: string;
  readonly page: string;
}

/** The first Commons file link per view in the dossier's table rows. */
export function photoLinks(readme: string): PhotoLink[] {
  const out = new Map<RefViewName, PhotoLink>();
  for (const line of readme.split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1] ?? '';
    const m =
      /\]\((https:\/\/commons\.wikimedia\.org\/wiki\/(File:(?:[^()\s]|\([^()\s]*\))+))\)/.exec(
        line,
      );
    if (!m?.[1] || !m[2]) continue;
    const view: RefViewName | null = /3\/4|three.?quarter/i.test(first)
      ? 'threeQuarter'
      : /\bside\b/i.test(first)
        ? 'side'
        : /\bfront\b/i.test(first)
          ? 'front'
          : /\btop\b/i.test(first)
            ? 'top'
            : null;
    if (view && !out.has(view)) out.set(view, { view, file: decodeURIComponent(m[2]), page: m[1] });
  }
  return [...out.values()];
}

interface ImageInfo {
  readonly thumb: string;
  readonly licence: string;
  readonly artist: string;
}

async function imageInfo(file: string, width: number, get: Fetch): Promise<ImageInfo> {
  const url = `${API}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${width}&titles=${encodeURIComponent(file)}`;
  const res = await withTimeout(get)(url, { headers: HEADERS });
  if (!res.ok)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `ref: GET ${url} → HTTP ${res.status}`,
      fix: 'retry later',
    });
  type Meta = { value?: string };
  const body = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: {
            thumburl?: string;
            extmetadata?: { LicenseShortName?: Meta; Artist?: Meta };
          }[];
        }
      >;
    };
  };
  const info = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0];
  const meta = info?.extmetadata ?? {};
  if (!info?.thumburl)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `ref: Commons has no image '${file}'`,
      fix: 'fix the File: link in the recipe README (copy it from the Commons page)',
    });
  return {
    thumb: info.thumburl,
    licence: meta.LicenseShortName?.value ?? '',
    artist: (meta.Artist?.value ?? '').replace(/<[^>]*>/g, '').trim(),
  };
}

/** Bytes of `url`, fetched once (cached by the URL's hash). */
async function cached(url: string, get: Fetch, cache: string): Promise<Uint8Array> {
  const file = join(cache, `${sha256(new TextEncoder().encode(url))}.bin`);
  if (existsSync(file)) return new Uint8Array(await Bun.file(file).arrayBuffer());
  const res = await withTimeout(get)(url, { headers: HEADERS });
  if (!res.ok)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `ref: GET ${url} → HTTP ${res.status}`,
      fix: 'retry later',
    });
  const bytes = new Uint8Array(await res.arrayBuffer());
  await mkdir(cache, { recursive: true });
  await Bun.write(file, bytes);
  return bytes;
}

/** PNG directly; anything else (JPEG) through ffmpeg → PNG. */
export function decodePhoto(bytes: Uint8Array): Rgba {
  const fail = (cause: string): never => {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `ref: photo: ${cause}`,
      fix: 'install ffmpeg (JPEG → PNG), or link a PNG',
    });
  };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  if (png) return decodePng(bytes, fail);
  const p = Bun.spawnSync(
    [
      'ffmpeg',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      '-pix_fmt',
      'rgba',
      'pipe:1',
    ],
    { stdin: bytes },
  );
  if (!p.success) return fail(`ffmpeg failed: ${p.stderr.toString().trim()}`);
  return decodePng(new Uint8Array(p.stdout), fail);
}

const round = (v: readonly number[]): number[] => v.map((x) => Math.round(x * 1e4) / 1e4);

/** One view's derived record from the photo bytes. */
export function refView(
  bytes: Uint8Array,
  width: number,
  source: RefView['source'],
  camera: RefView['camera'],
): RefView {
  const photo = resizePhoto(decodePhoto(bytes), width);
  const mask = segmentPhoto(photo);
  const rgba = photo.data.slice();
  for (let i = 0; i < mask.length; i++) rgba[i * 4 + 3] = mask[i] ? 255 : 0;
  const f = fingerprint(rgba, photo.width, photo.height);
  return {
    mask: encodeRefMask(f.mask128),
    lab: round(f.lab),
    spectrum: round(f.spectrum),
    edges: round(f.edges),
    camera,
    source,
  };
}

export interface RefOptions {
  readonly root?: string;
  readonly width?: number;
  readonly get?: Fetch;
  readonly cache?: string;
}

/** Write `recipes/<name>/ref.json`; returns one line per view. */
export async function refCommand(name: string, o: RefOptions = {}): Promise<string[]> {
  const dir = join(o.root ?? 'recipes', name);
  const readme = join(dir, 'README.md');
  if (!existsSync(readme))
    throw new Ts23dError('T3D_RECIPE_NOT_FOUND', {
      cause: `ref: no ${readme}`,
      fix: 'bun run ref <name> with a recipes/<name>/README.md dossier',
    });
  const links = photoLinks(await Bun.file(readme).text());
  if (!links.length)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `ref: ${readme} links no Commons File: photo in a view row (side / front / top / 3/4)`,
      fix: 'add a "Photos per view" table: | Side, standing | [name](https://commons.wikimedia.org/wiki/File:…) |',
    });
  const out = join(dir, 'ref.json');
  const old: RefFile | null = existsSync(out) ? checkRefFile(await Bun.file(out).json()) : null;
  const views: Partial<Record<RefViewName, RefView>> = {};
  const lines: string[] = [];
  const get = o.get ?? fetch;
  for (const link of links) {
    const info = await imageInfo(link.file, o.width ?? 512, get);
    if (!FREE.test(info.licence)) {
      lines.push(`· ${link.view}: skipped ${link.file} (licence '${info.licence}' is not CC/PD)`);
      continue;
    }
    const bytes = await cached(info.thumb, get, o.cache ?? REF_CACHE);
    const source = {
      url: link.page,
      sha256: sha256(bytes),
      licence: info.licence,
      ...(info.artist ? { artist: info.artist } : {}),
    };
    views[link.view] = refView(
      bytes,
      o.width ?? 512,
      source,
      old?.views[link.view]?.camera ?? null,
    );
    lines.push(`✓ ${link.view}: ${link.file} (${info.licence})`);
  }
  await writeJson(out, { views });
  return [...lines, `wrote ${out}`];
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const w = args.indexOf('--width');
    const name = args.find((a, k) => !a.startsWith('--') && args[k - 1] !== '--width');
    if (!name) console.log('usage: bun run ref <recipe> [--width 512]');
    else
      for (const line of await refCommand(name, w >= 0 ? { width: Number(args[w + 1]) } : {}))
        console.log(line);
  } catch (e) {
    const fix = (e as { fix?: string }).fix;
    console.error(`${(e as Error).message}${fix ? `\nfix: ${fix}` : ''}`);
    process.exitCode = 1;
  }
}
