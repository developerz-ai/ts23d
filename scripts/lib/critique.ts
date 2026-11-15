// The critique attestation as a recipes-gate step: reads each asset's committed
// out/<asset>/critique.json, hashes the committed hero.png + sheet.png it must be bound to, and
// turns missing / malformed / stale / low-scored critiques into violations. Phase-in switch here.
// Calibrated half: the predicted score (src/qa/critique-calibrate.ts) vs the claimed one, the
// ratchet against recipes/critique-baseline.json and the flagship floor.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflationTolerance, measureCalibrated } from '../../src/cli/critique-cmd.ts';
import { loadTextureCache } from '../../src/cli/texture-cache.ts';
import type { CompiledAsset } from '../../src/core/index.ts';
import { provideTextures } from '../../src/material/index.ts';
import { BOUND_RENDERS, critiqueFindings } from '../../src/qa/critique.ts';
import type { Violation } from './files.ts';

/**
 * 'warn': findings print, the gate stays green (assets predate critiques).
 * 'enforce': findings fail the recipes gate. Flip once every committed asset has a critique.
 */
export const CRITIQUE_MODE: 'warn' | 'enforce' = 'warn';

/**
 * The phase-in ends on this date (UTC): from then on the gate enforces even while CRITIQUE_MODE
 * says 'warn'. Moving it is a deliberate, reviewed edit, never a silent forever-warn.
 */
export const ENFORCE_FROM = '2027-01-15';

/** The mode the recipes gate applies today: CRITIQUE_MODE until ENFORCE_FROM, then 'enforce'. */
export function critiqueMode(today: Date = new Date()): 'warn' | 'enforce' {
  return CRITIQUE_MODE === 'enforce' || today.toISOString().slice(0, 10) >= ENFORCE_FROM
    ? 'enforce'
    : 'warn';
}

/** Pass mark on every criterion, repo-wide. No per-recipe overrides: fix the asset instead. */
export const CRITIQUE_MIN_SCORE = 8;

const sha256 = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

/** Violations for one asset's committed critique (dir = recipes/<name>, file = its entry .ts). */
export async function critiqueViolations(
  dir: string,
  file: string,
  asset: string,
  minimum: number = CRITIQUE_MIN_SCORE,
): Promise<Violation[]> {
  const out = join(dir, 'out', asset);
  const committed: Record<string, string> = {};
  for (const f of BOUND_RENDERS) {
    const b = Bun.file(join(out, f));
    if (await b.exists()) committed[f] = sha256(new Uint8Array(await b.arrayBuffer()));
  }
  const cj = Bun.file(join(out, 'critique.json'));
  let raw: unknown;
  if (await cj.exists()) {
    try {
      raw = await cj.json();
    } catch {
      raw = null; // unparsable: reported as "not a JSON object"
    }
  }
  const redo = `bun run t3d critique ${file} --out tmp/critique, READ the images, write ${out}/critique.json`;
  return critiqueFindings(asset, raw, committed, minimum).map((f) => ({
    file,
    line: 1,
    message: f.message,
    fix: f.fix.startsWith('bun run t3d critique <recipe>') ? redo : f.fix,
  }));
}

/** Print critique findings as warnings (warn mode). Goes to stderr so --json stdout stays valid. */
export function warnCritiques(violations: readonly Violation[]): void {
  if (violations.length === 0) return;
  console.error(
    `! critique (warn mode until ${ENFORCE_FROM}, then failing): ${violations.length} finding(s) — score every asset ≥ ${CRITIQUE_MIN_SCORE}`,
  );
  for (const v of violations) console.error(`  ${v.file}  ${v.message}\n    fix: ${v.fix}`);
}

/**
 * `bun run shots` replaces out/ wholesale; carry each asset's critique.json across so a refresh
 * keeps it (and the gate then reports it stale if the images changed). Call between rendering
 * into `tmp` and swapping it in.
 */
export async function keepCritiques(out: string, tmp: string): Promise<string[]> {
  const kept: string[] = [];
  if (!existsSync(out)) return kept; // first render: nothing to keep
  const glob = new Bun.Glob('*/critique.json');
  for await (const rel of glob.scan({ cwd: out, onlyFiles: true })) {
    const asset = rel.split('/')[0] ?? '';
    // Only for assets the recipe still exports (their folder was re-rendered into tmp).
    if (!(await Bun.file(join(tmp, asset, 'manifest.json')).exists())) continue;
    await Bun.write(join(tmp, rel), Bun.file(join(out, rel)));
    kept.push(rel);
  }
  return kept.sort();
}

/** The flagship assets: the calibrated gate enforces on these first. */
export const FLAGSHIPS = [
  'wolf',
  'amur_tiger',
  'dragon',
  'human_head',
  'elf_head',
  'goblin_head',
  'orc_head',
] as const;

/**
 * Flagship floor on the BLIND agent-panel median (critique.json reviewer 'agent-panel', fresh):
 * the panel sees anatomy and proportion the metrics cannot. Rises only (a test pins the minimum).
 */
export const FLAGSHIP_FLOOR = 8.5;
/** Floor findings report until slice 17 brings the flagships up; then flip to true. */
export const FLOOR_ENFORCED = false;
/** A calibrated score may fall at most this far under its baseline without a README `why`. */
export const REGRESSION_TOLERANCE = 0.5;
export const BASELINE_FILE = 'recipes/critique-baseline.json';

/** `Critique why: …` in the recipe README explains (and allows) a calibrated regression. */
const WHY = /^\s*critique why:\s*\S/im;

export interface CalibratedInput {
  readonly asset: string;
  readonly file: string;
  readonly predicted: number;
  /** The committed critique.json's overall, when there is one. */
  readonly claimed?: number;
  /** Who scored it ('agent-panel' = blind three-review median; sets the inflation band). */
  readonly reviewer?: string;
  /** The agent-panel median, only when critique.json is a panel AND bound to today's renders. */
  readonly panel?: number;
  /** recipes/critique-baseline.json's score for this asset, when recorded. */
  readonly baseline?: number;
  readonly readme: string;
}

export interface CalibratedViolations {
  /** Fail the gate now. */
  readonly enforced: Violation[];
  /** Print only (critique phase-in, or the floor before slice 17). */
  readonly warned: Violation[];
}

/**
 * The calibrated checks as violations: T3D_CRITIQUE_INFLATED (claim − calibrated over 1.5, or 2.5
 * for an agent panel; enforced on flagships, phase-in elsewhere), T3D_CRITIQUE_REGRESSED (calibrated
 * vs baseline; enforced) and T3D_CRITIQUE_BELOW_FLOOR (flagship panel median under the floor, or no
 * fresh panel; reports until FLOOR_ENFORCED). `mode` is critiqueMode() for non-flagship inflation.
 */
export function calibratedViolations(
  i: CalibratedInput,
  mode: 'warn' | 'enforce' = critiqueMode(),
): CalibratedViolations {
  const enforced: Violation[] = [];
  const warned: Violation[] = [];
  const flagship = (FLAGSHIPS as readonly string[]).includes(i.asset);
  const at = (message: string, fix: string): Violation => ({ file: i.file, line: 1, message, fix });
  const band = inflationTolerance(i.reviewer);
  if (i.claimed !== undefined && i.claimed - i.predicted > band)
    (flagship || mode === 'enforce' ? enforced : warned).push(
      at(
        `T3D_CRITIQUE_INFLATED ${i.asset}: claimed ${i.claimed} (${i.reviewer ?? 'unknown'}) vs calibrated ${i.predicted} (> ${band} over)`,
        `score what the renders show: run a blind panel (bun run golden brief ${i.file}), or improve the asset`,
      ),
    );
  if (
    i.baseline !== undefined &&
    i.predicted < i.baseline - REGRESSION_TOLERANCE &&
    !WHY.test(i.readme)
  )
    enforced.push(
      at(
        `T3D_CRITIQUE_REGRESSED ${i.asset}: calibrated ${i.predicted} < baseline ${i.baseline} − ${REGRESSION_TOLERANCE}`,
        `undo or fix the change that made it worse, or add a line "Critique why: <reason>" to the recipe README`,
      ),
    );
  if (flagship && !(i.panel !== undefined && i.panel >= FLAGSHIP_FLOOR))
    (FLOOR_ENFORCED ? enforced : warned).push(
      at(
        i.panel === undefined
          ? `T3D_CRITIQUE_BELOW_FLOOR ${i.asset}: no fresh agent-panel critique (the floor ${FLAGSHIP_FLOOR} is judged by the blind panel)`
          : `T3D_CRITIQUE_BELOW_FLOOR ${i.asset}: agent-panel median ${i.panel} < flagship floor ${FLAGSHIP_FLOOR}`,
        `bun run golden brief ${i.file}, have three independent agents review it, then bun run golden attest ${i.file}; fix what the reviews name`,
      ),
    );
  return { enforced, warned };
}

/** Baseline scores per asset (missing file = none recorded). */
export async function readBaseline(path = BASELINE_FILE): Promise<Record<string, number>> {
  const f = Bun.file(path);
  if (!(await f.exists())) return {};
  const raw: unknown = await f.json();
  const scores = (raw as { scores?: unknown } | null)?.scores;
  if (typeof scores !== 'object' || scores === null) return {};
  return Object.fromEntries(
    Object.entries(scores).filter((e): e is [string, number] => typeof e[1] === 'number'),
  );
}

/** The ratchet: every score is the max of the recorded one and today's; never lowered. */
export function ratchet(
  old: Readonly<Record<string, number>>,
  today: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = { ...old };
  for (const [k, v] of Object.entries(today)) out[k] = Math.max(out[k] ?? v, v);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

let texturesProvided = false;

/** One asset through the calibrated gate: measure LOD0, predict, compare (recipes step). */
export async function calibratedCheck(
  dir: string,
  file: string,
  lod0: CompiledAsset,
  baseline: Readonly<Record<string, number>>,
): Promise<CalibratedViolations & { predicted: number }> {
  if (!texturesProvided) {
    provideTextures(await loadTextureCache());
    texturesProvided = true;
  }
  const predicted = (await measureCalibrated(lod0, dir)).score.overall;
  const out = join(dir, 'out', lod0.name);
  const cj = Bun.file(join(out, 'critique.json'));
  // An unparsable critique.json is critiqueViolations' finding; here it simply claims nothing.
  const raw = ((await cj.exists()) ? await cj.json().catch(() => null) : null) as {
    overall?: unknown;
    reviewer?: unknown;
    renders?: Record<string, unknown>;
  } | null;
  const claimed = typeof raw?.overall === 'number' ? raw.overall : undefined;
  const reviewer = typeof raw?.reviewer === 'string' ? raw.reviewer : undefined;
  let fresh = raw !== null;
  for (const f of BOUND_RENDERS) {
    const b = Bun.file(join(out, f));
    const now = (await b.exists()) ? sha256(new Uint8Array(await b.arrayBuffer())) : undefined;
    if (now === undefined || raw?.renders?.[f] !== now) fresh = false;
  }
  const base = baseline[lod0.name];
  const readme = Bun.file(join(dir, 'README.md'));
  const v = calibratedViolations({
    asset: lod0.name,
    file,
    predicted,
    ...(claimed !== undefined ? { claimed } : {}),
    ...(reviewer ? { reviewer } : {}),
    ...(fresh && reviewer === 'agent-panel' && claimed !== undefined ? { panel: claimed } : {}),
    ...(base !== undefined ? { baseline: base } : {}),
    readme: (await readme.exists()) ? await readme.text() : '',
  });
  return { ...v, predicted };
}
