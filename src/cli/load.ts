// Load a recipe module and collect every exported Asset. Recipes are plain TS modules: the CLI,
// the site and tests all import them the same way. A missing file is T3D_RECIPE_NOT_FOUND; a
// module that fails to parse, resolve or evaluate is T3D_RECIPE_THREW (its own Ts23dError, e.g.
// defineAsset's T3D_RECIPE_INVALID, passes through, even from another copy of the library);
// `recipeThrew` wraps a throw from build().

import { isAbsolute, relative, resolve } from 'node:path';
import { type Asset, isAsset, isTs23dError, Ts23dError } from '../core/index.ts';

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : (JSON.stringify(e) ?? String(e));

/** A path as the user would type it: relative under the working directory, else absolute. */
function shown(abs: string): string {
  const rel = relative(process.cwd(), abs);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : abs;
}

/** `file:line:col` of the first stack frame inside the recipe file (where to look). */
function frameIn(e: unknown, file: string): string | undefined {
  const abs = resolve(file);
  const stack = e instanceof Error ? (e.stack ?? '') : '';
  for (const line of stack.split('\n')) {
    const at = line.indexOf(abs);
    if (at < 0) continue;
    const m = /^[^:)\s]+(:\d+:\d+)/.exec(line.slice(at));
    return `${shown(abs)}${m?.[1] ?? ''}`;
  }
  // Parse errors (Bun's BuildMessage) carry a position instead of a stack.
  const pos = (e as { position?: { line?: number; column?: number } } | null)?.position;
  return pos?.line ? `${shown(abs)}:${pos.line}:${pos.column ?? 0}` : undefined;
}

/** The top `n` `at …` frames of the stack, for a throw that never passed through the recipe. */
function topFrames(e: unknown, n = 3): string[] {
  const stack = e instanceof Error ? (e.stack ?? '') : '';
  return stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at '))
    .slice(0, n);
}

/** A dependency the project has not installed yet (typical right after `t3d init`). */
function missingPackage(e: unknown): string | undefined {
  const pkg = /Cannot find package '([^']+)'/.exec(messageOf(e))?.[1];
  if (!pkg) return undefined;
  return pkg.startsWith('@developerz.ai/ts23d')
    ? 'run `bun install` (or `bun add -d @developerz.ai/ts23d`) in the project root'
    : `run \`bun install\` (or \`bun add ${pkg}\`) in the project root`;
}

/** Where to look, when no stack frame lies inside the recipe file. */
function fixWithoutFrame(e: unknown, file: string): string {
  const frames = topFrames(e);
  return frames.length
    ? `the throw came from library code called by ${file}; check the options passed to the call that reaches it (top frames: ${frames.join(' · ')})`
    : `a non-Error value was thrown, so there is no stack: search ${file} (and what it imports) for that message`;
}

/** Anything a recipe throws that is not already coded → T3D_RECIPE_THREW naming file and line. */
export function recipeThrew(e: unknown, file: string, what: string): Ts23dError {
  if (isTs23dError(e)) return e;
  const where = frameIn(e, file);
  return new Ts23dError('T3D_RECIPE_THREW', {
    cause: `${what} threw: ${messageOf(e).split('\n')[0]}${where ? ` (${where})` : ''}`,
    fix: missingPackage(e) ?? (where ? `fix the recipe at ${where}` : fixWithoutFrame(e, file)),
  });
}

export async function loadAssets(file: string): Promise<Asset[]> {
  if (!(await Bun.file(resolve(file)).exists()))
    throw new Ts23dError('T3D_RECIPE_NOT_FOUND', {
      cause: `no recipe file at ${file}${resolve(file) === file ? '' : ` (${resolve(file)})`}`,
      fix: 'check the path: recipes are <folder>/<name>/<name>.ts — recipes/ in the ts23d repo, assets/ in a `t3d init` project (ts23d/ for Unity); `t3d list <folder>` lists every recipe in it',
    });
  let mod: Record<string, unknown>;
  try {
    mod = await import(resolve(file));
  } catch (e) {
    throw recipeThrew(e, file, `loading ${file}`);
  }
  const assets = Object.values(mod).filter(isAsset);
  if (assets.length === 0) {
    throw new Ts23dError('T3D_NO_ASSET_EXPORT', {
      cause: `${file} exports no asset`,
      fix: 'export const my_thing = defineAsset({ … }) — named export, no default',
    });
  }
  // One asset exported under two names is one asset.
  return [...new Set(assets)];
}
