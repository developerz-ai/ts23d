// Image-backed strips: a CC0 PBR texture set (Poly Haven, ambientCG or a local file) declared as
// data — URL + sha256 per map, licence, author page, real-world size. Compile and paint stay
// offline: bytes come only from a content-addressed cache the caller provides (`provideTextures`,
// filled by `bun run textures`); a missing map throws T3D_TEXTURE_MISSING with that command.

import { Ts23dError } from '../core/index.ts';

export interface TextureFile {
  /** Download URL (https) or, for `source: 'file'`, a path relative to the working directory. */
  readonly url: string;
  /** Lower-case hex sha256 of the file's bytes: the cache key and the integrity check. */
  readonly sha256: string;
}

export interface TextureSource {
  readonly source: 'polyhaven' | 'ambientcg' | 'file';
  /** The set's id at the source, e.g. 'wood_planks_grey'. */
  readonly id: string;
  /** Only public-domain sets are accepted, so a generated asset never inherits a licence duty. */
  readonly license: 'CC0-1.0';
  /** Human page crediting the set (goes into the GLB's XMP credits). */
  readonly page: string;
  readonly author?: string;
  /** Real-world size the image covers, metres (U × V). Poly Haven lists it as `dimensions`. */
  readonly metres: readonly [number, number];
  readonly maps: {
    /** sRGB base colour. */
    readonly albedo: TextureFile;
    /** Tangent-space normal, OpenGL convention (+Y up in the image; Poly Haven `nor_gl`). */
    readonly normal?: TextureFile;
    /** Packed AO / roughness / metalness (Poly Haven `arm`, glTF ORM order). */
    readonly arm?: TextureFile;
  };
}

/** PNG bytes by sha256. */
export type TextureCache = ReadonlyMap<string, Uint8Array>;

const SHA = /^[0-9a-f]{64}$/;
const provided = new Map<string, Uint8Array>();

/** Hand verified texture bytes to the painter (e.g. from `loadTextureCache()` in scripts). */
export function provideTextures(cache: TextureCache): void {
  for (const [k, v] of cache) provided.set(k, v);
}

export function textureBytes(file: TextureFile, where: string): Uint8Array {
  const hit = provided.get(file.sha256);
  if (hit) return hit;
  throw new Ts23dError('T3D_TEXTURE_MISSING', {
    cause: `${where}: texture ${file.url} (sha256 ${file.sha256.slice(0, 12)}…) is not in the cache`,
    fix: 'run `bun run textures <module defining the material>` once (downloads + verifies into node_modules/.cache/ts23d/textures), then provideTextures(await loadTextureCache()) before painting',
  });
}

export function validateTexture(id: string, t: TextureSource): void {
  const fail = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_MATERIAL_INVALID', { cause: `material '${id}': ${cause}`, fix });
  };
  if (!['polyhaven', 'ambientcg', 'file'].includes(t.source))
    fail(`texture.source '${t.source}'`, "use 'polyhaven', 'ambientcg' or 'file'");
  if (t.license !== 'CC0-1.0')
    fail(
      `texture.license '${t.license}'`,
      'only CC0-1.0 sets are accepted (Poly Haven and ambientCG are CC0)',
    );
  if (!(t.metres.length === 2 && t.metres.every((m) => Number.isFinite(m) && m > 0)))
    fail(`texture.metres [${t.metres}]`, 'give the real size the image covers, e.g. [1.5, 1.5]');
  for (const [map, f] of Object.entries(t.maps)) {
    if (!f) continue;
    if (!SHA.test(f.sha256))
      fail(
        `texture.maps.${map}.sha256 '${f.sha256}'`,
        'lower-case hex sha256 of the file (sha256sum)',
      );
    if (!/\.png$/i.test(f.url))
      fail(
        `texture.maps.${map}.url '${f.url}'`,
        'use the PNG download (8- or 16-bit); JPEG is not decoded',
      );
  }
}

/** One credit line for the GLB's XMP and the docs. */
export const creditOf = (t: TextureSource): string =>
  `${t.id}${t.author ? ` by ${t.author}` : ''} (${t.source}, ${t.license}) ${t.page}`;
