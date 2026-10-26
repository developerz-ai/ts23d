// Load a recipe module and collect every exported Asset. Recipes are plain TS modules: the CLI,
// the site and tests all import them the same way.

import { resolve } from 'node:path';
import { type Asset, isAsset, Ts23dError } from '../core/index.ts';

export async function loadAssets(file: string): Promise<Asset[]> {
  const mod: Record<string, unknown> = await import(resolve(file));
  const assets = Object.values(mod).filter(isAsset);
  if (assets.length === 0) {
    throw new Ts23dError('T3D_NO_ASSET_EXPORT', {
      cause: `${file} exports no asset`,
      fix: 'export const my_thing = defineAsset({ … }) — named export, no default',
    });
  }
  return assets;
}
