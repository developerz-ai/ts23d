// Where MCP tools may read and write: the project root (recipes, renders) and the configured output
// directory, nothing else. A path is resolved against the root, symlinks followed through its
// deepest existing ancestor, and refused with T3D_CLI_USAGE when it lands outside every allowed
// directory, so `../../etc` and a symlink out of the project both fail before any file is touched.
// A recipe directory is expanded here and every entry confined, so a linked entry is refused
// before anything is imported.

import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Ts23dError } from '../../core/index.ts';
import { entriesOf } from '../watch.ts';

export interface Sandbox {
  /** Absolute, symlink-free project root: recipes are read from here, relative paths start here. */
  readonly root: string;
  /** Absolute, symlink-free default output directory (inside or outside the root). */
  readonly out: string;
}

/** Follow symlinks for the part of `abs` that exists; keep the not-yet-created tail as given. */
function real(abs: string): string {
  let head = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(head), ...tail.reverse());
    } catch {
      const up = dirname(head);
      if (up === head) return abs;
      tail.push(basename(head));
      head = up;
    }
  }
}

const within = (dir: string, p: string): boolean => {
  const rel = relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export function sandboxOf(root: string, out = 'out'): Sandbox {
  const r = real(resolve(root));
  return { root: r, out: real(resolve(r, out)) };
}

/**
 * `p` (relative to the root, or absolute) as an absolute path inside one of `allowed`
 * (default: the root and the output directory); else T3D_CLI_USAGE naming what is allowed.
 */
export function confine(
  box: Sandbox,
  p: string,
  what: string,
  allowed: readonly string[] = [box.root, box.out],
): string {
  const abs = real(resolve(box.root, p));
  if (allowed.some((dir) => within(dir, abs))) return abs;
  throw new Ts23dError('T3D_CLI_USAGE', {
    cause: `${what} '${p}' resolves to ${abs}, outside ${allowed.join(' and ')}`,
    fix: `pass a path inside the project, e.g. ${what === 'recipe' ? 'recipes/<name>/<name>.ts' : 'out'}; start \`t3d mcp\` in the project root (or --root <dir>, --out <dir>)`,
  });
}

/** The recipe files `p` names (a directory expands to its entries), each confined to the root. */
export function confineRecipes(box: Sandbox, p: string): string[] {
  const abs = confine(box, p, 'recipe', [box.root]);
  let dir = false;
  try {
    dir = statSync(abs).isDirectory();
  } catch {
    return [abs]; // missing: the command reports T3D_RECIPE_NOT_FOUND
  }
  if (!dir) return [abs];
  return entriesOf([abs]).map((e) => confine(box, e, 'recipe', [box.root]));
}
