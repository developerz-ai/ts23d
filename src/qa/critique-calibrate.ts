// Calibrated critique: a metric vector (critique-vector.ts) → a 0–10 score per criterion, fitted on
// the golden set (critique-golden.json: CC0 game assets, their degraded copies and in-house anchors,
// each scored by a three-review agent panel). An additive model of per-metric isotonic maps
// (pool-adjacent-violators), fitted by backfitting with ridge-style shrinkage: each map is refitted
// on what the others leave unexplained, so one metric's between-asset confounding does not bury
// another's effect. Deterministic: no randomness, fixed tie order, fixed pass count.

import { CRITERIA, type Criterion } from './critique.ts';

export { isotonic, knotValue, spearman } from './critique-stats.ts';

import { dmath } from '../core/index.ts';
import GOLDEN_JSON from './critique-golden.json' with { type: 'json' };
import { REF_METRICS, type RefGaps } from './critique-ref.ts';
import { isotonic, knotValue, spearman } from './critique-stats.ts';
import { METRICS, type MetricVector } from './critique-vector.ts';

/** Criteria the panel scores from images; `lod` and `technical` take the overall model. */
export const PANEL_CRITERIA = ['silhouette', 'proportions', 'materials', 'detail', 'wear'] as const;
type Target = 'overall' | (typeof PANEL_CRITERIA)[number];

export interface GoldenRow {
  /** `<source id>:<variant>`, unique. */
  readonly id: string;
  /** Rows of one asset (original + degraded copies) share a group: held out together. */
  readonly group: string;
  readonly variant: string;
  readonly vector: MetricVector;
  /** Reference-photo gaps, when the asset had ref.json (none in the golden set yet). */
  readonly ref?: RefGaps;
  /** sha256 of the render the vector and the panel saw: a new render drops the stale panel. */
  readonly image?: string;
  /** Panel medians; absent until the panel has scored the row. */
  readonly panel?: Readonly<Record<Target, number>>;
}

export interface GoldenSet {
  readonly reviewer: string;
  readonly rows: readonly GoldenRow[];
}

/** A self-scored claim may exceed the calibrated prediction by at most this (T3D_CRITIQUE_INFLATED). */
export const INFLATION_TOLERANCE = 1.5;
/**
 * A blind agent-panel median may exceed it by at most this: wider, because the panel sees what the
 * metrics cannot (anatomy, proportion against the real thing), so it legitimately sits above them.
 */
export const PANEL_INFLATION_TOLERANCE = 2.5;

/**
 * Leave-one-asset-out Spearman the committed golden set holds today (0.584 measured, 2026-11-15).
 * Rises only. The plan's target is 0.7: not reached by image and mesh metrics alone (planned:
 * reference-photo gaps from slice 02 join the vector).
 */
export const LOO_SPEARMAN_FLOOR = 0.55;

/** Shrinkage per backfitting step (1 = none): the ridge of the additive fit, against overfitting. */
export const SHRINK = 0.3;
/** Backfitting passes over every metric. */
export const PASSES = 10;

/**
 * Metrics whose good direction is known (more is better: art-as-text definitions); their maps are
 * only ever non-decreasing. The others take whichever direction fits the residual better.
 */
export const MORE_IS_BETTER: readonly string[] = [
  'tris',
  'smoothShading',
  'curvSmooth',
  'colourDetail',
  'texelDensity',
  'chroma',
  'valueRange',
  'ref.iou',
];
/** Reference gaps: smaller is closer to the photo. */
export const LESS_IS_BETTER: readonly string[] = ['ref.valueEmd', 'ref.spectrumGap', 'ref.edgeGap'];

/** Fitted columns: the metric vector, then the reference gaps (`ref.<gap>`). */
export const COLUMNS: readonly string[] = [...METRICS, ...REF_METRICS.map((k) => `ref.${k}`)];

/** A gap value meaning "matches the photo": the imputation when no golden row has references. */
const REF_NEUTRAL: Readonly<Record<string, number>> = {
  'ref.iou': 1,
  'ref.valueEmd': 0,
  'ref.spectrumGap': 0,
  'ref.edgeGap': 0,
};

/** One measured asset: its metric vector and, when it has ref.json, its reference gaps. */
export interface Sample {
  readonly vector: MetricVector;
  readonly ref?: RefGaps;
}

const columnOf = (s: Sample, col: string, impute: Readonly<Record<string, number>>): number => {
  if (!col.startsWith('ref.')) return s.vector[col as keyof MetricVector] ?? 0;
  const g = s.ref?.[col.slice(4) as keyof RefGaps];
  return g ?? impute[col] ?? 0;
};

/**
 * Imputation for absent reference gaps: the median over samples that have them, else neutral. With
 * no references in the training set every gap column is constant, so its map is flat: references
 * then report (calibrated.json) but cannot move the score until golden rows carry them.
 */
function imputation(xs: readonly Sample[]): Record<string, number> {
  return Object.fromEntries(
    COLUMNS.filter((c) => c.startsWith('ref.')).map((c) => {
      const v = xs.flatMap((x) => (x.ref ? [columnOf(x, c, {})] : [])).sort((a, b) => a - b);
      return [c, v.length ? (v[Math.floor(v.length / 2)] ?? 0) : (REF_NEUTRAL[c] ?? 0)];
    }),
  );
}

interface Term {
  readonly metric: string;
  /** Isotonic knots, centred: block mean of x → score contribution, x ascending. */
  readonly knots: readonly (readonly [number, number])[];
}

export interface CalibrationModel {
  readonly intercept: number;
  readonly impute: Readonly<Record<string, number>>;
  readonly terms: readonly Term[];
}

export interface CalibratedScore {
  readonly overall: number;
  readonly scores: Readonly<Record<Criterion, number>>;
}

/** Fit one target: an additive model of per-metric isotonic maps, by shrunk backfitting. */
export function fitCalibration(
  xs: readonly Sample[],
  ys: readonly number[],
  shrink: number = SHRINK,
): CalibrationModel {
  const n = ys.length;
  const intercept = ys.reduce((s, y) => s + y, 0) / (n || 1);
  const impute = imputation(xs);
  const cols = COLUMNS.map((c) => xs.map((x) => columnOf(x, c, impute)));
  const knots: (readonly (readonly [number, number])[])[] = COLUMNS.map(() => [[0, 0]]);
  const f = COLUMNS.map(() => new Float64Array(n));
  const total = new Float64Array(n);
  for (let pass = 0; pass < PASSES; pass++)
    COLUMNS.forEach((metric, j) => {
      const col = cols[j] ?? [];
      const own = f[j] ?? new Float64Array(n);
      const r = ys.map((y, i) => y - intercept - (total[i] ?? 0) + (own[i] ?? 0));
      let best = knots[j] ?? [];
      let bestSse = Number.POSITIVE_INFINITY;
      const dirs = MORE_IS_BETTER.includes(metric)
        ? [true]
        : LESS_IS_BETTER.includes(metric)
          ? [false]
          : [true, false];
      for (const up of dirs) {
        const raw = isotonic(col, r, up);
        const mean = col.reduce((s, x) => s + knotValue(raw, x), 0) / (n || 1);
        const k = raw.map(([x, y]): [number, number] => [x, (y - mean) * shrink]);
        const sse = col.reduce((s, x, i) => s + dmath.pow((r[i] ?? 0) - knotValue(k, x), 2), 0);
        if (sse < bestSse) [best, bestSse] = [k, sse];
      }
      knots[j] = best;
      col.forEach((x, i) => {
        const v = knotValue(best, x);
        total[i] = (total[i] ?? 0) - (own[i] ?? 0) + v;
        own[i] = v;
      });
    });
  const terms = COLUMNS.map((metric, j) => ({ metric, knots: knots[j] ?? [] }));
  return { intercept, impute, terms };
}

export function predict(model: CalibrationModel, x: Sample): number {
  const y = model.terms.reduce(
    (s, t) => s + knotValue(t.knots, columnOf(x, t.metric, model.impute)),
    0,
  );
  return Math.min(10, Math.max(0, model.intercept + y));
}

const scored = (g: GoldenSet): GoldenRow[] => g.rows.filter((r) => r.panel !== undefined);
const target =
  (t: Target) =>
  (r: GoldenRow): number =>
    r.panel?.[t] ?? 0;

/** One model per panel target, fitted on every scored golden row. */
export function fitAll(g: GoldenSet): Readonly<Record<Target, CalibrationModel>> {
  const rows = scored(g);
  const xs: Sample[] = rows;
  const fit = (t: Target): CalibrationModel => fitCalibration(xs, rows.map(target(t)));
  return Object.fromEntries(
    (['overall', ...PANEL_CRITERIA] as const).map((t) => [t, fit(t)]),
  ) as Record<Target, CalibrationModel>;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
export const GOLDEN = GOLDEN_JSON as unknown as GoldenSet;
const fitted = new WeakMap<GoldenSet, Readonly<Record<Target, CalibrationModel>>>();

/** The calibrated 0–10 scores of one metric vector (+ reference gaps), rounded to 0.1. */
export function calibratedScore(
  v: MetricVector,
  golden: GoldenSet = GOLDEN,
  ref?: RefGaps,
): CalibratedScore {
  const x: Sample = ref ? { vector: v, ref } : { vector: v };
  let models = fitted.get(golden);
  if (!models) {
    models = fitAll(golden);
    fitted.set(golden, models);
  }
  const overall = r1(predict(models.overall, x));
  const scores = Object.fromEntries(
    CRITERIA.map((c) => {
      const m = (PANEL_CRITERIA as readonly string[]).includes(c)
        ? models[c as Target]
        : models.overall;
      return [c, r1(predict(m, x))];
    }),
  ) as Record<Criterion, number>;
  return { overall, scores };
}

/** Leave-one-group-out overall predictions for every scored row, and their Spearman vs the panel. */
export function leaveOneGroupOut(g: GoldenSet): {
  readonly rows: readonly { id: string; panel: number; predicted: number }[];
  readonly spearman: number;
} {
  const rows = scored(g);
  const models = new Map<string, CalibrationModel>();
  const out = rows.map((r) => {
    let model = models.get(r.group);
    if (!model) {
      const train = rows.filter((o) => o.group !== r.group);
      model = fitCalibration(train, train.map(target('overall')));
      models.set(r.group, model);
    }
    return { id: r.id, panel: target('overall')(r), predicted: predict(model, r) };
  });
  return {
    rows: out,
    spearman: spearman(
      out.map((o) => o.panel),
      out.map((o) => o.predicted),
    ),
  };
}
