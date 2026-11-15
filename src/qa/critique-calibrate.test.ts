import { describe, expect, it } from 'bun:test';
import { CRITERIA } from './critique.ts';
import {
  calibratedScore,
  fitAll,
  fitCalibration,
  GOLDEN,
  type GoldenRow,
  type GoldenSet,
  isotonic,
  knotValue,
  LOO_SPEARMAN_FLOOR,
  leaveOneGroupOut,
  predict,
  spearman,
} from './critique-calibrate.ts';
import { METRICS, type MetricVector } from './critique-vector.ts';

const vec = (o: Partial<Record<(typeof METRICS)[number], number>>): MetricVector =>
  Object.fromEntries(METRICS.map((m) => [m, o[m] ?? 0.5])) as MetricVector;

/** Synthetic golden set: quality q drives two metrics (one up, one down); one metric is noise. */
function synthetic(groups: number): GoldenSet {
  const rows: GoldenRow[] = [];
  for (let g = 0; g < groups; g++) {
    const base = 4 + ((g * 37) % 50) / 10;
    for (const [variant, drop] of [
      ['original', 0],
      ['flat', 2.5],
      ['decimated', 1.5],
    ] as const) {
      const q = base - drop;
      const noise = ((g * 7919 + drop * 13) % 17) / 17;
      const vector = vec({ smoothShading: q / 10, curvEntropy: 1 - q / 10, chroma: noise });
      const s = { overall: q, silhouette: q, proportions: q, materials: q, detail: q, wear: q };
      rows.push({ id: `g${g}:${variant}`, group: `g${g}`, variant, vector, panel: s });
    }
  }
  return { reviewer: 'test', rows };
}

describe('isotonic', () => {
  it('pools violators into the best monotone fit', () => {
    expect(isotonic([1, 2, 3, 4], [1, 3, 2, 4], true)).toEqual([
      [1, 1],
      [2.5, 2.5],
      [4, 4],
    ]);
    const down = isotonic([1, 2, 3], [3, 1, 2], false);
    expect(down.map((k) => k[1])).toEqual([3, 1.5]);
  });

  it('interpolates between knots and clamps outside them', () => {
    const k: [number, number][] = [
      [0, 2],
      [1, 6],
    ];
    expect(knotValue(k, -5)).toBe(2);
    expect(knotValue(k, 0.5)).toBe(4);
    expect(knotValue(k, 9)).toBe(6);
  });
});

describe('spearman', () => {
  it('is 1 for a monotone relation, −1 reversed, 0 when one side is constant', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 25, 99])).toBeCloseTo(1, 9);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 9);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe('fitCalibration', () => {
  it('a degraded copy scores below its original, and stays within 0–10', () => {
    const g = synthetic(12);
    const rows = g.rows;
    const model = fitCalibration(
      rows,
      rows.map((r) => r.panel?.overall ?? 0),
    );
    for (let i = 0; i < rows.length; i += 3) {
      const [o, f, d] = [rows[i], rows[i + 1], rows[i + 2]].map((r) =>
        predict(model, r ?? { vector: vec({}) }),
      );
      expect(f ?? 0).toBeLessThan(o ?? 0);
      expect(d ?? 0).toBeLessThan(o ?? 0);
    }
    expect(
      predict(model, { vector: vec({ smoothShading: 99, curvEntropy: -99 }) }),
    ).toBeLessThanOrEqual(10);
    expect(
      predict(model, { vector: vec({ smoothShading: -99, curvEntropy: 99 }) }),
    ).toBeGreaterThanOrEqual(0);
  });

  it('a metric unrelated to the score gets a small term; fitting is deterministic', () => {
    const g = synthetic(12);
    const xs = g.rows;
    const ys = g.rows.map((r) => r.panel?.overall ?? 0);
    const m = fitCalibration(xs, ys);
    const span = (k: string): number => {
      const ys = m.terms.find((t) => t.metric === k)?.knots.map((p) => p[1]) ?? [0];
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(span('chroma')).toBeLessThan(span('smoothShading') + span('curvEntropy'));
    expect(fitCalibration(xs, ys)).toEqual(m);
  });

  it('never lets a more-is-better metric lower the score as it rises', () => {
    const xs = [0.1, 0.2, 0.3, 0.4].map((t) => ({ vector: vec({ tris: t }) }));
    const m = fitCalibration(xs, [8, 6, 4, 2]);
    const tris = m.terms.find((t) => t.metric === 'tris')?.knots.map((p) => p[1]) ?? [];
    for (let i = 1; i < tris.length; i++)
      expect(tris[i] ?? 0).toBeGreaterThanOrEqual(tris[i - 1] ?? 0);
  });
});

describe('reference gaps', () => {
  const gaps = (iou: number) => ({ iou, valueEmd: 1 - iou, spectrumGap: 0.1, edgeGap: 0.1 });

  it('move nothing while no golden row has references (neutral imputation)', () => {
    const g = synthetic(12);
    const v = g.rows[0]?.vector ?? vec({});
    expect(calibratedScore(v, g, gaps(0.05))).toEqual(calibratedScore(v, g));
  });

  it('lower the score once golden rows carry them and the panel follows them', () => {
    const g = synthetic(12);
    const withRef: GoldenSet = {
      ...g,
      rows: g.rows.map((r) => ({ ...r, ref: gaps((r.panel?.overall ?? 0) / 10) })),
    };
    const v = g.rows[0]?.vector ?? vec({});
    expect(calibratedScore(v, withRef, gaps(0.1)).overall).toBeLessThan(
      calibratedScore(v, withRef, gaps(0.9)).overall,
    );
  });
});

describe('leaveOneGroupOut', () => {
  it('holds rank order on held-out assets of a learnable set', () => {
    expect(leaveOneGroupOut(synthetic(12)).spearman).toBeGreaterThan(0.9);
  });

  it('is near zero when the panel ignores every metric', () => {
    const g = synthetic(12);
    const shuffled: GoldenSet = {
      ...g,
      rows: g.rows.map((r, i) => {
        const y = ((i * 7) % 11) / 1.1;
        return {
          ...r,
          panel: { overall: y, silhouette: y, proportions: y, materials: y, detail: y, wear: y },
        };
      }),
    };
    expect(Math.abs(leaveOneGroupOut(shuffled).spearman)).toBeLessThan(0.5);
  });
});

describe('committed golden set', () => {
  const scored = GOLDEN.rows.filter((r) => r.panel);
  const groups = new Set(scored.map((r) => r.group));

  it('has at least 12 panel-scored assets, every row a full vector', () => {
    expect(groups.size).toBeGreaterThanOrEqual(12);
    for (const r of GOLDEN.rows) expect(Object.keys(r.vector).sort()).toEqual([...METRICS].sort());
  });

  it(`holds leave-one-asset-out Spearman ≥ ${LOO_SPEARMAN_FLOOR} (measured floor; target 0.7)`, () => {
    expect(leaveOneGroupOut(GOLDEN).spearman).toBeGreaterThanOrEqual(LOO_SPEARMAN_FLOOR);
  });

  it.todo(
    'holds leave-one-asset-out Spearman ≥ 0.7 (planned: needs reference-photo gaps, slice 02)',
  );

  it('never scores a degraded copy above its original; below it wherever the panel saw the defect', () => {
    const model = fitAll(GOLDEN).overall;
    const at = new Map(GOLDEN.rows.map((r) => [r.id, predict(model, r)]));
    const panel = new Map(scored.map((r) => [r.id, r.panel?.overall ?? 0]));
    const wrong = scored.filter((r) => {
      const o = `${r.group}:original`;
      const [own, orig] = [at.get(r.id) ?? 0, at.get(o) ?? 0];
      const seen = (panel.get(r.id) ?? 0) < (panel.get(o) ?? 0);
      return r.variant !== 'original' && (own > orig || (seen && own >= orig));
    });
    expect(wrong.map((r) => r.id)).toEqual([]);
  });

  it('gives a score for every criterion', () => {
    const first = GOLDEN.rows[0];
    if (!first) throw new Error('golden set is empty');
    expect(Object.keys(calibratedScore(first.vector).scores).sort()).toEqual([...CRITERIA].sort());
  });
});
