// Guard: an asset's shipped triangles stay inside its class band (scripts/lib/budget-bands.ts, from
// the playbooks), or its README says why on a `Budget why: <reason>` line. Reads the committed
// recipes/*/out/<asset>/manifest.json, which the recipes gate holds equal to a fresh compile, so no
// recipe is imported here. Ratchet: offenders recorded in scripts/lib/budget-baseline.ts warn while
// they do not grow; any other offender fails now; an entry that no longer offends fails as stale.
//   bun run scripts/budget-bands.ts [--json]      (the conventions gate runs it too)

import { join } from 'node:path';
import { BANDS, type Band, bandOf, type Triple } from './lib/budget-bands.ts';
import { type BaselineEntry, BUDGET_BASELINE } from './lib/budget-baseline.ts';
import { report, type Violation } from './lib/files.ts';

/** One committed asset: what it ships per LOD and what its folder README says. */
export interface AssetTriangles {
  readonly asset: string;
  /** The recipe entry, recipes/<dir>/<dir>.ts: where a finding points. */
  readonly file: string;
  readonly kind: string;
  readonly tags: readonly string[];
  readonly triangles: Triple;
  readonly why?: string;
}

export interface BandFindings {
  /** Fail the gate. */
  readonly enforced: Violation[];
  /** Baseline offenders: printed until their owners reduce or justify them. */
  readonly warned: Violation[];
}

const WHY = /^\s*budget why:[ \t]*(\S.{19,}?)\s*$/im;

/** The README's `Budget why: …` reason (at least 20 characters), if any. */
export function budgetWhy(readme: string): string | undefined {
  return WHY.exec(readme)?.[1];
}

const BASELINE = 'scripts/lib/budget-baseline.ts';

/** How far over: the worst LOD's triangles ÷ its ceiling. */
const ratioOf = (t: Triple, band: Band): number =>
  Math.max(...t.map((n, i) => n / (band.triangles[i] ?? 1)));

/** The LODs over their ceiling, as `LOD0 909000 > 100000`. */
const overs = (t: Triple, band: Band): string[] =>
  t.flatMap((n, i) => {
    const max = band.triangles[i] ?? 0;
    return n > max ? [`LOD${i} ${n} > ${max}`] : [];
  });

/** Every asset against its class band, with the baseline applied. */
export function bandFindings(
  assets: readonly AssetTriangles[],
  baseline: Readonly<Record<string, BaselineEntry>> = BUDGET_BASELINE,
  bands: readonly Band[] = BANDS,
): BandFindings {
  const enforced: Violation[] = [];
  const warned: Violation[] = [];
  const offending = new Set<string>();
  for (const a of assets) {
    const at = (message: string, fix: string): Violation => ({
      file: a.file,
      line: 1,
      message,
      fix,
    });
    const band = bandOf(a.kind, a.tags, bands);
    if (!a.triangles.every(Number.isFinite)) {
      enforced.push(
        at(
          `T3D_BUDGET_BAND ${a.asset}: its manifest.json has no triangles [lod0, lod1, lod2]`,
          `bun run shots ${a.file.split('/')[1]} (then commit its out/)`,
        ),
      );
      continue;
    }
    if (!band) {
      enforced.push(
        at(
          `T3D_BUDGET_BAND ${a.asset}: no band for kind '${a.kind}'`,
          'add a row for the kind to scripts/lib/budget-bands.ts, from its playbook',
        ),
      );
      continue;
    }
    const over = overs(a.triangles, band);
    if (over.length === 0 || a.why) continue;
    offending.add(a.asset);
    const ratio = ratioOf(a.triangles, band).toFixed(1);
    const head = `T3D_BUDGET_BAND ${a.asset} (${band.id}, ${band.source}): ${over.join(', ')} (${ratio}×)`;
    const fix = `read ctx.lod and emit less until every LOD fits the band, or add a line "Budget why: <reason>" to the recipe README`;
    const base = baseline[a.asset];
    if (!base) enforced.push(at(head, fix));
    else if (a.triangles.some((n, i) => n > (base.triangles[i] ?? 0)))
      enforced.push(
        at(
          `${head}: grew past its baseline ${base.triangles.join('/')}`,
          `get back under ${base.triangles.join('/')} (${BASELINE}); then ${fix}`,
        ),
      );
    else warned.push(at(`${head}; next: ${base.next}`, fix));
  }
  for (const asset of Object.keys(baseline))
    if (!offending.has(asset))
      enforced.push({
        file: BASELINE,
        line: 1,
        message: `T3D_BUDGET_BAND stale baseline entry ${asset}: it fits its band, says why, or no longer exists`,
        fix: `delete ${asset} from BUDGET_BASELINE (the baseline only shrinks)`,
      });
  return { enforced, warned };
}

/** Every committed manifest under <root>/recipes, with its folder's README reason. */
export async function readAssetTriangles(root = process.cwd()): Promise<AssetTriangles[]> {
  const out: AssetTriangles[] = [];
  const glob = new Bun.Glob('recipes/*/out/*/manifest.json');
  for (const path of [...glob.scanSync({ cwd: root })].sort()) {
    const [, dir = ''] = path.split('/');
    if (dir.startsWith('_')) continue;
    const m = (await Bun.file(join(root, path)).json()) as {
      name?: unknown;
      kind?: unknown;
      tags?: unknown;
      triangles?: unknown;
    };
    const t = Array.isArray(m.triangles)
      ? m.triangles.map((n) => (typeof n === 'number' ? n : NaN))
      : [];
    const readme = Bun.file(join(root, 'recipes', dir, 'README.md'));
    const why = budgetWhy((await readme.exists()) ? await readme.text() : '');
    out.push({
      asset: typeof m.name === 'string' ? m.name : (path.split('/')[3] ?? ''),
      file: `recipes/${dir}/${dir}.ts`,
      kind: typeof m.kind === 'string' ? m.kind : '',
      tags: Array.isArray(m.tags) ? m.tags.filter((x): x is string => typeof x === 'string') : [],
      // Not three numbers: NaN, which bandFindings reports instead of passing.
      triangles: t.length === 3 ? [t[0] ?? NaN, t[1] ?? NaN, t[2] ?? NaN] : [NaN, NaN, NaN],
      ...(why ? { why } : {}),
    });
  }
  return out;
}

/** Print baseline offenders to stderr (stdout stays valid --json). */
export function warnBands(warned: readonly Violation[]): void {
  if (warned.length === 0) return;
  console.error(
    `! budget bands: ${warned.length} baseline offender(s) (${BASELINE}); reduce each or add "Budget why:" to its README, then delete its entry`,
  );
  for (const v of warned) console.error(`  ${v.file}  ${v.message}`);
}

/** The guard as the conventions gate runs it. */
export async function budgetBandChecks(root = process.cwd()): Promise<BandFindings> {
  return bandFindings(await readAssetTriangles(root));
}

if (import.meta.main) {
  const { enforced, warned } = await budgetBandChecks();
  warnBands(warned);
  process.exitCode = report('budget-bands', enforced, process.argv.includes('--json'));
}
