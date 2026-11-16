// `t3d init [--engine godot|unity|unreal|three|babylon] [--out <dir>] [--brief "…"] [--json]`:
// make a game project ts23d-ready. Writes plain files the agent edits, no hidden state: the recipe
// folder with `style.ts` (style bible) and `PLAN.md` (asset plan), `t3d.config.ts`, a `ts23d`
// entry in `.mcp.json`, `assets*` scripts in `package.json` (build into the engine's import
// folder with its profile) and the engine's ignore files. Idempotent: an existing file is never
// overwritten (it is listed as skipped); JSON files only gain missing keys. No --engine: guessed
// from project.godot / *.uproject / ProjectSettings/ / a three or babylon dependency.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ENGINES, type Engine, engineLayout, sheetInProject } from '../export/index.ts';
import { oneOf, usage } from './flags.ts';
import { versionOf } from './help.ts';
import { planTemplate } from './plan-template.ts';
import { envelope } from './report.ts';

export interface InitResult {
  readonly engine: Engine;
  readonly root: string;
  /** The import folder the scripts build into. */
  readonly out: string;
  readonly created: readonly string[];
  /** Existing JSON files that gained keys (nothing in them changed). */
  readonly merged: readonly string[];
  /** Existing files left as they were. */
  readonly skipped: readonly string[];
  /** Next commands for the agent. */
  readonly next: readonly string[];
}

const PKG = '@developerz.ai/ts23d';

const STYLE = `// Style bible for this game: palette roles every asset sits near (CIEDE2000), texel density,
// bevels, wear, value key. Members of a set are measured against it (ts23d coherence QA).
import { defineStyle } from '${PKG}';

export const style = defineStyle({
  name: 'game',
  palette: {
    primary: '#84402d',
    secondary: '#5a5f63',
    accent: '#c9a227',
    dark: '#2a2622',
    light: '#d8cfbf',
  },
  paletteDeltaE: 14,
});
`;

const CONFIG = `// ts23d project config. Builds run from package.json (\`bun run assets\`); this file names the
// optional model adapters (t3d neural ls / run). No adapters = every asset is built on the CPU.
import { defineConfig } from '${PKG}';

export const config = defineConfig({
  // neural: { mesh: http('http://127.0.0.1:8190', 'pixal3d') },
});
`;

/** The engine a folder already is, if it says. */
export function detectEngine(root: string): Engine | undefined {
  const has = (p: string): boolean => existsSync(join(root, p));
  if (has('project.godot')) return 'godot';
  if (readdirSync(root).some((f) => f.endsWith('.uproject'))) return 'unreal';
  if (has('ProjectSettings') && has('Assets')) return 'unity';
  if (!has('package.json')) return undefined;
  const deps = readFileSync(join(root, 'package.json'), 'utf8');
  if (/"three"\s*:/.test(deps)) return 'three';
  if (/"@babylonjs\/core"\s*:/.test(deps)) return 'babylon';
  return undefined;
}

function options(argv: readonly string[]): {
  engine?: Engine;
  out?: string;
  brief?: string;
  root: string;
} {
  const o: { engine?: Engine; out?: string; brief?: string; root: string } = { root: '.' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    const v = (): string => {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--'))
        throw usage(`${a} needs a value`, `pass ${a} <value>`);
      return next;
    };
    if (a === '--json') continue;
    else if (a === '--engine') o.engine = oneOf(a, v(), ENGINES);
    else if (a === '--out') o.out = v();
    else if (a === '--brief') o.brief = v();
    else if (a === '--dir') o.root = v();
    else
      throw usage(
        `unknown argument ${a} for t3d init`,
        'flags: --engine <e> --out <dir> --brief "…" --dir <project> --json',
      );
  }
  return o;
}

/** Scaffold `root`; pure file work, so tests run it on a temp folder. */
export async function initProject(argv: readonly string[]): Promise<InitResult> {
  const o = options(argv);
  if (!existsSync(o.root))
    throw usage(
      `no folder at ${o.root}`,
      'create the project folder first, or pass --dir <project>',
    );
  const engine = o.engine ?? detectEngine(o.root);
  if (!engine)
    throw usage(
      't3d init cannot tell the engine of this folder',
      `pass --engine ${ENGINES.join('|')}`,
    );
  const l = engineLayout(engine);
  const out = o.out ?? l.out;
  sheetInProject(`${out}/asset`); // D53: the import folder must sit inside the project
  const created: string[] = [];
  const merged: string[] = [];
  const skipped: string[] = [];
  const write = (rel: string, text: string): void => {
    const p = join(o.root, rel);
    if (existsSync(p)) {
      skipped.push(rel);
      return;
    }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    created.push(rel);
  };
  /** Add `keys` under `at` of a JSON file, never replacing a key that is there. */
  const mergeJson = (
    rel: string,
    base: Record<string, unknown>,
    at: string,
    keys: Record<string, unknown>,
  ): void => {
    const p = join(o.root, rel);
    if (!existsSync(p)) {
      write(rel, `${JSON.stringify({ ...base, [at]: keys }, null, 2)}\n`);
      return;
    }
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    } catch {
      throw usage(`${rel} is not valid JSON`, `fix ${rel} by hand, then run t3d init again`);
    }
    const have = (doc[at] ?? {}) as Record<string, unknown>;
    const add = Object.fromEntries(Object.entries(keys).filter(([k]) => !(k in have)));
    if (!Object.keys(add).length) {
      skipped.push(rel);
      return;
    }
    writeFileSync(p, `${JSON.stringify({ ...doc, [at]: { ...have, ...add } }, null, 2)}\n`);
    merged.push(rel);
  };

  const flags = `--out ${out} --profile ${l.profile}`;
  write(`${l.recipes}/PLAN.md`, planTemplate(engine, o.brief));
  write(`${l.recipes}/style.ts`, STYLE);
  write('t3d.config.ts', CONFIG);
  for (const f of l.ignore) write(f, '');
  mergeJson('.mcp.json', {}, 'mcpServers', {
    ts23d: { type: 'stdio', command: 'bunx', args: ['-p', PKG, 't3d', 'mcp'] },
  });
  const pkg = {
    name: 'game-assets',
    private: true,
    type: 'module',
    devDependencies: { [PKG]: `^${await versionOf()}` },
  };
  mergeJson('package.json', pkg, 'scripts', {
    assets: `t3d build ${l.recipes} ${flags}`,
    'assets:watch': `t3d build --watch ${l.recipes} ${flags}`,
    'assets:plan': `t3d plan check ${l.recipes}/PLAN.md --out ${out}`,
  });
  const next = [
    'bun install',
    `fill ${l.recipes}/PLAN.md from the game brief, then write ${l.recipes}/<asset>/<asset>.ts per row`,
    'bun run assets:watch   (rebuilds on save into the import folder)',
    'bun run assets:plan    (missing / unplanned / over budget / missing clips)',
  ];
  return { engine, root: o.root, out, created, merged, skipped, next };
}

export async function initMain(argv: readonly string[], json: boolean): Promise<number> {
  const r = await initProject(argv);
  if (json) envelope(true, r);
  else {
    const l = engineLayout(r.engine);
    console.log(`t3d init --engine ${r.engine} (profile ${l.profile}, import folder ${r.out}/)`);
    for (const f of r.created) console.log(`  + ${f}`);
    for (const f of r.merged) console.log(`  ~ ${f} (added missing keys)`);
    for (const f of r.skipped) console.log(`  = ${f} (exists, left as is)`);
    console.log(`next:\n${r.next.map((n) => `  ${n}`).join('\n')}`);
  }
  return 0;
}
