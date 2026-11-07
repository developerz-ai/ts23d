// Provenance inside the file: `asset.generator` with the version, `asset.copyright`, and an XMP
// packet (KHR_xmp_json_ld, Ratified) with title, description, creators, rights, licence and the
// recipe's sources — what Sketchfab, Blender and asset stores read. No dates: bytes stay
// deterministic.

import type { Json } from './bin-writer.ts';
import { GENERATOR } from './version.ts';

export interface GlbMeta {
  /** Default: the asset name. */
  readonly title?: string;
  readonly description?: string;
  readonly creators?: readonly string[];
  /** Goes to `asset.copyright` and `dc:rights`, e.g. "© 2026 Jane Doe". */
  readonly copyright?: string;
  /** SPDX id or licence URL → `xmpRights:UsageTerms`, e.g. "CC-BY-4.0". */
  readonly license?: string;
  /** Where the numbers came from (the recipe's `sources`) → `dc:relation`. */
  readonly sources?: readonly string[];
  /** Third-party inputs (e.g. CC0 texture sets) → `dc:contributor`. Filled by export. */
  readonly credits?: readonly string[];
}

const XMP = 'KHR_xmp_json_ld';
const alt = (value: string): Json => ({
  '@type': 'rdf:Alt',
  'rdf:_1': { '@language': 'x-default', '@value': value },
});

/** `asset` block, plus root `extensions` and the extension name when an XMP packet is written. */
export function metadata(
  name: string,
  meta: GlbMeta | undefined,
): { asset: Json; extensions?: Json; used: string[] } {
  const asset: Json = {
    version: '2.0',
    generator: GENERATOR,
    ...(meta?.copyright ? { copyright: meta.copyright } : {}),
  };
  if (!meta) return { asset, used: [] };
  const packet: Json = {
    '@context': {
      dc: 'http://purl.org/dc/elements/1.1/',
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      xmp: 'http://ns.adobe.com/xap/1.0/',
      xmpRights: 'http://ns.adobe.com/xap/1.0/rights/',
    },
    'dc:title': alt(meta.title ?? name),
    ...(meta.description ? { 'dc:description': alt(meta.description) } : {}),
    ...(meta.creators?.length ? { 'dc:creator': { '@list': [...meta.creators] } } : {}),
    ...(meta.copyright ? { 'dc:rights': alt(meta.copyright) } : {}),
    ...(meta.license ? { 'xmpRights:UsageTerms': alt(meta.license) } : {}),
    ...(meta.sources?.length ? { 'dc:relation': { '@set': [...meta.sources] } } : {}),
    ...(meta.credits?.length ? { 'dc:contributor': { '@set': [...meta.credits] } } : {}),
    'xmp:CreatorTool': GENERATOR,
  };
  return {
    asset: { ...asset, extensions: { [XMP]: { packet: 0 } } },
    extensions: { [XMP]: { packets: [packet] } },
    used: [XMP],
  };
}
