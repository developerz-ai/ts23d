// Reads the committed outputs of every asset (`recipes/<folder>/out/<asset>/`: manifest.json,
// critique.json, renders, WAVs) into the page's light `MediaEntry` and the per-asset `MediaFacts`.
// Pure file reading; the Vite plugin (`media-plugin.ts`) decides the URLs and publishes the files.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MEDIA_IMAGES,
  type MediaCritique,
  type MediaEntry,
  type MediaFacts,
  type MediaImage,
  type MediaMeasure,
  type MediaWeather,
} from './src/media-types.ts';

type Json = Record<string, unknown>;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

/** The URL-free part of an entry; the plugin adds hero/card/sheet/facts URLs. */
export type EntryCore = Omit<MediaEntry, 'hero' | 'card' | 'sheet' | 'facts'>;
/** Facts with file names in place of URLs (the plugin maps them). */
export type FactsCore = Omit<MediaFacts, 'images' | 'sounds'> & {
  readonly sounds: readonly (Omit<MediaFacts['sounds'][number], 'url'> & { file: string | null })[];
  readonly images: readonly MediaImage[];
};

export interface Found {
  readonly entry: EntryCore;
  readonly facts: FactsCore;
  readonly dir: string;
  readonly hero: boolean;
  readonly sheet: boolean;
  /** Files the plugin may publish as they are (png, wav). */
  readonly files: readonly string[];
}

function readJson(file: string): Json | null {
  if (!existsSync(file)) return null;
  try {
    return obj(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function critiqueOf(c: Json | null): MediaCritique | null {
  if (!c || typeof c['overall'] !== 'number') return null;
  const scores: Record<string, { score: number; reason: string }> = {};
  for (const [k, v] of Object.entries(obj(c['scores'])))
    scores[k] = { score: num(obj(v)['score']), reason: str(obj(v)['reason']) };
  const m = obj(c['metrics']);
  const rest = obj(m['rest']);
  return {
    reviewer: str(c['reviewer']) || 'agent',
    overall: num(c['overall']),
    scores,
    silhouette: arr<Json>(m['silhouette']).map((s) => ({
      view: str(s['view']),
      iou: num(s['iou']),
    })),
    focal: arr<Json>(obj(m['focal'])['top']).map((f) => ({
      part: str(f['part']),
      share: num(f['share']),
    })),
    rest:
      typeof rest['share'] === 'number'
        ? { share: num(rest['share']), min: num(rest['min']) }
        : null,
    shape: str(obj(m['shape'])['shape']) || null,
  };
}

function weatherOf(w: unknown): MediaWeather[] {
  return Object.entries(obj(w)).map(([effect, v]) => ({
    effect,
    target: num(obj(v)['target']),
    actual: num(obj(v)['actual']),
    area: num(obj(v)['area']),
  }));
}

export function read(dir: string, folder: string): Found | null {
  const m = readJson(join(dir, 'manifest.json'));
  if (!m) return null;
  const files = readdirSync(dir).filter((f) => /^[\w-]+\.(png|wav)$/.test(f));
  const qa = obj(m['qa']);
  const pivots = arr<{ motion?: string }>(m['pivots']);
  const critique = critiqueOf(readJson(join(dir, 'critique.json')));
  const variants = obj(m['variants']) as MediaFacts['variants'];
  const sounds = arr<Json>(m['sounds']).map((s) => {
    const clip = str(s['clip']);
    return {
      node: str(s['node']),
      clip,
      trigger: str(s['trigger']),
      loop: s['loop'] === true,
      seconds: num(s['seconds']),
      file: files.includes(`${clip}.wav`) ? `${clip}.wav` : null,
    };
  });
  return {
    dir,
    files,
    hero: files.includes('hero.png'),
    sheet: files.includes('sheet.png'),
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
      emitters: arr(m['emitters']).length,
      sockets: arr(m['sockets']).length,
      surfaces: arr<string>(m['surfaces']),
      real: (m['real'] as MediaEntry['real'] | undefined) ?? null,
      qa: m['qa'] ? { pass: qa['pass'] === true, findings: arr(qa['findings']).length } : null,
      score: critique?.overall ?? null,
      sounds: sounds.length,
      liveries: Object.keys(variants).length,
    },
    facts: {
      measures: arr<MediaMeasure>(m['measures']),
      sources: arr<string>(m['sources']),
      paint: obj(m['paint']) as MediaFacts['paint'],
      variants,
      sounds,
      weather: weatherOf(m['weather']),
      joints: arr(m['joints']).length,
      critique,
      images: MEDIA_IMAGES.filter((i) => files.includes(`${i}.png`)),
    },
  };
}

/** Every `recipes/<folder>/out/<asset>/` with a readable manifest, in folder then asset order. */
export function scan(recipes: string): Found[] {
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
