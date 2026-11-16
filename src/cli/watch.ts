// `t3d build --watch <recipes…|dir>`: build once, then rebuild on save. A change to any file in a
// recipe's import graph (its own sibling modules, `_lib/` parts, the style bible) rebuilds exactly
// the recipe entries that import it, debounced. Each rebuild is a child `t3d build` with the same
// flags, so watch writes the same bytes as a plain build; a failing recipe prints its findings
// and the watch goes on. A directory argument means its entries: `<dir>/<n>/<n>.ts` and
// `<dir>/<n>.ts` (not `_*`, `*.test.ts`, `style.ts`, `index.ts`).

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  type WatchListener,
  watch,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { SWITCHES, usage, VALUED } from './flags.ts';

const SKIP = /(^_|\.test\.ts$|\.d\.ts$|^style\.ts$|^index\.ts$)/;

/** Recipe entry files under `dir`, sorted. */
export function recipeEntries(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.test(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      const entry = join(p, `${name}.ts`);
      if (existsSync(entry)) out.push(entry);
    } else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Files and directories → recipe entry files (a directory expands to its entries). */
export function entriesOf(paths: readonly string[]): string[] {
  return paths.flatMap((p) =>
    existsSync(p) && statSync(p).isDirectory() ? recipeEntries(p) : [p],
  );
}

const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** Relative imports of one file, resolved to absolute paths that exist. */
function localImports(file: string): string[] {
  let src: string;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  let found: { path: string }[];
  try {
    found = transpiler.scanImports(src);
  } catch {
    return []; // a half-saved file: its child build reports the parse error
  }
  return found
    .filter((i) => i.path.startsWith('.'))
    .map((i) => resolve(dirname(file), i.path))
    .flatMap(
      (p) =>
        [p, `${p}.ts`, join(p, 'index.ts')].find((c) => existsSync(c) && statSync(c).isFile()) ??
        [],
    );
}

/** Every absolute file → the entries (absolute) whose import graph holds it. */
export function importGraph(entries: readonly string[]): Map<string, Set<string>> {
  const users = new Map<string, Set<string>>();
  for (const entry of entries.map((e) => resolve(e))) {
    const todo = [entry];
    const seen = new Set<string>();
    while (todo.length) {
      const f = todo.pop() ?? '';
      if (seen.has(f)) continue;
      seen.add(f);
      users.set(f, (users.get(f) ?? new Set()).add(entry));
      todo.push(...localImports(f));
    }
  }
  return users;
}

/** The entries to rebuild for a set of changed files, in entry order. */
export function dependants(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  entries: readonly string[],
  changed: Iterable<string>,
): string[] {
  const hit = new Set<string>();
  for (const f of changed) for (const e of graph.get(resolve(f)) ?? []) hit.add(e);
  return entries.filter((e) => hit.has(resolve(e)));
}

/** argv minus `build`, `--watch` and the positional files: the flags every rebuild repeats. */
export function buildFlags(argv: readonly string[]): { files: string[]; flags: string[] } {
  const files: string[] = [];
  const flags: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--watch') continue;
    if (VALUED.includes(a)) flags.push(a, argv[++i] ?? '');
    else if (SWITCHES.includes(a) || a.startsWith('-')) flags.push(a);
    else files.push(a);
  }
  return { files, flags };
}

export interface WatchDeps {
  /** One child build of `files`; resolves to its exit code. */
  readonly build: (files: readonly string[]) => Promise<number>;
  readonly watch: (dir: string, on: WatchListener<string>) => { close(): void };
  readonly log: (line: string) => void;
  readonly debounceMs: number;
}

const childBuild =
  (flags: readonly string[]) =>
  async (files: readonly string[]): Promise<number> => {
    const bin = join(import.meta.dir, 'bin.ts');
    const p = Bun.spawn([process.execPath, bin, 'build', ...files, ...flags], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    return p.exited;
  };

/** A running watch: `changed(files)` is what the file watcher calls; `close()` stops it. */
export function startWatch(paths: readonly string[], deps: WatchDeps) {
  const roots = paths.filter((p) => existsSync(p) && statSync(p).isDirectory());
  let entries = entriesOf(paths);
  let graph = importGraph(entries);
  const watchers = new Map<string, { close(): void }>();
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const rebuild = async (files: readonly string[]): Promise<void> => {
    if (!files.length) return;
    deps.log(`t3d watch: building ${files.map((f) => basename(f, '.ts')).join(', ')}`);
    const code = await deps.build(files);
    if (code !== 0) deps.log(`t3d watch: build exited ${code}; fix and save, still watching`);
  };
  const subdirs = (r: string): string[] =>
    readdirSync(r)
      .map((n) => join(r, n))
      .filter((p) => statSync(p).isDirectory());
  const follow = (): void => {
    const dirs = [...roots, ...roots.flatMap(subdirs), ...[...graph.keys()].map((f) => dirname(f))];
    for (const dir of new Set(dirs.map((d) => resolve(d))))
      if (!watchers.has(dir))
        watchers.set(
          dir,
          deps.watch(dir, (_e, name) => name && changed([join(dir, name)])),
        );
  };
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    const now = [...pending];
    pending = new Set();
    entries = entriesOf(paths); // new recipe folders join, deleted ones leave
    const fresh = entries.filter((e) => !graph.has(resolve(e)));
    const hit = new Set([...dependants(graph, entries, now), ...fresh]);
    graph = importGraph(entries);
    follow();
    running = running.then(() => rebuild(entries.filter((e) => hit.has(e) && existsSync(e))));
    return running;
  };
  const changed = (files: readonly string[]): void => {
    for (const f of files) pending.add(resolve(f));
    clearTimeout(timer);
    timer = setTimeout(flush, deps.debounceMs);
  };
  follow();
  return {
    first: (): Promise<void> => (running = running.then(() => rebuild(entries))),
    changed,
    flush,
    close: (): void => {
      clearTimeout(timer);
      for (const w of watchers.values()) w.close();
    },
  };
}

/** `t3d build --watch …`: never returns on its own (Ctrl-C stops it). */
export async function watchMain(argv: readonly string[]): Promise<number> {
  const { files, flags } = buildFlags(argv);
  if (files.length === 0)
    throw usage(
      't3d build --watch needs recipe files or a folder',
      'pass one: t3d build --watch assets --out models',
    );
  const missing = files.find((f) => !existsSync(f));
  if (missing)
    throw new Ts23dError('T3D_RECIPE_NOT_FOUND', {
      cause: `no recipe file or folder at ${missing}`,
      fix: 'check the path; t3d init puts recipes in assets/<name>/<name>.ts',
    });
  const w = startWatch(files, {
    build: childBuild(flags),
    watch: (dir, on) => watch(dir, on),
    log: (line) => console.error(line),
    debounceMs: 150,
  });
  await w.first();
  console.error('t3d watch: watching; save a recipe to rebuild it (Ctrl-C stops)');
  return new Promise<number>(() => {});
}
