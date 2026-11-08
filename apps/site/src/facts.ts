// Per-asset facts (`media/<name>/facts.json`: measures, sources, critique, liveries, sounds,
// extra renders), fetched once per asset page; null for assets with no committed outputs.

import type { Item } from './items.ts';
import type { MediaFacts } from './media-types.ts';

const cache = new Map<string, Promise<MediaFacts | null>>();

export function loadFacts(item: Item): Promise<MediaFacts | null> {
  const url = item.media?.facts;
  if (!url) return Promise.resolve(null);
  let hit = cache.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<MediaFacts>) : null))
      .catch(() => null);
    cache.set(url, hit);
  }
  return hit;
}
