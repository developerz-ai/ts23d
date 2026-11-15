// Golden set, step 1: download CC0 game assets from Poly Haven (every asset there is CC0-1.0,
// polyhaven.com/license) as glTF at 1k, swap each baseColor JPEG for the PNG Poly Haven also
// publishes (importGlb projects PNG only), drop the other maps, and pack one self-contained GLB per
// asset into the gitignored .ts23d/golden/. Records the page URL, author, licence and the GLB's
// sha256. Kenney and Quaternius were tried: their sites refuse scripted downloads (HTTP 403 /
// Google Drive), so the set is Poly Haven only until a pinned mirror exists.

import { encodePng } from '../src/core/index.ts';
import { decodePng } from '../src/material/index.ts';
import { packGlb } from '../src/neural/index.ts';
import { DOWNLOAD_TIMEOUT_MS, type TimedFetch, withTimeout } from './fetch-timeout.ts';
import { sha256 } from './textures-snippet.ts';

export const GOLDEN_DIR = '.ts23d/golden';
const API = 'https://api.polyhaven.com';

/** The golden assets: organic forms (busts, heads, animals, rock, fruit) and hard-surface props. */
export const GOLDEN_IDS = [
  'marble_bust_01',
  'bull_head',
  'horse_head',
  'lion_head',
  'street_rat',
  'concrete_cat_statue',
  'horse_statue_01',
  'carved_wooden_elephant',
  'bronze_shark_statue',
  'gothic_statue',
  'rubber_duck_toy',
  'food_apple_01',
  'rock_07',
  'moon_rock_01',
  'wooden_crate_01',
  'ArmChair_01',
  'alarm_clock_01',
  'bench_vice_01',
  'bolt_cutters_01',
  'metal_tool_chest',
  'mousetrap',
  'ratchet_wrench',
  'security_camera_01',
  'vintage_hand_drill',
  'Barrel_01',
  'old_tyre',
  'wooden_bucket_01',
  'metal_jug',
  'Television_01',
  'vintage_microwave',
  'Lantern_01',
  'wooden_hammer_01',
  'Sofa_01',
  'SchoolChair_01',
  'painted_wooden_stool',
  'WetFloorSign_01',
  'Shelf_01',
  'ceramic_vase_02',
  'oil_tin',
  'brass_vase_03',
] as const;

export interface GoldenSource {
  readonly id: string;
  readonly url: string;
  readonly license: 'CC0-1.0';
  readonly author: string;
  /** sha256 of the packed GLB in .ts23d/golden/<id>.glb. */
  readonly sha256: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const objs = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);

/**
 * A .gltf (JSON + one external .bin) to a GLB with only the baseColor images, embedded as PNG.
 * `pngOf(uri)` gives the PNG bytes for an image's original uri. Pure and deterministic.
 */
export function gltfToGlb(
  gltf: Json,
  bin: Uint8Array,
  pngOf: (uri: string) => Uint8Array,
): { json: Json; bin: Uint8Array } {
  const buffers = objs(gltf['buffers']);
  if (buffers.length !== 1) throw new Error(`golden: expected one buffer, got ${buffers.length}`);
  const images = objs(gltf['images']);
  const textures = objs(gltf['textures']);
  const keepImage = new Map<number, number>();
  const keepTexture = new Map<number, number>();
  const outTextures: Json[] = [];
  const outImages: Json[] = [];
  const views = objs(gltf['bufferViews']).map((v) => ({ ...v }));
  const chunks: Uint8Array[] = [bin];
  let length = align(bin.byteLength);
  const materials = objs(gltf['materials']).map((m) => {
    const pbr = obj(m['pbrMetallicRoughness']);
    const factor = pbr['baseColorFactor'];
    const tex = obj(pbr['baseColorTexture'])['index'];
    const out: Json = { ...(Array.isArray(factor) ? { baseColorFactor: factor } : {}) };
    if (typeof tex === 'number') {
      if (!keepTexture.has(tex)) {
        const src = textures[tex]?.['source'];
        if (typeof src !== 'number') throw new Error(`golden: texture ${tex} has no source`);
        if (!keepImage.has(src)) {
          const uri = images[src]?.['uri'];
          if (typeof uri !== 'string') throw new Error(`golden: image ${src} has no uri`);
          const png = pngOf(uri);
          views.push({ buffer: 0, byteOffset: length, byteLength: png.byteLength });
          chunks.push(png);
          length = align(length + png.byteLength);
          keepImage.set(src, outImages.length);
          outImages.push({ bufferView: views.length - 1, mimeType: 'image/png' });
        }
        keepTexture.set(tex, outTextures.length);
        outTextures.push({ source: keepImage.get(src) });
      }
      out['baseColorTexture'] = { index: keepTexture.get(tex) };
    }
    return { name: m['name'] ?? '', pbrMetallicRoughness: out };
  });
  const packed = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    packed.set(c, at);
    at = align(at + c.byteLength);
  }
  const { extensionsUsed: _u, extensionsRequired: _r, samplers: _s, ...rest } = gltf;
  const json: Json = {
    ...rest,
    buffers: [{ byteLength: length }],
    bufferViews: views,
    materials,
    textures: outTextures,
    images: outImages,
  };
  return { json, bin: packed };
}

const align = (n: number): number => Math.ceil(n / 4) * 4;

/** Poly Haven's PNGs are 16-bit; importGlb reads 8-bit RGBA, so re-encode (deterministic). */
export function eightBit(png: Uint8Array): Uint8Array {
  const img = decodePng(png, (cause) => {
    throw new Error(`golden: baseColor PNG unreadable: ${cause}`);
  });
  return encodePng(img.width, img.height, img.data);
}

/** Poly Haven's PNG twin of a JPEG map URL (same path under /png/, .png extension). */
export const pngUrl = (jpg: string): string =>
  jpg.replace('/Models/jpg/', '/Models/png/').replace(/\.jpe?g$/i, '.png');

/** Download one asset and pack it: the GLB bytes and its source record. */
export async function fetchGolden(
  id: string,
  fetch: TimedFetch,
): Promise<{ glb: Uint8Array; source: GoldenSource }> {
  const get = withTimeout(fetch, DOWNLOAD_TIMEOUT_MS);
  const json = async (url: string): Promise<Json> => {
    const r = await get(url);
    if (!r.ok) throw new Error(`golden: GET ${url} → HTTP ${r.status}`);
    return obj(await r.json());
  };
  const bytes = async (url: string): Promise<Uint8Array> => {
    const r = await get(url);
    if (!r.ok) throw new Error(`golden: GET ${url} → HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const info = await json(`${API}/info/${id}`);
  const entry = obj(obj(obj(obj(await json(`${API}/files/${id}`))['gltf'])['1k'])['gltf']);
  const include = obj(entry['include']);
  const urlOf = (uri: string): string => {
    const u = obj(include[uri])['url'];
    if (typeof u !== 'string') throw new Error(`golden: ${id} lists no file for '${uri}'`);
    return u;
  };
  if (typeof entry['url'] !== 'string') throw new Error(`golden: ${id} has no 1k glTF`);
  const gltf = await json(entry['url']);
  const binUri = objs(gltf['buffers'])[0]?.['uri'];
  if (typeof binUri !== 'string') throw new Error(`golden: ${id} has no external .bin`);
  const bin = await bytes(urlOf(binUri));
  const pngs = new Map<string, Uint8Array>();
  for (const img of objs(gltf['images'])) {
    const uri = img['uri'];
    if (typeof uri === 'string' && /_diff_/.test(uri))
      pngs.set(uri, eightBit(await bytes(pngUrl(urlOf(uri)))));
  }
  const packed = gltfToGlb(gltf, bin, (uri) => {
    const b = pngs.get(uri);
    if (!b) throw new Error(`golden: ${id} baseColor '${uri}' is not a _diff_ map`);
    return b;
  });
  const glb = packGlb(packed.json, packed.bin);
  const authors = Object.keys(obj(info['authors'])).sort();
  return {
    glb,
    source: {
      id,
      url: `https://polyhaven.com/a/${id}`,
      license: 'CC0-1.0',
      author: authors.join(', ') || 'Poly Haven',
      sha256: sha256(glb),
    },
  };
}
