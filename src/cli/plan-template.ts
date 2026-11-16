// The asset plan, `<recipes>/PLAN.md`: game brief → sets → one table row per asset (kind, real
// references, LOD0 triangle budget for the platform, clips and hooks the game code will use).
// `planTemplate` writes the empty plan `t3d init` scaffolds; `parsePlan` reads the tables back;
// `checkPlan` holds them against the recipes and their built manifests: a planned asset with no
// recipe, a recipe nobody planned, a build over its budget, a planned clip the build lacks.

import type { ErrorCode } from '../core/index.ts';
import { ENGINES, type Engine, engineLayout } from '../export/index.ts';
import { usage } from './flags.ts';

export interface PlannedAsset {
  readonly name: string;
  /** The `## ` heading the row sits under (characters, creatures, buildings…). */
  readonly set: string;
  readonly kind: string;
  readonly refs: string;
  /** LOD0 triangle cap on the plan's platform; undefined = no cap. */
  readonly tris?: number;
  readonly clips: readonly string[];
  /** Sockets / hitboxes / pivots the game code binds to (free text, for the agent). */
  readonly hooks: string;
}

export interface Plan {
  readonly brief: string;
  readonly engine?: Engine;
  readonly platform: string;
  readonly assets: readonly PlannedAsset[];
}

/** What a build reports that the plan checks: from `<out>/<asset>/manifest.json`. */
export interface BuiltStats {
  readonly lods: readonly number[];
  readonly triangles: readonly number[];
  readonly clips?: readonly { readonly name: string }[];
}

export interface PlanFinding {
  readonly check: 'missing' | 'extra' | 'budget' | 'clip';
  readonly code: ErrorCode;
  readonly asset: string;
  readonly message: string;
  readonly fix: string;
}

const SETS = [
  ['characters', 'people, orcs, bots: skinned, clips + hitboxes'],
  ['creatures', 'animals and monsters: kind creature, gaits as clips'],
  ['buildings', 'kind building: real storey heights, doors that open'],
  ['props', 'crates, barrels, furniture, pickups: small budgets'],
  ['vehicles', 'kind vehicle: wheels and turrets as pivots'],
  ['terrain', 'ground, rocks, trees, foliage cards'],
  ['fx sockets', 'muzzles, exhausts, torches: sockets/emitters on other assets'],
] as const;

const HEADER = '| asset | kind | refs | tris | clips | hooks |\n|---|---|---|---|---|---|';

/** The empty plan for a game on `engine`; `brief` is the one-line game idea. */
export function planTemplate(
  engine: Engine,
  brief = 'one line: what the player does, where',
): string {
  const l = engineLayout(engine);
  const sets = SETS.map(([s, hint]) => `## ${s}\n<!-- ${hint} -->\n\n${HEADER}\n`);
  return `# Asset plan

Brief: ${brief}
Engine: ${engine}
Platform: desktop

<!-- How to fill this (the agent does it, from the brief):
1. List every asset the game needs, one row each, under its set. asset = snake_case name = the
   recipe ${l.recipes}/<asset>/<asset>.ts = the folder ${l.out}/<asset>/.
2. kind: a ts23d kind (creature, vehicle, building, prop, terrain, tree…). refs: the real thing
   it is built from (species, model, Wikipedia/spec links) → its README.md.
3. tris: LOD0 triangle cap for the platform (empty = none). Rough caps per platform:
   | platform | hero character/creature | vehicle | building | prop |
   | mobile   | 15k  | 20k  | 10k  | 2k  |
   | desktop  | 150k | 150k | 60k  | 10k |
   | console  | 100k | 100k | 50k  | 8k  |
4. clips: the animations game code plays, comma-separated (walk, run, bite, open).
5. hooks: sockets, hitboxes and pivots the code binds to (mouth socket, head hitbox, door pivot).
Then \`t3d plan check\` lists missing recipes, unplanned recipes, builds over tris and missing clips.
Example row: | wolf | creature | Canis lupus, 0.8 m shoulder | 150000 | walk, trot, bite | head hitbox, mouth socket |
-->

${sets.join('\n')}`;
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** `150000` · `150k` · `1.5m` · empty → undefined; anything else is a usage error. */
function triangles(v: string, asset: string): number | undefined {
  if (v === '' || v === '-') return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*([km]?)$/i.exec(v.replaceAll(/[,_ ]/g, ''));
  if (!m) throw usage(`PLAN.md: ${asset} tris '${v}' is not a number`, 'write e.g. 150000 or 150k');
  const scale = { '': 1, k: 1e3, m: 1e6 }[(m[2] ?? '').toLowerCase()] ?? 1;
  return Math.round(Number(m[1]) * scale);
}

const field = (md: string, key: string): string =>
  new RegExp(`^${key}:\\s*(.*)$`, 'mi').exec(md)?.[1]?.trim() ?? '';

/** Read the asset tables (any table whose first header cell is `asset`); comments are skipped. */
export function parsePlan(md: string): Plan {
  const text = md.replaceAll(/<!--[\s\S]*?-->/g, '');
  const assets: PlannedAsset[] = [];
  let set = '';
  let cols: string[] | null = null;
  for (const line of text.split('\n')) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) set = (h[1] ?? '').trim();
    if (!line.trim().startsWith('|')) {
      cols = null;
      continue;
    }
    const c = cells(line);
    if (!cols) {
      cols = c[0]?.toLowerCase() === 'asset' ? c.map((x) => x.toLowerCase()) : [];
      continue;
    }
    if (!cols.length || c.every((x) => /^:?-+:?$/.test(x))) continue;
    const at = (k: string): string => c[cols?.indexOf(k) ?? -1] ?? '';
    const name = at('asset');
    if (!/^[a-z][a-z0-9_]*$/.test(name))
      throw usage(
        `PLAN.md: asset '${name}' is not snake_case`,
        'name assets like recipe folders: wolf, oak_tree',
      );
    if (assets.some((a) => a.name === name))
      throw usage(`PLAN.md: asset '${name}' is planned twice`, 'keep one row per asset');
    const tris = triangles(at('tris'), name);
    const clips = at('clips')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    assets.push({
      name,
      set,
      kind: at('kind'),
      refs: at('refs'),
      clips,
      hooks: at('hooks'),
      ...(tris === undefined ? {} : { tris }),
    });
  }
  const e = field(md, 'Engine');
  const engine = ENGINES.find((x) => x === e);
  return {
    brief: field(md, 'Brief'),
    platform: field(md, 'Platform') || 'desktop',
    assets,
    ...(engine ? { engine } : {}),
  };
}

/** Plan vs recipes (asset name → entry file in `dir`) and built manifests (name → stats). */
export function checkPlan(
  plan: Plan,
  recipes: ReadonlyMap<string, string>,
  built: ReadonlyMap<string, BuiltStats>,
  dir = 'assets',
): PlanFinding[] {
  const out: PlanFinding[] = [];
  const planned = new Set(plan.assets.map((a) => a.name));
  for (const a of plan.assets) {
    if (!recipes.has(a.name)) {
      out.push({
        check: 'missing',
        code: 'T3D_RECIPE_NOT_FOUND',
        asset: a.name,
        message: `planned (${a.set}) but no recipe`,
        fix: `write ${dir}/${a.name}/${a.name}.ts (defineAsset name '${a.name}', kind ${a.kind || '…'})`,
      });
      continue;
    }
    const b = built.get(a.name);
    if (!b) continue;
    const lod0 = b.triangles[b.lods.indexOf(0)];
    if (a.tris !== undefined && lod0 !== undefined && lod0 > a.tris)
      out.push({
        check: 'budget',
        code: 'T3D_QA_FAILED',
        asset: a.name,
        message: `LOD0 has ${lod0} triangles, plan allows ${a.tris} on ${plan.platform}`,
        fix: 'gate detail on ctx.lod (fewer segments, cards instead of strands) or raise tris in PLAN.md with a reason',
      });
    const have = new Set((b.clips ?? []).map((c) => c.name));
    for (const clip of a.clips)
      if (!have.has(clip))
        out.push({
          check: 'clip',
          code: 'T3D_QA_FAILED',
          asset: a.name,
          message: `planned clip '${clip}' is not in the build (has: ${[...have].join(', ') || 'none'})`,
          fix: `add the '${clip}' clip to the recipe, or rename it in PLAN.md to one the build has`,
        });
  }
  for (const [name, file] of recipes)
    if (!planned.has(name))
      out.push({
        check: 'extra',
        code: 'T3D_RECIPE_INVALID',
        asset: name,
        message: `recipe ${file} is not in the plan`,
        fix: `add a row for ${name} to PLAN.md, or delete the recipe`,
      });
  return out;
}
