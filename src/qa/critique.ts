// Critique attestation: the shape of critique.json (a vision agent's scored judgement of an
// asset's renders) and the checks that turn it into QA findings — missing, malformed, stale (the
// images it judged are not the images committed today) or scored below the minimum.

import type { ArtMetrics } from './critique-metrics.ts';
import type { Finding } from './types.ts';

/** The fixed rubric, in the order rubric.md asks for it. */
export const CRITERIA = [
  'silhouette',
  'proportions',
  'materials',
  'detail',
  'wear',
  'lod',
  'technical',
] as const;

export type Criterion = (typeof CRITERIA)[number];

export interface CriterionScore {
  /** 0–10. 8 = would ship in a commercial game as-is; 10 = indistinguishable from the best. */
  readonly score: number;
  readonly reason: string;
  /** Concrete recipe changes that would raise the score; empty only at 10. */
  readonly fixes: readonly string[];
}

export interface Critique {
  readonly asset: string;
  /** Who scored it: 'agent' (a vision model) or 'human'. */
  readonly reviewer: string;
  readonly overall: number;
  readonly scores: Readonly<Record<Criterion, CriterionScore>>;
  /** Image file name → sha256 hex of the exact bytes judged. */
  readonly renders: Readonly<Record<string, string>>;
  /** Measured art metrics the pack computed (copied, never scored); absent in older critiques. */
  readonly metrics?: ArtMetrics;
}

/** The committed images every critique must be bound to: change them and the critique is stale. */
export const BOUND_RENDERS = ['hero.png', 'sheet.png'] as const;

/** Default pass mark on every criterion. */
export const CRITIQUE_MINIMUM = 8;

/** Unvalidated JSON with the fields we look at, each still `unknown`. */
type Loose<K extends string> = { readonly [P in K]?: unknown };
const isObject = (v: unknown): v is object =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isScore = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

/** The reason's first sentence, capped: the gate line stays one line; critique.json keeps all. */
const firstSentence = (r: string): string => {
  const s = r.split(/(?<=\.)\s/)[0] ?? r;
  return s.length > 140 ? `${s.slice(0, 139)}…` : s;
};

/** Validates parsed JSON against the Critique shape: the critique, or every problem found. */
export function parseCritique(raw: unknown): { critique?: Critique; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(raw)) return { errors: ['not a JSON object'] };
  const r: Loose<'asset' | 'reviewer' | 'overall' | 'scores' | 'renders' | 'metrics'> = raw;
  if (typeof r.asset !== 'string') errors.push('asset: missing string');
  if (typeof r.reviewer !== 'string' || r.reviewer === '')
    errors.push("reviewer: missing ('agent' or 'human')");
  if (!isScore(r.overall)) errors.push('overall: missing number 0–10');
  const scores: Loose<Criterion> | undefined = isObject(r.scores) ? r.scores : undefined;
  if (!scores) errors.push('scores: missing object');
  for (const c of scores ? CRITERIA : []) {
    const s = scores?.[c];
    if (!isObject(s)) {
      errors.push(`scores.${c}: missing`);
      continue;
    }
    const { score, reason, fixes }: Loose<'score' | 'reason' | 'fixes'> = s;
    if (!isScore(score)) errors.push(`scores.${c}.score: not a number 0–10`);
    if (typeof reason !== 'string' || reason.trim() === '')
      errors.push(`scores.${c}.reason: empty`);
    if (!isStrings(fixes)) errors.push(`scores.${c}.fixes: not a string array`);
    else if (isScore(score) && score < 10 && fixes.length === 0)
      errors.push(`scores.${c}.fixes: empty below 10 — name what would raise it`);
  }
  if (!isObject(r.renders)) errors.push('renders: missing object of file → sha256');
  else
    for (const [k, v] of Object.entries(r.renders))
      if (typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v))
        errors.push(`renders.${k}: not a sha256 hex`);
  if (r.metrics !== undefined && !isObject(r.metrics))
    errors.push('metrics: not an object (copy it from critique.template.json, or drop it)');
  return errors.length ? { errors } : { critique: raw as Critique, errors };
}

/**
 * QA findings for one asset's critique. `raw` is the parsed critique.json (undefined = none
 * committed); `committed` maps each bound render (hero.png, sheet.png) to the sha256 of the file
 * committed today (a missing file simply has no entry).
 */
export function critiqueFindings(
  asset: string,
  raw: unknown,
  committed: Readonly<Record<string, string>>,
  minimum: number = CRITIQUE_MINIMUM,
): Finding[] {
  const gate = 'critique';
  const code = 'T3D_QA_CRITIQUE';
  const redo = `bun run t3d critique <recipe> --out tmp/critique, READ every image, then write critique.json`;
  if (raw === undefined) return [{ gate, code, message: `${asset}: no critique.json`, fix: redo }];
  const { critique, errors } = parseCritique(raw);
  if (!critique)
    return errors.map((e) => ({
      gate,
      code,
      message: `${asset}: critique.json ${e}`,
      fix: 'fill critique.json from the critique.template.json the pack wrote',
    }));
  const out: Finding[] = [];
  if (critique.asset !== asset)
    out.push({
      gate,
      code,
      message: `critique.json is for '${critique.asset}', not '${asset}'`,
      fix: `move it to out/${critique.asset}/ or re-critique ${asset}`,
    });
  for (const f of BOUND_RENDERS) {
    const judged = critique.renders[f];
    const now = committed[f];
    if (judged === undefined || now === undefined || judged !== now)
      out.push({
        gate,
        code,
        message: `${asset}: critique is stale — ${f} ${
          judged === undefined
            ? 'was not judged'
            : now === undefined
              ? 'is not committed'
              : `changed since it was judged (${judged.slice(0, 8)} → ${now.slice(0, 8)})`
        }`,
        fix: `${redo} (the asset changed: judge what ships)`,
      });
  }
  for (const c of CRITERIA) {
    const s = critique.scores[c];
    if (s.score < minimum)
      out.push({
        gate,
        code,
        part: c,
        message: `${asset}: ${c} scored ${s.score} < ${minimum} — ${firstSentence(s.reason)}`,
        fix: s.fixes.join(' · '),
      });
  }
  return out;
}
