// Recipe validation: every bad input throws T3D_RECIPE_INVALID with the fix, before any painting.

import { Ts23dError } from '../../core/index.ts';
import { CELLS, STRIPS } from '../trim-sheet.ts';
import type { CellImage, SheetRecipe, StripKind, StripRecipe } from './types.ts';

const KINDS: readonly StripKind[] = [
  'bond',
  'planks',
  'plates',
  'noise',
  'flat',
  'slate',
  'concrete',
  'glass',
];
const SIZES = [512, 1024, 2048];

function fail(cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `sheet recipe: ${cause}`, fix });
}

const unit = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;

export function validateStrip(where: string, r: StripRecipe): void {
  if (!KINDS.includes(r.kind))
    fail(`${where}.kind '${r.kind}' is unknown`, `use one of ${KINDS.join(' | ')}`);
  if (!(Number.isFinite(r.scaleMetres) && r.scaleMetres > 0))
    fail(
      `${where}.scaleMetres is ${r.scaleMetres}`,
      'set the metres the strip V span represents, > 0 (e.g. 0.6 for brick)',
    );
  if (!unit(r.roughness)) fail(`${where}.roughness is ${r.roughness}`, 'roughness is 0..1');
  if (r.metalness !== undefined && !unit(r.metalness))
    fail(`${where}.metalness is ${r.metalness}`, 'metalness is 0..1');
  for (const [k, v] of Object.entries(r.params ?? {}))
    if (!Number.isFinite(v)) fail(`${where}.params.${k} is ${v}`, 'params are finite numbers');
}

export function validateSheet(recipe: SheetRecipe): void {
  if (!Number.isInteger(recipe.seed)) fail(`seed ${recipe.seed}`, 'seed is an integer');
  if (recipe.size !== undefined && !SIZES.includes(recipe.size))
    fail(`size ${recipe.size}`, 'size is 512, 1024 or 2048');
  for (const [id, r] of Object.entries(recipe.strips)) {
    if (!(STRIPS as readonly string[]).includes(id))
      fail(`strip '${id}' is not in the layout`, `strips are ${STRIPS.join(', ')}`);
    if (r) validateStrip(`strips.${id}`, r);
  }
  for (const [id, e] of Object.entries(recipe.cells ?? {})) {
    if (!(CELLS as readonly string[]).includes(id))
      fail(`cell '${id}' is not in the layout`, `cells are ${CELLS.join(', ')}`);
    if (!e) continue;
    if ('image' in e) {
      if (!((e as CellImage).image instanceof Uint8Array))
        fail(`cells.${id}.image is not bytes`, 'pass PNG file bytes as a Uint8Array');
    } else validateStrip(`cells.${id}`, e);
  }
}
